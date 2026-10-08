import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXCLUDED_DIRECTORIES = new Set([".obsidian", "90-AI-Output"]);
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ObsidianVaultDocument = {
  relativePath: string;
  title: string | null;
  contentHash: string;
  sizeBytes: number;
  modifiedAt: string;
  metadata: Record<string, string>;
  metadataStatus: "unmanaged" | "complete" | "incomplete";
  missingMetadata: string[];
};

export type ObsidianVaultManifest = {
  schemaVersion: 1;
  vaultPath: string;
  generatedAt: string;
  snapshotHash: string;
  excludedDirectories: string[];
  documents: ObsidianVaultDocument[];
};

export type ObsidianVaultDiff = {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
};

type ScanOptions = {
  vaultPath: string;
  includeAiOutput?: boolean;
  maxFileBytes?: number;
};

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function toRelativePath(root: string, target: string) {
  const relative = path.relative(root, target);
  if (!relative || relative === ".") throw new Error("OBSIDIAN_VAULT_PATH_MUST_REFERENCE_A_FILE");
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("OBSIDIAN_VAULT_PATH_ESCAPE");
  return relative.replace(/\\/g, "/");
}

function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const metadata: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (entry) metadata[entry[1].toLowerCase()] = entry[2].replace(/^['"]|['"]$/g, "");
  }
  return metadata;
}

function documentTitle(content: string, metadata: Record<string, string>) {
  if (metadata.title) return metadata.title;
  return content.match(/^#\s+(.+?)\s*$/m)?.[1] ?? null;
}

function isRagCandidate(metadata: Record<string, string>) {
  return metadata.rag === "true"
    || metadata.agentreadable === "true"
    || ["source", "date", "capturedat", "captureddate", "summary", "application", "applicationscenario", "usecase"]
      .some((key) => Boolean(metadata[key]));
}

function missingMetadata(title: string | null, metadata: Record<string, string>) {
  if (!isRagCandidate(metadata)) return [];
  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!metadata.source) missing.push("source");
  if (!metadata.date && !metadata.capturedat && !metadata.captureddate) missing.push("date");
  if (!metadata.summary) missing.push("summary");
  if (!metadata.application && !metadata.applicationscenario && !metadata.usecase) missing.push("application");
  return missing;
}

function scanDirectory(root: string, current: string, excludedDirectories: Set<string>, maxFileBytes: number, documents: ObsidianVaultDocument[]) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) scanDirectory(root, target, excludedDirectories, maxFileBytes, documents);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
    const stat = fs.statSync(target);
    if (stat.size > maxFileBytes) continue;
    const bytes = fs.readFileSync(target);
    const content = bytes.toString("utf8");
    const metadata = parseFrontmatter(content);
    const title = documentTitle(content, metadata);
    const missing = missingMetadata(title, metadata);
    documents.push({
      relativePath: toRelativePath(root, target),
      title,
      contentHash: sha256(bytes),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      metadata,
      metadataStatus: isRagCandidate(metadata) ? (missing.length ? "incomplete" : "complete") : "unmanaged",
      missingMetadata: missing,
    });
  }
}

export function scanObsidianVault(options: ScanOptions): ObsidianVaultManifest {
  const requested = path.resolve(options.vaultPath);
  if (!fs.existsSync(requested) || !fs.statSync(requested).isDirectory()) throw new Error("OBSIDIAN_VAULT_NOT_FOUND");
  const vaultPath = fs.realpathSync(requested);
  const excludedDirectories = new Set(DEFAULT_EXCLUDED_DIRECTORIES);
  if (options.includeAiOutput) excludedDirectories.delete("90-AI-Output");
  const documents: ObsidianVaultDocument[] = [];
  scanDirectory(vaultPath, vaultPath, excludedDirectories, options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES, documents);
  documents.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  const snapshotHash = sha256(JSON.stringify(documents.map((document) => ({
    relativePath: document.relativePath,
    contentHash: document.contentHash,
  }))));
  return {
    schemaVersion: 1,
    vaultPath,
    generatedAt: new Date().toISOString(),
    snapshotHash,
    excludedDirectories: [...excludedDirectories].sort(),
    documents,
  };
}

export function diffObsidianVaultManifests(previous: ObsidianVaultManifest, current: ObsidianVaultManifest): ObsidianVaultDiff {
  if (previous.schemaVersion !== 1 || current.schemaVersion !== 1) throw new Error("OBSIDIAN_VAULT_MANIFEST_VERSION_UNSUPPORTED");
  const previousByPath = new Map(previous.documents.map((document) => [document.relativePath, document]));
  const currentByPath = new Map(current.documents.map((document) => [document.relativePath, document]));
  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  for (const [relativePath, document] of currentByPath) {
    const prior = previousByPath.get(relativePath);
    if (!prior) added.push(relativePath);
    else if (prior.contentHash !== document.contentHash) changed.push(relativePath);
    else unchanged.push(relativePath);
  }
  const removed = [...previousByPath.keys()].filter((relativePath) => !currentByPath.has(relativePath));
  return {
    added: added.sort(),
    changed: changed.sort(),
    removed: removed.sort(),
    unchanged: unchanged.sort(),
  };
}

export function readObsidianVaultManifest(manifestPath: string): ObsidianVaultManifest {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ObsidianVaultManifest;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.documents) || typeof parsed.snapshotHash !== "string") {
    throw new Error("OBSIDIAN_VAULT_MANIFEST_INVALID");
  }
  return parsed;
}
