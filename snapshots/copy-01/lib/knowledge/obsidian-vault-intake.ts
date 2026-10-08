import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ProfileRepository } from "@/lib/db/repository";
import { PersonalKnowledgeService } from "@/lib/services/personal-knowledge-service";
import type { ObsidianVaultDocument, ObsidianVaultManifest } from "@/lib/knowledge/obsidian-vault-scanner";

export const OBSIDIAN_VAULT_IMPORT_CONFIRMATION = "OBSIDIAN_IMPORT_CONFIRMED";

export type ObsidianVaultIntakePlanItem = {
  relativePath: string;
  title: string;
  contentHash: string;
  sourceLocator: string;
  sourceRequestId: string;
  artifactRequestId: string;
  unitRequestId: string;
};

export type ObsidianVaultIntakeResult = ObsidianVaultIntakePlanItem & {
  sourceId: string;
  artifactId: string;
  unitId: string;
  duplicate: boolean;
};

function stableUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function sourceLocator(relativePath: string) {
  return `obsidian://vault/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function requestId(document: ObsidianVaultDocument, kind: "source" | "artifact" | "unit") {
  return stableUuid(`obsidian-vault:${kind}:${document.relativePath}:${document.contentHash}`);
}

function absoluteDocumentPath(vaultPath: string, relativePath: string) {
  const root = fs.realpathSync(vaultPath);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("OBSIDIAN_IMPORT_PATH_ESCAPE");
  return target;
}

function readVerifiedDocument(manifest: ObsidianVaultManifest, document: ObsidianVaultDocument) {
  const target = absoluteDocumentPath(manifest.vaultPath, document.relativePath);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error("OBSIDIAN_IMPORT_DOCUMENT_NOT_FOUND");
  const bytes = fs.readFileSync(target);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== document.contentHash) throw new Error("OBSIDIAN_IMPORT_CONTENT_CHANGED_RESCAN_REQUIRED");
  const content = bytes.toString("utf8").trim();
  if (!content) throw new Error("OBSIDIAN_IMPORT_DOCUMENT_EMPTY");
  if (content.length > 20_000) throw new Error("OBSIDIAN_IMPORT_DOCUMENT_TOO_LARGE");
  return content;
}

function existingHash(repository: ProfileRepository, locator: string) {
  const values = repository.db.prepare(`
    SELECT artifact.content_hash AS contentHash
    FROM knowledge_sources source
    JOIN knowledge_objects object ON object.id=source.id
    JOIN knowledge_artifacts artifact ON artifact.source_id=source.id
    WHERE object.user_id=? AND source.original_locator=? AND artifact.content_hash IS NOT NULL
  `).all("genesis-owner", locator) as Array<{ contentHash: string }>;
  return new Set(values.map((value) => value.contentHash));
}

export function planObsidianVaultIntake(manifest: ObsidianVaultManifest): ObsidianVaultIntakePlanItem[] {
  if (manifest.schemaVersion !== 1) throw new Error("OBSIDIAN_IMPORT_MANIFEST_VERSION_UNSUPPORTED");
  return manifest.documents
    .filter((document) => document.metadataStatus === "complete")
    .map((document) => ({
      relativePath: document.relativePath,
      title: document.title || document.relativePath,
      contentHash: document.contentHash,
      sourceLocator: sourceLocator(document.relativePath),
      sourceRequestId: requestId(document, "source"),
      artifactRequestId: requestId(document, "artifact"),
      unitRequestId: requestId(document, "unit"),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
}

export function importObsidianVaultIntake(
  manifest: ObsidianVaultManifest,
  repository: ProfileRepository,
  confirmation: string | undefined,
): ObsidianVaultIntakeResult[] {
  if (confirmation !== OBSIDIAN_VAULT_IMPORT_CONFIRMATION) throw new Error("OBSIDIAN_IMPORT_OWNER_CONFIRMATION_REQUIRED");
  const planned = planObsidianVaultIntake(manifest);
  const documentsByPath = new Map(manifest.documents.map((document) => [document.relativePath, document]));
  const verified = planned.map((item) => {
    const document = documentsByPath.get(item.relativePath);
    if (!document) throw new Error("OBSIDIAN_IMPORT_MANIFEST_DOCUMENT_MISSING");
    const content = readVerifiedDocument(manifest, document);
    const existing = existingHash(repository, item.sourceLocator);
    if (existing.size && !existing.has(item.contentHash)) throw new Error("OBSIDIAN_IMPORT_CONTENT_VERSION_REQUIRES_REVIEW");
    return { item, document, content };
  });

  const service = new PersonalKnowledgeService(repository);
  return verified.map(({ item, document, content }) => {
    const source = service.createSource({
      clientRequestId: item.sourceRequestId,
      createdBy: "user",
      validationStatus: "valid",
      title: item.title,
      sourceType: "user_note",
      ownership: "user_owned",
      originalLocator: item.sourceLocator,
      legacyKnowledgeItemId: null,
      researchSourceId: null,
      provenance: {
        sourceIds: [],
        capturedAt: manifest.generatedAt,
        notes: ["Explicit owner-confirmed import from an Obsidian Vault manifest.", `manifest:${manifest.snapshotHash}`],
      },
    });
    const artifact = service.createArtifact({
      clientRequestId: item.artifactRequestId,
      createdBy: "system",
      validationStatus: "valid",
      sourceId: source.objectId,
      artifactType: "parsed_content_reference",
      contentReference: `obsidian-manifest://${manifest.snapshotHash}/${encodeURIComponent(document.relativePath)}`,
      extractionStatus: "completed",
      parser: { name: "obsidian-vault-scanner", version: "1", metadata: { relativePath: document.relativePath } },
      contentHash: item.contentHash,
      extractedAt: manifest.generatedAt,
    });
    const unit = service.createUnit({
      clientRequestId: item.unitRequestId,
      createdBy: "user",
      validationStatus: "valid",
      sourceId: source.objectId,
      artifactId: artifact.objectId,
      parentUnitId: null,
      unitType: "note",
      title: item.title,
      content,
      originalLocator: `${item.sourceLocator}#document`,
      ordinal: 0,
    });
    return { ...item, sourceId: source.objectId, artifactId: artifact.objectId, unitId: unit.objectId, duplicate: source.duplicate && artifact.duplicate && unit.duplicate };
  });
}
