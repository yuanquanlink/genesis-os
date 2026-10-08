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
import { PersonalLearningIntelligenceService } from "@/lib/services/personal-learning-intelligence-service";

describe("Phase 3 Personal Learning Intelligence Core foundation", () => {
  let directory = "";
  let repository: ProfileRepository;
  let knowledge: PersonalKnowledgeService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-personal-learning-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    knowledge = new PersonalKnowledgeService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function materialCandidates() {
    const capturedAt = new Date().toISOString();
    const sourceId = knowledge.createSource({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      title: "Reliable service engineering", sourceType: "course", ownership: "licensed",
      originalLocator: "course:reliable-services", legacyKnowledgeItemId: null, researchSourceId: null,
      provenance: { sourceIds: [], capturedAt, notes: ["Owner-selected course."] },
    }).objectId;
    const artifactId = knowledge.createArtifact({
      clientRequestId: randomUUID(), createdBy: "system", validationStatus: "partial",
      sourceId, artifactType: "manifest", contentReference: "artifact://reliable-services/manifest",
      extractionStatus: "partial", parser: { name: "course-manifest", version: "1", metadata: { lessons: 3 } },
      contentHash: "course-manifest-hash", extractedAt: capturedAt,
    }).objectId;
    const unitIds = [
      ["Idempotency", "Idempotency prevents duplicate effects when operations are retried."],
      ["Failure recovery", "Recovery requires observable state, bounded retries, and durable ownership."],
      ["Service verification", "Verification uses tests, operational traces, and explicit assumptions."],
    ].map(([title, content], ordinal) => knowledge.createUnit({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      sourceId, artifactId, parentUnitId: null, unitType: "concept", title,
      content: content.repeat(6), originalLocator: `lesson:${ordinal + 1}`, ordinal,
    }).objectId);
    const analysis = await new KnowledgeAnalysisService(repository, {
      isRealConfigured: () => false,
      complete: async () => { throw new Error("unused"); },
    }).generate({
      clientRequestId: randomUUID(), sourceId, artifactId, unitIds,
      request: "Prepare reliable service learning candidates.",
    });
    const material = new LearningMaterialIntelligenceService(repository).create({
      clientRequestId: randomUUID(), analysisCandidateId: analysis.candidateId,
      targetCapability: "Design and verify reliable backend services",
      prerequisiteGap: 0.4, availableMinutesPerWeek: 300,
    });
    return { sourceId, artifactId, unitIds, analysisCandidateId: analysis.candidateId, materialCandidateSetId: material.candidateSetId };
  }

  function formalCounts() {
    const count = (table: string) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
    return {
      goals: count("learning_goals"), paths: count("learning_paths"), timeEstimates: count("learning_time_estimates"),
      missions: count("missions"), dailyPlans: count("daily_plans"), memoryCandidates: count("memory_candidates"),
      memories: count("user_memory_profile"), evidence: count("evidence_items"), abilities: count("growth_nodes"),
      mastery: count("mastery_certifications"), profileFacts: count("profile_facts"),
    };
  }

  it("aggregates Goal, Time, and Path into an untrusted Personal Learning state and recommendations", async () => {
    const material = await materialCandidates();
    const service = new PersonalLearningIntelligenceService(repository);
    const created = service.create({ clientRequestId: randomUUID(), materialCandidateSetId: material.materialCandidateSetId });
    const snapshot = created.snapshot;
    const aggregate = snapshot.intelligenceCandidates[0];
    const state = snapshot.stateCandidates[0];

    expect(aggregate).toMatchObject({
      id: created.intelligenceCandidateId, materialCandidateSetId: material.materialCandidateSetId,
      status: "pending", trustClass: "untrusted", generationMethod: "deterministic_v1",
    });
    expect(aggregate.aggregate.lineage).toMatchObject({
      materialCandidateSetId: material.materialCandidateSetId,
      analysisCandidateId: material.analysisCandidateId,
    });
    expect(aggregate.aggregate.relatedKnowledgeSourceIds).toEqual(expect.arrayContaining([material.sourceId, material.artifactId, ...material.unitIds]));
    expect(aggregate.aggregate.limitations).toContain("Study workload is not mastery time; Mastery remains governed by the eight hard Gates.");
    expect(state).toMatchObject({ id: created.stateCandidateId, status: "pending", trustClass: "untrusted" });
    expect(state.state).toMatchObject({
      state: "candidate_not_started", recommendedStartingStage: "foundation", completedStages: [],
      masteryStatus: "not_evaluated", abilityImpact: "none", memoryImpact: "none",
    });
    expect(state.state.prerequisiteReadiness.every((item) => item.status === "unknown")).toBe(true);
    expect(snapshot.recommendationCandidates).toHaveLength(4);
    expect(new Set(snapshot.recommendationCandidates.map((item) => item.recommendation.recommendationType))).toEqual(new Set([
      "starting_stage", "weekly_capacity", "prerequisite_review", "progress_evidence_prompt",
    ]));
    expect(snapshot.recommendationCandidates.every((item) => item.status === "pending" && item.trustClass === "untrusted")).toBe(true);
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0039_personal_learning_intelligence.sql'").get()).toBeTruthy();
  });

  it("prepares an unverified Evidence-compatible draft without creating or submitting Evidence", async () => {
    const material = await materialCandidates();
    const service = new PersonalLearningIntelligenceService(repository);
    const intelligence = service.create({ clientRequestId: randomUUID(), materialCandidateSetId: material.materialCandidateSetId });
    const before = formalCounts();
    const prepared = service.prepareProgressEvidence({
      clientRequestId: randomUUID(), intelligenceCandidateId: intelligence.intelligenceCandidateId,
      stage: "application", completedWork: "Implemented and tested an idempotent request handler with duplicate request replay.",
      artifactReference: "local:test-output/idempotency", observedAt: new Date().toISOString(),
      assistanceLevel: "guided", notes: "The owner still needs to verify independent transfer.",
    });
    const record = prepared.snapshot.progressEvidencePreparations[0];

    expect(record).toMatchObject({
      id: prepared.preparationId, status: "pending", trustClass: "untrusted", handoffStatus: "not_submitted",
    });
    expect(record.preparation).toMatchObject({
      stage: "application", verificationStatus: "unverified", requiresExplicitEvidenceSubmission: true,
      evidenceDraft: { action: "create", evidenceType: "learning", dataKind: "user" },
    });
    expect(record.preparation.evidenceDraft.source).toContain("not submitted");
    expect(record.preparation.limitations).toContain("This preparation stores user-reported progress and an Evidence draft only; it does not create Evidence.");
    expect(formalCounts()).toEqual(before);
  });

  it("keeps all candidates out of ContextEngine and blocks every direct promotion or rewrite", async () => {
    const material = await materialCandidates();
    const context = new ContextEngine(repository);
    const packetBefore = JSON.stringify(context.prepare({
      currentPage: "/learning", currentTask: "learning intelligence boundary", currentQuestion: "What is formal?", currentChapter: null, currentConversation: [],
    }, "full").packet);
    const before = formalCounts();
    const service = new PersonalLearningIntelligenceService(repository);
    const created = service.create({ clientRequestId: randomUUID(), materialCandidateSetId: material.materialCandidateSetId });
    const prepared = service.prepareProgressEvidence({
      clientRequestId: randomUUID(), intelligenceCandidateId: created.intelligenceCandidateId,
      stage: "foundation", completedWork: "Reviewed the prerequisite checklist but did not claim completion.",
      artifactReference: null, observedAt: new Date().toISOString(), assistanceLevel: "unknown", notes: "Candidate boundary test.",
    });
    const packetAfter = JSON.stringify(context.prepare({
      currentPage: "/learning", currentTask: "learning intelligence boundary", currentQuestion: "What is formal?", currentChapter: null, currentConversation: [],
    }, "full").packet);

    expect(() => repository.db.prepare("UPDATE personal_learning_intelligence_candidates SET status='approved' WHERE id=?").run(created.intelligenceCandidateId))
      .toThrow("PERSONAL_LEARNING_INTELLIGENCE_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE personal_learning_state_candidates SET status='approved' WHERE id=?").run(created.stateCandidateId))
      .toThrow("PERSONAL_LEARNING_STATE_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE learning_recommendation_candidates SET status='approved' WHERE intelligence_candidate_id=?").run(created.intelligenceCandidateId))
      .toThrow();
    expect(() => repository.db.prepare("UPDATE learning_progress_evidence_preparations SET handoff_status='submitted' WHERE id=?").run(prepared.preparationId))
      .toThrow();
    expect(packetBefore).not.toContain(created.intelligenceCandidateId);
    expect(packetAfter).not.toContain(created.intelligenceCandidateId);
    expect(packetAfter).not.toContain(prepared.preparationId);
    expect(packetAfter).not.toContain("Candidate boundary test");
    expect(formalCounts()).toEqual(before);
    expect(service.snapshot().meta).toEqual({
      deterministicFoundation: true, contextIntegration: false, evidenceSubmission: false,
      approvalProjection: false, automaticFormalWrites: false,
    });
  });

  it("is idempotent and restores learning intelligence and progress preparations without promotion", async () => {
    const material = await materialCandidates();
    const service = new PersonalLearningIntelligenceService(repository);
    const requestId = randomUUID();
    const first = service.create({ clientRequestId: requestId, materialCandidateSetId: material.materialCandidateSetId });
    expect(service.create({ clientRequestId: requestId, materialCandidateSetId: material.materialCandidateSetId }))
      .toMatchObject({ duplicate: true, intelligenceCandidateId: first.intelligenceCandidateId });
    const progressRequestId = randomUUID();
    const progress = service.prepareProgressEvidence({
      clientRequestId: progressRequestId, intelligenceCandidateId: first.intelligenceCandidateId,
      stage: "concept", completedWork: "Created a source-linked explanation of retry ownership boundaries.",
      artifactReference: "local:notes/retry-boundaries", observedAt: new Date().toISOString(), assistanceLevel: "independent", notes: "Awaiting Evidence review.",
    });
    expect(service.prepareProgressEvidence({
      clientRequestId: progressRequestId, intelligenceCandidateId: first.intelligenceCandidateId,
      stage: "concept", completedWork: "Created a source-linked explanation of retry ownership boundaries.",
      artifactReference: "local:notes/retry-boundaries", observedAt: new Date().toISOString(), assistanceLevel: "independent", notes: "Awaiting Evidence review.",
    })).toMatchObject({ duplicate: true, preparationId: progress.preparationId });

    const backup = new DataPortabilityService(repository).exportJson();
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      const snapshot = new PersonalLearningIntelligenceService(restored).snapshot();
      expect(snapshot.intelligenceCandidates.find((item) => item.id === first.intelligenceCandidateId)).toMatchObject({ status: "pending", trustClass: "untrusted" });
      expect(snapshot.stateCandidates).toHaveLength(1);
      expect(snapshot.recommendationCandidates).toHaveLength(4);
      expect(snapshot.progressEvidencePreparations[0]).toMatchObject({ status: "pending", handoffStatus: "not_submitted" });
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
      expect(restored.db.prepare("SELECT count(*) FROM evidence_items").pluck().get()).toBe(0);
      expect(restored.db.prepare("SELECT count(*) FROM user_memory_profile").pluck().get()).toBe(0);
      expect(restored.db.prepare("SELECT count(*) FROM mastery_certifications").pluck().get()).toBe(0);
    } finally {
      restored.close();
    }
  });
});
