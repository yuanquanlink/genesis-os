import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { GENESIS_REQUIRED_CAPABILITY_IDS, genesisCapabilityRegistry } from "@/lib/domain/genesis-capabilities";
import type { DecisionIntelligenceSignalRef } from "@/lib/domain/personal-decision-intelligence";
import { DataPortabilityService } from "@/lib/services/data-portability-service";
import { KnowledgeAnalysisService } from "@/lib/services/knowledge-analysis-service";
import { LearningMaterialIntelligenceService } from "@/lib/services/learning-material-intelligence-service";
import { PersonalAbilityGrowthIntelligenceService } from "@/lib/services/personal-ability-growth-intelligence-service";
import { PersonalDecisionIntelligenceService } from "@/lib/services/personal-decision-intelligence-service";
import { PersonalDigitalTwinService } from "@/lib/services/personal-digital-twin-service";
import { PersonalKnowledgeService } from "@/lib/services/personal-knowledge-service";
import { PersonalLearningIntelligenceService } from "@/lib/services/personal-learning-intelligence-service";

const digitalTwinDimensions = [
  "learning_preference", "cognitive_patterns", "working_style", "decision_tendencies",
  "interest_evolution", "strength_signals", "weakness_signals",
] as const;

describe("Phase 3 Personal Decision Intelligence foundation", () => {
  let directory = "";
  let repository: ProfileRepository;
  let knowledge: PersonalKnowledgeService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-decision-intelligence-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    knowledge = new PersonalKnowledgeService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function upstreamCandidates(): Promise<DecisionIntelligenceSignalRef[]> {
    const capturedAt = new Date().toISOString();
    const sourceId = knowledge.createSource({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      title: "Decision review foundations", sourceType: "course", ownership: "licensed",
      originalLocator: "course:decision-review", legacyKnowledgeItemId: null, researchSourceId: null,
      provenance: { sourceIds: [], capturedAt, notes: ["Owner-selected source for candidate analysis."] },
    }).objectId;
    const artifactId = knowledge.createArtifact({
      clientRequestId: randomUUID(), createdBy: "system", validationStatus: "partial",
      sourceId, artifactType: "manifest", contentReference: "artifact://decision-review/manifest",
      extractionStatus: "partial", parser: { name: "course-manifest", version: "1", metadata: { lessons: 3 } },
      contentHash: "decision-review-manifest", extractedAt: capturedAt,
    }).objectId;
    const unitIds = [
      ["Decision context", "Decision context records constraints, uncertainty, stakeholders, and options without judging the decision maker."],
      ["Tradeoffs", "Risk, reward, and opportunity cost remain separate candidate observations until the owner reviews them."],
      ["Improvement experiments", "A decision improvement signal proposes a falsifiable experiment and required evidence rather than a personal deficiency."],
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
      request: "Prepare source-linked decision review candidates.",
    });
    const knowledgeLearningId = analysis.snapshot.learningCandidates.find(
      (candidate) => candidate.analysisCandidateId === analysis.candidateId,
    )?.id;
    if (!knowledgeLearningId) throw new Error("KNOWLEDGE_LEARNING_FIXTURE_MISSING");

    const material = new LearningMaterialIntelligenceService(repository).create({
      clientRequestId: randomUUID(), analysisCandidateId: analysis.candidateId,
      targetCapability: "Review decisions with explicit context and falsifiable evidence",
      prerequisiteGap: 0.3, availableMinutesPerWeek: 240,
    });
    const learning = new PersonalLearningIntelligenceService(repository).create({
      clientRequestId: randomUUID(), materialCandidateSetId: material.candidateSetId,
    });
    const ability = new PersonalAbilityGrowthIntelligenceService(repository).createAbilityModel({
      clientRequestId: randomUUID(), learningIntelligenceCandidateId: learning.intelligenceCandidateId,
      dimensions: [{
        dimension: "problem_solving",
        hypothesis: "Problem solving may be relevant, but no level or formal Ability change is established.",
        observationFocus: "Observe whether decision context and tradeoffs are documented before conclusions.",
        relatedStages: ["concept", "application"],
      }],
    });
    const abilityDimensionId = ability.dimensionIds?.[0];
    if (!abilityDimensionId) throw new Error("ABILITY_DIMENSION_FIXTURE_MISSING");

    const twinSignals = [
      { signalType: "learning_intelligence_candidate" as const, signalId: learning.intelligenceCandidateId },
      { signalType: "ability_dimension_candidate" as const, signalId: abilityDimensionId },
    ];
    const twin = new PersonalDigitalTwinService(repository).createCandidate({
      clientRequestId: randomUUID(),
      sourceSignals: twinSignals,
      profileDimensions: digitalTwinDimensions.map((dimension) => ({
        dimension,
        hypothesis: `${dimension} remains a reviewable candidate hypothesis and not final personal truth.`,
        sourceSignals: twinSignals,
      })),
      behaviorObservations: [{
        observation: "Available candidate records may support a review habit, but recurrence remains unverified.",
        observedAt: null, sourceSignals: twinSignals,
      }],
      preferenceCandidates: [{
        preferenceArea: "decision review",
        candidatePreference: "The owner may prefer explicit source boundaries when reviewing a decision.",
        sourceSignals: twinSignals,
      }],
      decisionPatternCandidates: [{
        context: "learning decision review",
        pattern: "The available candidates may favor review before formal state changes.",
        counterEvidenceNeeded: "Review later decisions from different contexts before confirming recurrence.",
        sourceSignals: twinSignals,
      }],
    });
    const twinDimensionId = twin.snapshot.profileDimensionCandidates[0]?.id;
    const twinPatternId = twin.snapshot.decisionPatternCandidates[0]?.id;
    const twinAggregationId = twin.aggregationId;
    if (!twinDimensionId || !twinPatternId || !twinAggregationId) throw new Error("DIGITAL_TWIN_FIXTURE_MISSING");
    return [
      { signalType: "digital_twin_aggregation_candidate", signalId: twinAggregationId },
      { signalType: "digital_twin_dimension_candidate", signalId: twinDimensionId },
      { signalType: "digital_twin_decision_pattern_candidate", signalId: twinPatternId },
      { signalType: "ability_dimension_candidate", signalId: abilityDimensionId },
      { signalType: "knowledge_analysis_candidate", signalId: analysis.candidateId },
      { signalType: "knowledge_learning_candidate", signalId: knowledgeLearningId },
    ];
  }

  function input(signals: DecisionIntelligenceSignalRef[], clientRequestId = randomUUID()) {
    return {
      clientRequestId,
      sourceSignals: signals,
      decisionHistory: [{
        decisionDescription: "Choose whether to build a small verified learning exercise before expanding scope.",
        occurredAt: null,
        optionsConsidered: ["Build the verified exercise", "Expand the unverified scope"],
        observedOutcome: null,
        sourceSignals: signals,
      }],
      contextAnalysis: {
        situation: "The owner is reviewing a learning implementation choice with incomplete outcome evidence.",
        constraints: ["Preserve existing contracts", "Use only candidate-level analysis"],
        uncertainties: ["The future value of either option is not yet verified"],
        stakeholders: ["project owner"],
        sourceSignals: signals,
      },
      choiceFactors: [
        { factorType: "risk" as const, factor: "Expanding scope may increase unverified complexity.", sourceSignals: signals },
        { factorType: "knowledge_gap" as const, factor: "Outcome evidence for both options is incomplete.", sourceSignals: signals },
      ],
      tradeoffAnalysis: {
        riskCandidates: ["The larger scope may be harder to verify."],
        rewardCandidates: ["The small exercise may produce reviewable evidence."],
        opportunityCostCandidates: ["Time spent on either option is unavailable to the other."],
        uncertaintyStatement: "No candidate establishes which option is objectively better.",
        sourceSignals: signals,
      },
      improvementSignals: [{
        signal: "Make assumptions and evidence requirements explicit before comparing options.",
        experiment: "Record one decision with options, constraints, and a later outcome review.",
        evidenceNeeded: "Owner-confirmed decision record and later outcome observation.",
        sourceSignals: signals,
      }],
    };
  }

  function formalCounts(target = repository) {
    const count = (table: string) => Number(target.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
    return {
      profileFacts: count("profile_facts"), memories: count("user_memory_profile"), memoryCandidates: count("memory_candidates"),
      evidence: count("evidence_items"), growthNodes: count("growth_nodes"), growthCandidates: count("growth_evidence_candidates"),
      abilitySnapshots: count("ability_change_snapshots"), mastery: count("mastery_certifications"),
      goals: count("learning_goals"), missions: count("missions"), plans: count("daily_plans"), strategies: count("growth_strategies"),
    };
  }

  it("connects Digital Twin, Ability, and Knowledge candidates without removing capabilities", async () => {
    const signals = await upstreamCandidates();
    const before = formalCounts();
    const created = new PersonalDecisionIntelligenceService(repository).createCandidate(input(signals));
    const snapshot = created.snapshot;

    expect(snapshot.decisionHistoryCandidates).toHaveLength(1);
    expect(snapshot.contextAnalysisCandidates).toHaveLength(1);
    expect(snapshot.choiceFactorCandidates).toHaveLength(2);
    expect(snapshot.tradeoffAnalysisCandidates).toHaveLength(1);
    expect(snapshot.improvementSignalCandidates).toHaveLength(1);
    expect(snapshot.intelligenceCandidates).toHaveLength(1);
    expect(new Set(snapshot.candidateSets[0].sourceSignals.map((signal: { sourceDomain: string }) => signal.sourceDomain)))
      .toEqual(new Set(["digital_twin", "ability", "knowledge"]));
    expect(formalCounts()).toEqual(before);
    expect(genesisCapabilityRegistry.map((item) => item.capability_id).sort())
      .toEqual([...GENESIS_REQUIRED_CAPABILITY_IDS].sort());
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0042_personal_decision_intelligence.sql'").get()).toBeTruthy();
  });

  it("keeps decision history, factors, tradeoffs, improvements, and aggregate untrusted without judging the owner", async () => {
    const snapshot = new PersonalDecisionIntelligenceService(repository)
      .createCandidate(input(await upstreamCandidates())).snapshot;
    expect(snapshot.decisionHistoryCandidates[0]).toMatchObject({
      status: "pending", trustClass: "untrusted", outcomeVerified: false,
      candidate: { outcomeVerified: false, judgementStatus: "not_judged" },
    });
    expect(snapshot.contextAnalysisCandidates[0].candidate).toMatchObject({
      analysisStatus: "candidate_analysis", contextComplete: false,
    });
    expect(snapshot.choiceFactorCandidates.every((item) =>
      item.status === "pending" && item.trustClass === "untrusted"
      && item.finalWeight === null && item.candidate.influence === "unassessed"
    )).toBe(true);
    expect(snapshot.tradeoffAnalysisCandidates[0]).toMatchObject({
      finalRecommendationAllowed: false,
      candidate: { comparisonConclusion: null, finalRecommendationAllowed: false },
    });
    expect(snapshot.improvementSignalCandidates[0]).toMatchObject({
      userDeficiencyConclusion: false,
      candidate: { improvementStatus: "candidate_signal", userDeficiencyConclusion: false },
    });
    expect(snapshot.intelligenceCandidates[0]).toMatchObject({
      automaticJudgementAllowed: false, finalTruthAllowed: false, contextEligible: false,
      status: "pending", trustClass: "untrusted",
      candidate: {
        aggregationState: "candidate_only", automaticDecisionJudgement: false,
        finalPersonalityConclusion: false, profileMutationAllowed: false,
        memoryWriteAllowed: false, abilityGrowthMutationAllowed: false,
        masteryMutationAllowed: false, contextEligible: false,
      },
    });
  });

  it("rejects missing, undeclared, and incomplete candidate sources", async () => {
    const service = new PersonalDecisionIntelligenceService(repository);
    const signals = await upstreamCandidates();
    const missing = input(signals.map((signal) => signal.signalType === "ability_dimension_candidate"
      ? { ...signal, signalId: randomUUID() }
      : signal));
    expect(() => service.createCandidate(missing)).toThrow("DECISION_PENDING_ABILITY_CANDIDATE_REQUIRED");

    const incomplete = signals.filter((signal) => signal.signalType !== "ability_dimension_candidate");
    expect(() => service.createCandidate(input(incomplete))).toThrow("DECISION_SOURCE_DOMAINS_INCOMPLETE");

    const undeclared = input(signals);
    undeclared.choiceFactors[0].sourceSignals = [{
      signalType: "knowledge_analysis_candidate", signalId: randomUUID(),
    }];
    expect(() => service.createCandidate(undeclared)).toThrow("DECISION_SIGNAL_NOT_DECLARED");
    expect(service.snapshot().candidateSets).toHaveLength(0);
  });

  it("blocks approval bypass and keeps candidates out of ContextEngine and formal user truth", async () => {
    const signals = await upstreamCandidates();
    const context = new ContextEngine(repository);
    const packet = () => JSON.stringify(context.prepare({
      currentPage: "/digital-life", currentTask: "decision candidate boundary",
      currentQuestion: "What decision information is approved?", currentChapter: null, currentConversation: [],
    }, "full").packet);
    const packetBefore = packet();
    const before = formalCounts();
    const service = new PersonalDecisionIntelligenceService(repository);
    const created = service.createCandidate(input(signals));
    const snapshot = created.snapshot;
    const ids = [
      created.candidateSetId,
      snapshot.decisionHistoryCandidates[0].id,
      snapshot.contextAnalysisCandidates[0].id,
      snapshot.choiceFactorCandidates[0].id,
      snapshot.tradeoffAnalysisCandidates[0].id,
      snapshot.improvementSignalCandidates[0].id,
      created.intelligenceId,
    ];
    const updates = [
      ["personal_decision_candidate_sets", ids[0], "status='approved'", "PERSONAL_DECISION_CANDIDATE_SET_IMMUTABLE"],
      ["decision_history_candidates", ids[1], "status='approved'", "DECISION_HISTORY_CANDIDATE_IMMUTABLE"],
      ["decision_context_analysis_candidates", ids[2], "status='approved'", "DECISION_CONTEXT_CANDIDATE_IMMUTABLE"],
      ["decision_choice_factor_candidates", ids[3], "final_weight=1", "DECISION_FACTOR_CANDIDATE_IMMUTABLE"],
      ["decision_tradeoff_analysis_candidates", ids[4], "final_recommendation_allowed=1", "DECISION_TRADEOFF_CANDIDATE_IMMUTABLE"],
      ["decision_improvement_signal_candidates", ids[5], "user_deficiency_conclusion=1", "DECISION_IMPROVEMENT_CANDIDATE_IMMUTABLE"],
      ["personal_decision_intelligence_candidates", ids[6], "context_eligible=1", "PERSONAL_DECISION_INTELLIGENCE_IMMUTABLE"],
    ];
    for (const [table, id, assignment, error] of updates) {
      expect(() => repository.db.prepare(`UPDATE ${table} SET ${assignment} WHERE id=?`).run(id)).toThrow(error);
    }
    const packetAfter = packet();
    for (const id of ids) {
      expect(packetBefore).not.toContain(id);
      expect(packetAfter).not.toContain(id);
    }
    expect(packetAfter).not.toContain("candidate_only");
    expect(formalCounts()).toEqual(before);
    expect(service.snapshot().meta).toEqual({
      deterministicFoundation: true, approvalProjection: false, contextIntegration: false,
      decisionJudgement: false, profileMutation: false, memoryMutation: false,
      abilityGrowthMutation: false, masteryMutation: false, aiSelfModification: false,
    });
  });

  it("is idempotent and restores candidates without promotion or user-state mutation", async () => {
    const service = new PersonalDecisionIntelligenceService(repository);
    const requestId = randomUUID();
    const candidateInput = input(await upstreamCandidates(), requestId);
    const first = service.createCandidate(candidateInput);
    expect(service.createCandidate(candidateInput)).toMatchObject({
      duplicate: true, candidateSetId: first.candidateSetId,
    });

    const backup = new DataPortabilityService(repository).exportJson();
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      const snapshot = new PersonalDecisionIntelligenceService(restored).snapshot();
      expect(snapshot.candidateSets).toHaveLength(1);
      expect(snapshot.intelligenceCandidates[0]).toMatchObject({
        status: "pending", trustClass: "untrusted",
        automaticJudgementAllowed: false, finalTruthAllowed: false, contextEligible: false,
      });
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
      expect(formalCounts(restored)).toEqual(formalCounts(repository));
    } finally {
      restored.close();
    }
  });
});
