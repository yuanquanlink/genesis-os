import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { DataPortabilityService } from "@/lib/services/data-portability-service";
import { PersonalKnowledgeService } from "@/lib/services/personal-knowledge-service";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";

describe("Phase 3 Personal Knowledge Layer foundation", () => {
  let directory = "";
  let repository: ProfileRepository;
  let service: PersonalKnowledgeService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-personal-knowledge-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    service = new PersonalKnowledgeService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const timestamp = () => new Date().toISOString();

  function source(overrides: Record<string, unknown> = {}) {
    return {
      clientRequestId: randomUUID(),
      createdBy: "user",
      validationStatus: "unvalidated",
      title: "Owner knowledge source",
      sourceType: "user_note",
      ownership: "user_owned",
      originalLocator: null,
      legacyKnowledgeItemId: null,
      researchSourceId: null,
      provenance: { sourceIds: [], capturedAt: timestamp(), notes: ["User-owned source."] },
      ...overrides,
    };
  }

  function formalCounts() {
    const count = (table: string) => Number((repository.db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count);
    return {
      memories: count("user_memory_profile"),
      evidence: count("evidence_items"),
      abilities: count("growth_nodes"),
      mastery: count("mastery_certifications"),
    };
  }

  it("adds migration 0036 without changing legacy knowledge_items meaning", () => {
    const legacy = new ProactiveCompanionService(repository).addKnowledge({
      type: "note",
      content: "This existing Knowledge item must keep its original schema and behavior.",
      source: "owner note",
      tags: ["compatibility"],
      clientRequestId: randomUUID(),
    }).snapshot.items[0];
    const before = repository.db.prepare("SELECT * FROM knowledge_items WHERE id=?").get(legacy.id);
    const created = service.createSource(source({
      title: "Legacy Knowledge bridge",
      legacyKnowledgeItemId: legacy.id,
      provenance: { sourceIds: [legacy.id], capturedAt: timestamp(), notes: ["Compatibility link only."] },
    }));
    const after = repository.db.prepare("SELECT * FROM knowledge_items WHERE id=?").get(legacy.id);

    expect(after).toEqual(before);
    expect(created.snapshot.sources[0]).toMatchObject({ legacyKnowledgeItemId: legacy.id, ownership: "user_owned" });
    expect(created.snapshot.sources[0].provenance.sourceIds).toContain(legacy.id);
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0036_personal_knowledge_layer.sql'").get()).toBeTruthy();
    expect((repository.db.prepare("SELECT count(*) count FROM knowledge_objects").get() as { count: number }).count).toBe(1);
  });

  it("supports all required KnowledgeSource types with ownership, locator, provenance, timestamps, and validation", () => {
    const sourceTypes = ["uploaded_file", "book", "pdf", "course", "video", "url", "github_repository", "paper", "user_note"] as const;
    for (const sourceType of sourceTypes) {
      service.createSource(source({
        sourceType,
        title: `${sourceType} source`,
        ownership: sourceType === "user_note" || sourceType === "uploaded_file" ? "user_owned" : "licensed",
        originalLocator: ["video", "url", "github_repository"].includes(sourceType) ? `https://example.com/${sourceType}` : `local:${sourceType}`,
        validationStatus: sourceType === "url" ? "needs_review" : "unvalidated",
      }));
    }
    const snapshot = service.snapshot();
    expect(new Set(snapshot.sources.map((item) => item.sourceType))).toEqual(new Set(sourceTypes));
    expect(snapshot.sources.every((item) => item.originalLocator && item.capturedAt && item.provenance)).toBe(true);
    expect(snapshot.sources.every((item) => item.approvalStatus === "not_required")).toBe(true);
    expect(snapshot.activeObjectIds).toHaveLength(sourceTypes.length);
  });

  it("persists artifacts, units, relations, collections, and membership as a traceable user-owned graph", () => {
    const sourceId = service.createSource(source({ sourceType: "pdf", title: "System Design PDF", originalLocator: "uploads/system-design.pdf" })).objectId;
    const artifactId = service.createArtifact({
      clientRequestId: randomUUID(), createdBy: "system", validationStatus: "partial",
      sourceId, artifactType: "parsed_content_reference", contentReference: "artifact://system-design/parsed-v1",
      extractionStatus: "partial", parser: { name: "pdf-parse", version: "1.1.1", metadata: { pagesSeen: 12 } },
      contentHash: "artifact-content-hash", extractedAt: timestamp(),
    }).objectId;
    const sectionId = service.createUnit({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      sourceId, artifactId, parentUnitId: null, unitType: "section", title: "Caching",
      content: "Caching reduces repeated work while introducing invalidation constraints.", originalLocator: "page:8", ordinal: 1,
    }).objectId;
    const claimId = service.createUnit({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "needs_review",
      sourceId, artifactId, parentUnitId: sectionId, unitType: "claim", title: "Invalidation claim",
      content: "Cache invalidation must follow ownership and freshness boundaries.", originalLocator: "page:9", ordinal: 2,
    }).objectId;
    const relationId = service.createRelation({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "needs_review",
      fromUnitId: claimId, toUnitId: sectionId, relationType: "derived_from",
      rationale: "The claim is derived from the source section.", sourceIds: [sourceId, artifactId],
    }).objectId;
    const collectionId = service.createCollection({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      collectionType: "project", title: "System Design Project", description: "Knowledge used by the active project.", linkedEntityId: "project:system-design",
    }).objectId;
    const memberId = service.addCollectionMember({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      collectionId, memberType: "unit", memberId: claimId, position: 1,
    }).objectId;
    const repeat = service.addCollectionMember({
      clientRequestId: repository.db.prepare("SELECT client_request_id FROM knowledge_objects WHERE id=?").pluck().get(memberId),
      createdBy: "user", validationStatus: "valid", collectionId, memberType: "unit", memberId: claimId, position: 1,
    });
    const snapshot = service.snapshot();

    expect(repeat).toMatchObject({ duplicate: true, objectId: memberId });
    expect(snapshot.artifacts[0]).toMatchObject({ id: artifactId, sourceId, extractionStatus: "partial", parser: { name: "pdf-parse", version: "1.1.1" } });
    expect(snapshot.units.map((item) => item.unitType)).toEqual(expect.arrayContaining(["section", "claim"]));
    expect(snapshot.relations[0]).toMatchObject({ id: relationId, relationType: "derived_from", sourceIds: [sourceId, artifactId] });
    expect(snapshot.collections[0]).toMatchObject({ id: collectionId, collectionType: "project" });
    expect(snapshot.collectionMembers[0]).toMatchObject({ id: memberId, collectionId, memberType: "unit", memberId: claimId });
    expect(snapshot.meta).toEqual({ readOnlyContextIntegration: false, automaticFormalWrites: false });
  });

  it("keeps AI objects pending, enforces ordered explicit decisions, and never changes formal state", () => {
    const before = formalCounts();
    const aiSource = service.createSource(source({
      createdBy: "ai", sourceType: "book", ownership: "licensed", title: "AI proposed book source",
    }));
    const sourceId = aiSource.objectId;
    const artifactId = service.createArtifact({
      clientRequestId: randomUUID(), createdBy: "ai", validationStatus: "needs_review",
      sourceId, artifactType: "metadata", contentReference: null, extractionStatus: "pending",
      parser: { name: null, version: null, metadata: {} }, contentHash: null, extractedAt: null,
    }).objectId;

    expect(aiSource.snapshot.candidates.find((item) => item.id === sourceId)).toMatchObject({ approvalStatus: "pending", createdBy: "ai" });
    expect(() => repository.db.prepare(`
      INSERT INTO knowledge_objects (
        id,user_id,client_request_id,object_type,created_by,approval_status,
        validation_status,data_kind,created_at,updated_at
      ) VALUES (?,'genesis-owner',?,'source','ai','approved','valid','test',?,?)
    `).run(randomUUID(), randomUUID(), timestamp(), timestamp())).toThrow("KNOWLEDGE_AI_CANDIDATE_REQUIRED");
    expect(() => repository.db.prepare("UPDATE knowledge_objects SET approval_status='approved' WHERE id=?").run(sourceId)).toThrow("KNOWLEDGE_APPROVAL_REQUIRED");
    expect(() => service.decide({ objectId: artifactId, action: "approve", reason: "Approve parsed metadata." })).toThrow("KNOWLEDGE_DEPENDENCY_APPROVAL_REQUIRED");
    expect(repository.db.prepare("SELECT count(*) count FROM knowledge_approval_decisions WHERE object_id=?").pluck().get(artifactId)).toBe(0);

    service.decide({ objectId: sourceId, action: "approve", reason: "Owner accepts this source into Personal Knowledge." });
    service.decide({ objectId: artifactId, action: "approve", reason: "Owner accepts the artifact metadata." });
    expect(() => service.decide({ objectId: artifactId, action: "approve", reason: "Duplicate approval." })).toThrow("KNOWLEDGE_CANDIDATE_NOT_PENDING");

    const unitId = service.createUnit({
      clientRequestId: randomUUID(), createdBy: "ai", validationStatus: "needs_review",
      sourceId, artifactId, parentUnitId: null, unitType: "concept", title: "Candidate concept",
      content: "This model-generated concept remains a candidate until the owner decides.", originalLocator: null, ordinal: 0,
    }).objectId;
    service.decide({ objectId: unitId, action: "reject", reason: "The proposed concept is not accurate enough." });
    const snapshot = service.snapshot();

    expect(snapshot.candidates.find((item) => item.id === sourceId)?.approvalStatus).toBe("approved");
    expect(snapshot.candidates.find((item) => item.id === artifactId)?.approvalStatus).toBe("approved");
    expect(snapshot.candidates.find((item) => item.id === unitId)?.approvalStatus).toBe("rejected");
    expect(snapshot.activeObjectIds).toContain(sourceId);
    expect(snapshot.activeObjectIds).toContain(artifactId);
    expect(snapshot.activeObjectIds).not.toContain(unitId);
    expect(formalCounts()).toEqual(before);
  });

  it("exports and restores approval-gated Knowledge in dependency order", () => {
    const sourceId = service.createSource(source({
      createdBy: "ai", sourceType: "course", ownership: "licensed", title: "Approved course candidate",
    })).objectId;
    service.decide({ objectId: sourceId, action: "approve", reason: "Owner approved the course source." });
    const artifactId = service.createArtifact({
      clientRequestId: randomUUID(), createdBy: "ai", validationStatus: "partial",
      sourceId, artifactType: "manifest", contentReference: "course://manifest-v1", extractionStatus: "partial",
      parser: { name: "course-manifest", version: "1", metadata: {} }, contentHash: "manifest-hash", extractedAt: timestamp(),
    }).objectId;
    service.decide({ objectId: artifactId, action: "approve", reason: "Owner approved the extracted manifest." });
    const backup = new DataPortabilityService(repository).exportJson();

    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      const result = new DataPortabilityService(restored).import(backup);
      const snapshot = new PersonalKnowledgeService(restored).snapshot();
      expect(result.inserted).toBeGreaterThan(0);
      expect(snapshot.sources.find((item) => item.id === sourceId)?.approvalStatus).toBe("approved");
      expect(snapshot.artifacts.find((item) => item.id === artifactId)?.approvalStatus).toBe("approved");
      expect(snapshot.activeObjectIds).toEqual(expect.arrayContaining([sourceId, artifactId]));
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      restored.close();
    }
  });
});
