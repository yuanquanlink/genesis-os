import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { GENESIS_REQUIRED_CAPABILITY_IDS, genesisCapabilityRegistry } from "@/lib/domain/genesis-capabilities";
import { DataPortabilityService } from "@/lib/services/data-portability-service";
import { KnowledgeAnalysisService } from "@/lib/services/knowledge-analysis-service";
import { LearningMaterialIntelligenceService } from "@/lib/services/learning-material-intelligence-service";
import { PersonalAbilityGrowthIntelligenceService } from "@/lib/services/personal-ability-growth-intelligence-service";
import { PersonalKnowledgeService } from "@/lib/services/personal-knowledge-service";
import { PersonalLearningIntelligenceService } from "@/lib/services/personal-learning-intelligence-service";

const dimensions = [
  "technical_ability",
  "learning_ability",
  "problem_solving",
  "creativity",
  "engineering_ability",
  "communication",
  "business_understanding",
] as const;

describe("Phase 3 Personal Ability & Growth Intelligence foundation", () => {
  let directory = "";
  let repository: ProfileRepository;
  let knowledge: PersonalKnowledgeService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-ability-growth-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    knowledge = new PersonalKnowledgeService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function learningFoundation() {
    const capturedAt = new Date().toISOString();
    const sourceId = knowledge.createSource({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      title: "Reliable engineering practice", sourceType: "course", ownership: "licensed",
      originalLocator: "course:reliable-engineering", legacyKnowledgeItemId: null, researchSourceId: null,
      provenance: { sourceIds: [], capturedAt, notes: ["Owner-selected material."] },
    }).objectId;
    const artifactId = knowledge.createArtifact({
      clientRequestId: randomUUID(), createdBy: "system", validationStatus: "partial",
      sourceId, artifactType: "manifest", contentReference: "artifact://reliable-engineering/manifest",
      extractionStatus: "partial", parser: { name: "course-manifest", version: "1", metadata: { lessons: 3 } },
      contentHash: "reliable-engineering-manifest", extractedAt: capturedAt,
    }).objectId;
    const unitIds = [
      ["Failure analysis", "Failure analysis separates observed symptoms, causes, and recovery evidence."],
      ["Engineering verification", "Engineering verification uses reproducible tests and traceable artifacts."],
      ["Technical communication", "Technical communication states assumptions, constraints, and evidence clearly."],
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
      request: "Prepare evidence-bound engineering learning candidates.",
    });
    const material = new LearningMaterialIntelligenceService(repository).create({
      clientRequestId: randomUUID(), analysisCandidateId: analysis.candidateId,
      targetCapability: "Design, verify, and explain reliable services",
      prerequisiteGap: 0.45, availableMinutesPerWeek: 360,
    });
    const learning = new PersonalLearningIntelligenceService(repository).create({
      clientRequestId: randomUUID(), materialCandidateSetId: material.candidateSetId,
    });
    const progress = new PersonalLearningIntelligenceService(repository).prepareProgressEvidence({
      clientRequestId: randomUUID(), intelligenceCandidateId: learning.intelligenceCandidateId,
      stage: "application", completedWork: "Implemented a retry-safe endpoint and recorded deterministic test output.",
      artifactReference: "local:test-output/retry-safe-endpoint", observedAt: capturedAt,
      assistanceLevel: "guided", notes: "Independent transfer remains unverified.",
    });
    return {
      sourceIds: [sourceId, artifactId, ...unitIds],
      intelligenceCandidateId: learning.intelligenceCandidateId,
      progressPreparationId: progress.preparationId,
    };
  }

  function dimensionInputs() {
    return dimensions.map((dimension) => ({
      dimension,
      hypothesis: `${dimension} may be relevant to the owner-selected learning objective, subject to Evidence review.`,
      observationFocus: `Observe source-linked application work relevant to ${dimension} without assigning a level.`,
      relatedStages: dimension === "learning_ability" ? ["foundation", "concept"] as const : ["application", "project"] as const,
    }));
  }

  function formalCounts(target = repository) {
    const count = (table: string) => Number(target.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
    return {
      growthNodes: count("growth_nodes"), growthEdges: count("growth_edges"), growthCandidates: count("growth_evidence_candidates"),
      abilitySnapshots: count("ability_change_snapshots"), evidence: count("evidence_items"),
      memories: count("user_memory_profile"), memoryCandidates: count("memory_candidates"),
      mastery: count("mastery_certifications"), goals: count("learning_goals"), missions: count("missions"),
      dailyPlans: count("daily_plans"), profileFacts: count("profile_facts"), strategies: count("growth_strategies"),
    };
  }

  it("models all seven Ability dimensions as unassessed candidates without removing registered capabilities", async () => {
    const foundation = await learningFoundation();
    const service = new PersonalAbilityGrowthIntelligenceService(repository);
    const before = formalCounts();
    const created = service.createAbilityModel({
      clientRequestId: randomUUID(), learningIntelligenceCandidateId: foundation.intelligenceCandidateId,
      dimensions: dimensionInputs(),
    });
    const snapshot = created.snapshot;

    expect(snapshot.abilityDimensionCandidates).toHaveLength(7);
    expect(new Set(snapshot.abilityDimensionCandidates.map((item) => item.candidate.dimension))).toEqual(new Set(dimensions));
    expect(snapshot.abilityDimensionCandidates.every((item) =>
      item.status === "pending" && item.trustClass === "untrusted"
      && item.candidate.assessmentState === "unassessed_candidate"
      && item.candidate.currentLevel === null && item.candidate.proposedLevel === null
      && item.candidate.abilityImpact === "none"
    )).toBe(true);
    expect(snapshot.growthTrackingCandidates).toHaveLength(7);
    expect(snapshot.growthTrackingCandidates.every((item) =>
      item.tracking.trackingState === "candidate_not_active" && item.tracking.baseline === "unknown"
      && item.tracking.verifiedEvidenceIds.length === 0 && item.tracking.growthImpact === "none"
    )).toBe(true);
    expect(snapshot.abilityDimensionCandidates[0].candidate.relatedKnowledgeSourceIds)
      .toEqual(expect.arrayContaining(foundation.sourceIds));
    expect(formalCounts()).toEqual(before);
    expect(genesisCapabilityRegistry.map((item) => item.capability_id).sort())
      .toEqual([...GENESIS_REQUIRED_CAPABILITY_IDS].sort());
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0040_personal_ability_growth_intelligence.sql'").get()).toBeTruthy();
  });

  it("connects learning progress to an Ability Candidate through an unverified, not-submitted preparation", async () => {
    const foundation = await learningFoundation();
    const service = new PersonalAbilityGrowthIntelligenceService(repository);
    const model = service.createAbilityModel({
      clientRequestId: randomUUID(), learningIntelligenceCandidateId: foundation.intelligenceCandidateId,
      dimensions: dimensionInputs(),
    });
    const technical = model.snapshot.abilityDimensionCandidates.find((item) => item.candidate.dimension === "technical_ability")!;
    const before = formalCounts();
    const prepared = service.prepareAbilityEvidence({
      clientRequestId: randomUUID(), abilityDimensionCandidateId: technical.id,
      learningProgressPreparationId: foundation.progressPreparationId,
    });
    const record = prepared.snapshot.abilityEvidencePreparations[0];

    expect(prepared.snapshot.progressAbilityLinks[0]).toMatchObject({
      learningProgressPreparationId: foundation.progressPreparationId,
      abilityDimensionCandidateId: technical.id, relationType: "possible_signal",
      status: "pending", trustClass: "untrusted",
    });
    expect(record).toMatchObject({ status: "pending", trustClass: "untrusted", handoffStatus: "not_submitted" });
    expect(record.preparation).toMatchObject({
      dimension: "technical_ability", sourceStage: "application", verificationStatus: "unverified",
      requiresExplicitEvidenceSubmission: true, allowsAbilityUpdate: false, allowsGrowthUpdate: false,
      evidenceDraft: { action: "create", evidenceType: "learning", dataKind: "user" },
    });
    expect(record.preparation.evidenceDraft.source).toContain("not submitted");
    expect(formalCounts()).toEqual(before);
  });

  it("generates only unknown Growth trend candidates from absent or unverified observations", async () => {
    const foundation = await learningFoundation();
    const service = new PersonalAbilityGrowthIntelligenceService(repository);
    const model = service.createAbilityModel({
      clientRequestId: randomUUID(), learningIntelligenceCandidateId: foundation.intelligenceCandidateId,
      dimensions: dimensionInputs(),
    });
    const technical = model.snapshot.abilityDimensionCandidates.find((item) => item.candidate.dimension === "technical_ability")!;
    const before = formalCounts();
    const emptyTrend = service.generateGrowthTrend({
      clientRequestId: randomUUID(), abilityDimensionCandidateId: technical.id,
    }).snapshot.growthTrendCandidates[0];
    expect(emptyTrend.trend).toMatchObject({
      trendDirection: "unknown", numericDelta: null, assessmentState: "insufficient_data",
      observedPreparationCount: 0, verifiedEvidenceIds: [], abilityImpact: "none", growthImpact: "none", confidence: 0,
    });
    service.prepareAbilityEvidence({
      clientRequestId: randomUUID(), abilityDimensionCandidateId: technical.id,
      learningProgressPreparationId: foundation.progressPreparationId,
    });
    const observedTrend = service.generateGrowthTrend({
      clientRequestId: randomUUID(), abilityDimensionCandidateId: technical.id,
    }).snapshot.growthTrendCandidates[0];
    expect(observedTrend.trend).toMatchObject({
      trendDirection: "unknown", numericDelta: null, assessmentState: "unverified_observations_only",
      observedPreparationCount: 1, verifiedEvidenceIds: [], abilityImpact: "none", growthImpact: "none",
    });
    expect(observedTrend.formalDeltaAllowed).toBe(false);
    expect(formalCounts()).toEqual(before);
  });

  it("blocks approval bypass and keeps every Step 6 candidate out of ContextEngine and the user profile", async () => {
    const foundation = await learningFoundation();
    const context = new ContextEngine(repository);
    const packet = () => JSON.stringify(context.prepare({
      currentPage: "/growth-graph", currentTask: "ability candidate boundary",
      currentQuestion: "What is formally demonstrated?", currentChapter: null, currentConversation: [],
    }, "full").packet);
    const packetBefore = packet();
    const before = formalCounts();
    const service = new PersonalAbilityGrowthIntelligenceService(repository);
    const model = service.createAbilityModel({
      clientRequestId: randomUUID(), learningIntelligenceCandidateId: foundation.intelligenceCandidateId,
      dimensions: dimensionInputs(),
    });
    const technical = model.snapshot.abilityDimensionCandidates.find((item) => item.candidate.dimension === "technical_ability")!;
    const prepared = service.prepareAbilityEvidence({
      clientRequestId: randomUUID(), abilityDimensionCandidateId: technical.id,
      learningProgressPreparationId: foundation.progressPreparationId,
    });
    const trend = service.generateGrowthTrend({
      clientRequestId: randomUUID(), abilityDimensionCandidateId: technical.id,
    });
    const packetAfter = packet();

    expect(() => repository.db.prepare("UPDATE personal_ability_candidate_sets SET status='approved' WHERE id=?").run(model.candidateSetId))
      .toThrow("PERSONAL_ABILITY_CANDIDATE_SET_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE ability_dimension_candidates SET status='approved' WHERE id=?").run(technical.id))
      .toThrow("ABILITY_DIMENSION_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE growth_tracking_candidates SET status='approved' WHERE ability_dimension_candidate_id=?").run(technical.id))
      .toThrow("GROWTH_TRACKING_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE learning_progress_ability_candidate_links SET status='approved' WHERE id=?").run(prepared.linkId))
      .toThrow("LEARNING_PROGRESS_ABILITY_LINK_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE ability_evidence_preparations SET handoff_status='submitted' WHERE id=?").run(prepared.preparationId))
      .toThrow("ABILITY_EVIDENCE_PREPARATION_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE growth_trend_candidates SET trend_direction='positive' WHERE id=?").run(trend.trendCandidateId))
      .toThrow("GROWTH_TREND_CANDIDATE_IMMUTABLE");
    for (const id of [model.candidateSetId, technical.id, prepared.preparationId, trend.trendCandidateId]) {
      expect(packetBefore).not.toContain(id);
      expect(packetAfter).not.toContain(id);
    }
    expect(packetAfter).not.toContain("unassessed_candidate");
    expect(formalCounts()).toEqual(before);
    expect(service.snapshot().meta).toEqual({
      deterministicFoundation: true, contextIntegration: false, evidenceSubmission: false,
      approvalProjection: false, abilityMutation: false, growthMutation: false,
      masteryMutation: false, memoryMutation: false, digitalTwinMutation: false,
    });
  });

  it("is idempotent and restores Step 6 records without promotion", async () => {
    const foundation = await learningFoundation();
    const service = new PersonalAbilityGrowthIntelligenceService(repository);
    const modelRequestId = randomUUID();
    const first = service.createAbilityModel({
      clientRequestId: modelRequestId, learningIntelligenceCandidateId: foundation.intelligenceCandidateId,
      dimensions: dimensionInputs(),
    });
    expect(service.createAbilityModel({
      clientRequestId: modelRequestId, learningIntelligenceCandidateId: foundation.intelligenceCandidateId,
      dimensions: dimensionInputs(),
    })).toMatchObject({ duplicate: true, candidateSetId: first.candidateSetId });
    const technical = first.snapshot.abilityDimensionCandidates.find((item) => item.candidate.dimension === "technical_ability")!;
    const evidenceRequestId = randomUUID();
    const evidence = service.prepareAbilityEvidence({
      clientRequestId: evidenceRequestId, abilityDimensionCandidateId: technical.id,
      learningProgressPreparationId: foundation.progressPreparationId,
    });
    expect(service.prepareAbilityEvidence({
      clientRequestId: evidenceRequestId, abilityDimensionCandidateId: technical.id,
      learningProgressPreparationId: foundation.progressPreparationId,
    })).toMatchObject({ duplicate: true, preparationId: evidence.preparationId });
    const trendRequestId = randomUUID();
    const trend = service.generateGrowthTrend({ clientRequestId: trendRequestId, abilityDimensionCandidateId: technical.id });
    expect(service.generateGrowthTrend({ clientRequestId: trendRequestId, abilityDimensionCandidateId: technical.id }))
      .toMatchObject({ duplicate: true, trendCandidateId: trend.trendCandidateId });

    const backup = new DataPortabilityService(repository).exportJson();
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      const snapshot = new PersonalAbilityGrowthIntelligenceService(restored).snapshot();
      expect(snapshot.candidateSets).toHaveLength(1);
      expect(snapshot.abilityDimensionCandidates).toHaveLength(7);
      expect(snapshot.abilityDimensionCandidates.every((item) => item.status === "pending" && item.trustClass === "untrusted")).toBe(true);
      expect(snapshot.abilityEvidencePreparations[0]).toMatchObject({ status: "pending", handoffStatus: "not_submitted" });
      expect(snapshot.growthTrendCandidates[0]).toMatchObject({ trendDirection: "unknown", formalDeltaAllowed: false });
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
      expect(formalCounts(restored)).toEqual(formalCounts(repository));
    } finally {
      restored.close();
    }
  });
});
