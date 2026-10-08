import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { DataPortabilityService } from "@/lib/services/data-portability-service";
import { KnowledgeAnalysisService } from "@/lib/services/knowledge-analysis-service";
import { LearningMaterialIntelligenceService } from "@/lib/services/learning-material-intelligence-service";
import { PersonalKnowledgeService } from "@/lib/services/personal-knowledge-service";

describe("Phase 3 Learning Material Intelligence foundation", () => {
  let directory = "";
  let repository: ProfileRepository;
  let knowledge: PersonalKnowledgeService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-learning-material-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    knowledge = new PersonalKnowledgeService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function analyzedMaterial() {
    const capturedAt = new Date().toISOString();
    const sourceId = knowledge.createSource({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      title: "Reliable distributed systems", sourceType: "book", ownership: "licensed",
      originalLocator: "book:isbn-test", legacyKnowledgeItemId: null, researchSourceId: null,
      provenance: { sourceIds: [], capturedAt, notes: ["Owner-selected learning material."] },
    }).objectId;
    const artifactId = knowledge.createArtifact({
      clientRequestId: randomUUID(), createdBy: "system", validationStatus: "partial",
      sourceId, artifactType: "parsed_content_reference", contentReference: "artifact://distributed-systems/v1",
      extractionStatus: "partial", parser: { name: "book-outline", version: "1", metadata: { coverage: "selected chapters" } },
      contentHash: "book-content-hash", extractedAt: capturedAt,
    }).objectId;
    const unitIds = [
      ["Failure models", "Failure models define which faults a protocol is designed to tolerate."],
      ["Consensus safety", "Consensus safety and liveness require different evidence and assumptions."],
      ["Idempotent retries", "Idempotency prevents repeated requests from producing repeated effects."],
    ].map(([title, content], ordinal) => knowledge.createUnit({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      sourceId, artifactId, parentUnitId: null, unitType: "concept", title, content: content.repeat(8),
      originalLocator: `chapter:${ordinal + 1}`, ordinal,
    }).objectId);
    const analysis = await new KnowledgeAnalysisService(repository, {
      isRealConfigured: () => false,
      complete: async () => { throw new Error("unused"); },
    }).generate({
      clientRequestId: randomUUID(), sourceId, artifactId, unitIds,
      request: "Prepare candidate analysis for reliable systems learning.",
    });
    return { sourceId, artifactId, unitIds, analysisCandidateId: analysis.candidateId };
  }

  function formalCounts() {
    const count = (table: string) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
    return {
      goals: count("learning_goals"), paths: count("learning_paths"), timeEstimates: count("learning_time_estimates"),
      missions: count("missions"), plans: count("daily_plans"), memories: count("user_memory_profile"),
      evidence: count("evidence_items"), abilities: count("growth_nodes"), mastery: count("mastery_certifications"),
      profileFacts: count("profile_facts"),
    };
  }

  it("creates isolated Goal, Time, and five-stage Path candidates from Knowledge analysis", async () => {
    const material = await analyzedMaterial();
    const service = new LearningMaterialIntelligenceService(repository);
    const created = service.create({
      clientRequestId: randomUUID(), analysisCandidateId: material.analysisCandidateId,
      targetCapability: "Design reliable distributed services", prerequisiteGap: 0.35, availableMinutesPerWeek: 300,
    });
    const snapshot = created.snapshot;

    expect(snapshot.candidateSets[0]).toMatchObject({
      id: created.candidateSetId, analysisCandidateId: material.analysisCandidateId,
      generationMethod: "deterministic_v1", status: "pending", trustClass: "untrusted",
    });
    expect(snapshot.goalCandidates[0]).toMatchObject({
      targetCapability: "Design reliable distributed services", status: "pending", trustClass: "untrusted",
    });
    expect(snapshot.goalCandidates[0].relatedKnowledgeSourceIds).toEqual(expect.arrayContaining([material.sourceId, material.artifactId, ...material.unitIds]));
    expect(snapshot.pathCandidates[0].stages.map((stage) => stage.stage)).toEqual([
      "foundation", "concept", "application", "project", "extension",
    ]);
    expect(snapshot.pathCandidates[0].stages[3].expectedArtifact).toContain("no Mission");
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0038_learning_material_intelligence.sql'").get()).toBeTruthy();
  });

  it("estimates study workload from complexity, size, prerequisite gap, and available time without claiming mastery", async () => {
    const material = await analyzedMaterial();
    const service = new LearningMaterialIntelligenceService(repository);
    service.create({
      clientRequestId: randomUUID(), analysisCandidateId: material.analysisCandidateId,
      targetCapability: "Reliable service design", prerequisiteGap: 0, availableMinutesPerWeek: 120,
    });
    service.create({
      clientRequestId: randomUUID(), analysisCandidateId: material.analysisCandidateId,
      targetCapability: "Reliable service design", prerequisiteGap: 0.8, availableMinutesPerWeek: 600,
    });
    const [highGap, lowGap] = service.snapshot().timeCandidates;

    expect(lowGap.knowledgeSize).toMatchObject({ unitCount: 3, conceptCount: 3 });
    expect(lowGap.knowledgeSize.characterCount).toBeGreaterThan(0);
    expect(highGap.estimatedStudyHours.expected).toBeGreaterThan(lowGap.estimatedStudyHours.expected);
    expect(highGap.estimatedCalendarWeeks.expected).toBeLessThan(lowGap.estimatedCalendarWeeks.expected);
    expect(highGap.estimateKind).toBe("study_workload_not_mastery");
    expect(highGap.disclaimer).toContain("does not predict, certify, or imply actual mastery time");
    expect(highGap.assumptions).toContain("Prerequisite gap and available time are owner-supplied planning inputs, not observed mastery evidence.");
  });

  it("enforces immutable pending candidates and changes neither Context nor formal user state", async () => {
    const material = await analyzedMaterial();
    const context = new ContextEngine(repository);
    const packetBefore = JSON.stringify(context.prepare({
      currentPage: "/knowledge", currentTask: "material boundary", currentQuestion: "What is formal?", currentChapter: null, currentConversation: [],
    }, "full").packet);
    const before = formalCounts();
    const service = new LearningMaterialIntelligenceService(repository);
    const created = service.create({
      clientRequestId: randomUUID(), analysisCandidateId: material.analysisCandidateId,
      targetCapability: "Candidate-only capability", prerequisiteGap: 0.5, availableMinutesPerWeek: 240,
    });
    const packetAfter = JSON.stringify(context.prepare({
      currentPage: "/knowledge", currentTask: "material boundary", currentQuestion: "What is formal?", currentChapter: null, currentConversation: [],
    }, "full").packet);

    expect(() => repository.db.prepare("UPDATE learning_material_candidate_sets SET status='approved' WHERE id=?").run(created.candidateSetId))
      .toThrow("LEARNING_MATERIAL_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE material_learning_goal_candidates SET target_capability='Changed' WHERE candidate_set_id=?").run(created.candidateSetId))
      .toThrow("LEARNING_MATERIAL_GOAL_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE material_learning_time_candidates SET status='approved' WHERE candidate_set_id=?").run(created.candidateSetId))
      .toThrow();
    expect(() => repository.db.prepare("UPDATE material_learning_path_candidates SET status='approved' WHERE candidate_set_id=?").run(created.candidateSetId))
      .toThrow();
    expect(packetBefore).not.toContain(created.candidateSetId);
    expect(packetAfter).not.toContain(created.candidateSetId);
    expect(packetAfter).not.toContain("Candidate-only capability");
    expect(formalCounts()).toEqual(before);
    expect(created.snapshot.meta).toEqual({ deterministicFoundation: true, contextIntegration: false, approvalProjection: false, automaticFormalWrites: false });
  });

  it("rejects an analysis whose source provenance no longer resolves to trusted owner Knowledge", async () => {
    const material = await analyzedMaterial();
    repository.db.prepare("UPDATE knowledge_analysis_candidates SET source_object_ids_json=? WHERE id=?")
      .run(JSON.stringify([material.sourceId, randomUUID()]), material.analysisCandidateId);
    const service = new LearningMaterialIntelligenceService(repository);

    expect(() => service.create({
      clientRequestId: randomUUID(), analysisCandidateId: material.analysisCandidateId,
      targetCapability: "Invalid source test", prerequisiteGap: 0.2, availableMinutesPerWeek: 180,
    })).toThrow("LEARNING_MATERIAL_TRUSTED_SOURCE_REQUIRED");
    expect(service.snapshot().candidateSets).toHaveLength(0);
  });

  it("is idempotent and restores all candidates without promotion", async () => {
    const material = await analyzedMaterial();
    const service = new LearningMaterialIntelligenceService(repository);
    const clientRequestId = randomUUID();
    const first = service.create({
      clientRequestId, analysisCandidateId: material.analysisCandidateId,
      targetCapability: "Restore candidate set", prerequisiteGap: 0.25, availableMinutesPerWeek: 300,
    });
    const repeat = service.create({
      clientRequestId, analysisCandidateId: material.analysisCandidateId,
      targetCapability: "Restore candidate set", prerequisiteGap: 0.25, availableMinutesPerWeek: 300,
    });
    expect(repeat).toMatchObject({ duplicate: true, candidateSetId: first.candidateSetId });

    const backup = new DataPortabilityService(repository).exportJson();
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      const snapshot = new LearningMaterialIntelligenceService(restored).snapshot();
      expect(snapshot.candidateSets.find((item) => item.id === first.candidateSetId)).toMatchObject({ status: "pending", trustClass: "untrusted" });
      expect(snapshot.goalCandidates).toHaveLength(1);
      expect(snapshot.timeCandidates).toHaveLength(1);
      expect(snapshot.pathCandidates).toHaveLength(1);
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
      expect(restored.db.prepare("SELECT count(*) FROM learning_goals").pluck().get()).toBe(0);
      expect(restored.db.prepare("SELECT count(*) FROM missions").pluck().get()).toBe(0);
    } finally {
      restored.close();
    }
  });
});
