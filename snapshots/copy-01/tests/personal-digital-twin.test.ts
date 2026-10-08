import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { GENESIS_REQUIRED_CAPABILITY_IDS, genesisCapabilityRegistry } from "@/lib/domain/genesis-capabilities";
import type { DigitalTwinSignalRef } from "@/lib/domain/personal-digital-twin";
import { demoExtractCandidates, selfEntryInputSchema } from "@/lib/domain/profile";
import { DataPortabilityService } from "@/lib/services/data-portability-service";
import { KnowledgeAnalysisService } from "@/lib/services/knowledge-analysis-service";
import { LearningMaterialIntelligenceService } from "@/lib/services/learning-material-intelligence-service";
import { PersonalAbilityGrowthIntelligenceService } from "@/lib/services/personal-ability-growth-intelligence-service";
import { PersonalDigitalTwinService } from "@/lib/services/personal-digital-twin-service";
import { PersonalKnowledgeService } from "@/lib/services/personal-knowledge-service";
import { PersonalLearningIntelligenceService } from "@/lib/services/personal-learning-intelligence-service";

const profileDimensions = [
  "learning_preference",
  "cognitive_patterns",
  "working_style",
  "decision_tendencies",
  "interest_evolution",
  "strength_signals",
  "weakness_signals",
] as const;

describe("Phase 3 Personal Digital Twin foundation", () => {
  let directory = "";
  let repository: ProfileRepository;
  let knowledge: PersonalKnowledgeService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-digital-twin-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    knowledge = new PersonalKnowledgeService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function sourceSignals(): Promise<DigitalTwinSignalRef[]> {
    const capturedAt = new Date().toISOString();
    const profileInput = selfEntryInputSchema.parse({
      content: "I am testing a source-linked learning workflow and want every personal conclusion to remain reviewable.",
      category: "learning", tags: ["review"], importance: 4, occurredAt: capturedAt,
      allowAi: true, clientRequestId: randomUUID(),
    });
    const entry = repository.createEntry(profileInput);
    const proposals = repository.createProposals(entry.id, demoExtractCandidates(profileInput), "demo");
    repository.decideProposal(proposals[0].id, "approve");
    const profileFactId = repository.snapshot().facts[0].id;

    const sourceId = knowledge.createSource({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      title: "Reviewable learning workflow", sourceType: "course", ownership: "licensed",
      originalLocator: "course:reviewable-learning", legacyKnowledgeItemId: null, researchSourceId: null,
      provenance: { sourceIds: [], capturedAt, notes: ["Owner-selected material."] },
    }).objectId;
    const artifactId = knowledge.createArtifact({
      clientRequestId: randomUUID(), createdBy: "system", validationStatus: "partial",
      sourceId, artifactType: "manifest", contentReference: "artifact://reviewable-learning/manifest",
      extractionStatus: "partial", parser: { name: "course-manifest", version: "1", metadata: { lessons: 3 } },
      contentHash: "reviewable-learning-manifest", extractedAt: capturedAt,
    }).objectId;
    const unitIds = [
      ["Source review", "Source review preserves observations separately from personal conclusions."],
      ["Counterevidence", "Counterevidence is required before treating repeated observations as stable patterns."],
      ["Decision records", "Decision records retain context and avoid turning one choice into a personality claim."],
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
      request: "Prepare reviewable learning candidates.",
    });
    const material = new LearningMaterialIntelligenceService(repository).create({
      clientRequestId: randomUUID(), analysisCandidateId: analysis.candidateId,
      targetCapability: "Use source-linked review in learning and engineering decisions",
      prerequisiteGap: 0.35, availableMinutesPerWeek: 300,
    });
    const learning = new PersonalLearningIntelligenceService(repository).create({
      clientRequestId: randomUUID(), materialCandidateSetId: material.candidateSetId,
    });
    const ability = new PersonalAbilityGrowthIntelligenceService(repository);
    const abilityModel = ability.createAbilityModel({
      clientRequestId: randomUUID(), learningIntelligenceCandidateId: learning.intelligenceCandidateId,
      dimensions: [{
        dimension: "learning_ability",
        hypothesis: "Learning ability may be relevant, but no level or stable trait is established.",
        observationFocus: "Observe source review and counterevidence use without assigning an Ability level.",
        relatedStages: ["foundation", "concept"],
      }],
    });
    if (!abilityModel.dimensionIds?.[0]) throw new Error("ABILITY_DIMENSION_FIXTURE_MISSING");
    const abilityDimensionId = abilityModel.dimensionIds[0];
    const growthTrendId = ability.generateGrowthTrend({
      clientRequestId: randomUUID(), abilityDimensionCandidateId: abilityDimensionId,
    }).trendCandidateId;
    return [
      { signalType: "approved_profile_fact", signalId: profileFactId },
      { signalType: "learning_intelligence_candidate", signalId: learning.intelligenceCandidateId },
      { signalType: "ability_dimension_candidate", signalId: abilityDimensionId },
      { signalType: "growth_trend_candidate", signalId: growthTrendId },
    ];
  }

  function candidateInput(signals: Awaited<ReturnType<typeof sourceSignals>>, clientRequestId = randomUUID()) {
    return {
      clientRequestId,
      sourceSignals: signals,
      profileDimensions: profileDimensions.map((dimension) => ({
        dimension,
        hypothesis: `${dimension} is a reviewable hypothesis supported by declared signals, not final personal truth.`,
        sourceSignals: signals,
      })),
      behaviorObservations: [{
        observation: "The available records may indicate repeated source-review behavior, but recurrence is unverified.",
        observedAt: null,
        sourceSignals: signals,
      }],
      preferenceCandidates: [{
        preferenceArea: "learning workflow",
        candidatePreference: "The owner may prefer source-linked, reviewable learning records.",
        sourceSignals: signals,
      }],
      decisionPatternCandidates: [{
        context: "learning workflow selection",
        pattern: "The available records may favor explicit review boundaries before formal state changes.",
        counterEvidenceNeeded: "Review decisions from different contexts and later time periods before confirming recurrence.",
        sourceSignals: signals,
      }],
    };
  }

  function formalCounts(target = repository) {
    const count = (table: string) => Number(target.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
    return {
      profileFacts: count("profile_facts"), profileVersions: count("profile_fact_versions"),
      memoryCandidates: count("memory_candidates"), memories: count("user_memory_profile"),
      evidence: count("evidence_items"), growthNodes: count("growth_nodes"), growthCandidates: count("growth_evidence_candidates"),
      abilitySnapshots: count("ability_change_snapshots"), mastery: count("mastery_certifications"),
      goals: count("learning_goals"), missions: count("missions"), dailyPlans: count("daily_plans"), strategies: count("growth_strategies"),
    };
  }

  it("creates all seven profile dimensions from approved and candidate signals without removing capabilities", async () => {
    const signals = await sourceSignals();
    const before = formalCounts();
    const created = new PersonalDigitalTwinService(repository).createCandidate(candidateInput(signals));
    const snapshot = created.snapshot;

    expect(snapshot.profileDimensionCandidates).toHaveLength(7);
    expect(new Set(snapshot.profileDimensionCandidates.map((item) => item.candidate.dimension))).toEqual(new Set(profileDimensions));
    expect(snapshot.profileDimensionCandidates.every((item) =>
      item.status === "pending" && item.trustClass === "untrusted"
      && item.candidate.truthStatus === "candidate_hypothesis" && item.candidate.finalTruth === false
      && item.candidate.confidence <= 0.5
    )).toBe(true);
    expect(new Set(snapshot.candidateSets[0].sourceSignals.map((item: { signalClass: string }) => item.signalClass)))
      .toEqual(new Set(["approved", "candidate"]));
    expect(formalCounts()).toEqual(before);
    expect(genesisCapabilityRegistry.map((item) => item.capability_id).sort())
      .toEqual([...GENESIS_REQUIRED_CAPABILITY_IDS].sort());
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0041_personal_digital_twin_foundation.sql'").get()).toBeTruthy();
  });

  it("keeps behavior, preference, decision, and aggregate output candidate-only", async () => {
    const signals = await sourceSignals();
    const snapshot = new PersonalDigitalTwinService(repository).createCandidate(candidateInput(signals)).snapshot;
    expect(snapshot.behaviorObservationCandidates[0].candidate).toMatchObject({
      observationStatus: "unverified_candidate", confirmedBehavior: false,
    });
    expect(snapshot.preferenceCandidates[0].candidate).toMatchObject({
      stability: "unknown", confirmedPreference: false,
    });
    expect(snapshot.decisionPatternCandidates[0].candidate).toMatchObject({
      recurrence: "unverified", confirmedPattern: false,
    });
    expect(snapshot.aggregationCandidates[0]).toMatchObject({
      status: "pending", trustClass: "untrusted", finalTruthAllowed: false, contextEligible: false,
      aggregate: {
        aggregationState: "candidate_only", finalPersonalityTruth: false,
        profileMutationAllowed: false, memoryWriteAllowed: false,
        abilityGrowthMutationAllowed: false, masteryMutationAllowed: false, contextEligible: false,
      },
    });
  });

  it("rejects missing approval, rejected-equivalent, and undeclared signals", async () => {
    const service = new PersonalDigitalTwinService(repository);
    const missingApproved = [{ signalType: "approved_memory" as const, signalId: randomUUID() }];
    expect(() => service.createCandidate(candidateInput(missingApproved)))
      .toThrow("DIGITAL_TWIN_APPROVED_MEMORY_REQUIRED");

    const signals = await sourceSignals();
    const undeclared = candidateInput(signals);
    undeclared.profileDimensions[0].sourceSignals = [
      { signalType: "memory_candidate" as const, signalId: randomUUID() },
    ];
    expect(() => service.createCandidate(undeclared)).toThrow("DIGITAL_TWIN_SIGNAL_NOT_DECLARED");
    expect(service.snapshot().candidateSets).toHaveLength(0);
  });

  it("blocks every approval bypass and keeps Digital Twin candidates out of ContextEngine and formal state", async () => {
    const signals = await sourceSignals();
    const context = new ContextEngine(repository);
    const packet = () => JSON.stringify(context.prepare({
      currentPage: "/digital-life", currentTask: "digital twin candidate boundary",
      currentQuestion: "What is approved personal truth?", currentChapter: null, currentConversation: [],
    }, "full").packet);
    const packetBefore = packet();
    const before = formalCounts();
    const service = new PersonalDigitalTwinService(repository);
    const created = service.createCandidate(candidateInput(signals));
    const snapshot = created.snapshot;
    const dimensionId = snapshot.profileDimensionCandidates[0].id;
    const observationId = snapshot.behaviorObservationCandidates[0].id;
    const preferenceId = snapshot.preferenceCandidates[0].id;
    const decisionId = snapshot.decisionPatternCandidates[0].id;
    const packetAfter = packet();

    expect(() => repository.db.prepare("UPDATE personal_digital_twin_candidate_sets SET status='approved' WHERE id=?").run(created.candidateSetId))
      .toThrow("DIGITAL_TWIN_CANDIDATE_SET_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE digital_twin_profile_dimension_candidates SET status='approved' WHERE id=?").run(dimensionId))
      .toThrow("DIGITAL_TWIN_DIMENSION_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE personal_behavior_observation_candidates SET status='approved' WHERE id=?").run(observationId))
      .toThrow("BEHAVIOR_OBSERVATION_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE personal_preference_candidates SET status='approved' WHERE id=?").run(preferenceId))
      .toThrow("PERSONAL_PREFERENCE_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE decision_pattern_candidates SET status='approved' WHERE id=?").run(decisionId))
      .toThrow("DECISION_PATTERN_CANDIDATE_IMMUTABLE");
    expect(() => repository.db.prepare("UPDATE digital_twin_aggregation_candidates SET context_eligible=1 WHERE id=?").run(created.aggregationId))
      .toThrow("DIGITAL_TWIN_AGGREGATION_CANDIDATE_IMMUTABLE");
    for (const id of [created.candidateSetId, created.aggregationId, dimensionId, observationId, preferenceId, decisionId]) {
      expect(packetBefore).not.toContain(id);
      expect(packetAfter).not.toContain(id);
    }
    expect(packetAfter).not.toContain("candidate_only");
    expect(formalCounts()).toEqual(before);
    expect(service.snapshot().meta).toEqual({
      deterministicFoundation: true, approvalProjection: false, contextIntegration: false,
      profileMutation: false, memoryMutation: false, abilityGrowthMutation: false,
      masteryMutation: false, aiSelfModification: false,
    });
  });

  it("is idempotent and restores Digital Twin candidates without promotion", async () => {
    const signals = await sourceSignals();
    const service = new PersonalDigitalTwinService(repository);
    const requestId = randomUUID();
    const first = service.createCandidate(candidateInput(signals, requestId));
    expect(service.createCandidate(candidateInput(signals, requestId)))
      .toMatchObject({ duplicate: true, candidateSetId: first.candidateSetId });

    const backup = new DataPortabilityService(repository).exportJson();
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      const snapshot = new PersonalDigitalTwinService(restored).snapshot();
      expect(snapshot.candidateSets).toHaveLength(1);
      expect(snapshot.profileDimensionCandidates).toHaveLength(7);
      expect(snapshot.profileDimensionCandidates.every((item) => item.status === "pending" && item.trustClass === "untrusted")).toBe(true);
      expect(snapshot.aggregationCandidates[0]).toMatchObject({
        status: "pending", trustClass: "untrusted", finalTruthAllowed: false, contextEligible: false,
      });
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
      expect(formalCounts(restored)).toEqual(formalCounts(repository));
    } finally {
      restored.close();
    }
  });
});
