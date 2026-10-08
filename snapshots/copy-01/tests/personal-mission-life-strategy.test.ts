import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { GENESIS_REQUIRED_CAPABILITY_IDS, genesisCapabilityRegistry } from "@/lib/domain/genesis-capabilities";
import type { MissionLifeStrategySignalRef } from "@/lib/domain/personal-mission-life-strategy";
import { DataPortabilityService } from "@/lib/services/data-portability-service";
import { PersonalMissionLifeStrategyService } from "@/lib/services/personal-mission-life-strategy-service";

const USER_ID = "genesis-owner";

describe("Phase 3 Personal Mission and Life Strategy foundation", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-mission-life-strategy-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function sourceSignals(): MissionLifeStrategySignalRef[] {
    const timestamp = new Date().toISOString();

    const twinSetId = randomUUID();
    repository.db.prepare(`INSERT INTO personal_digital_twin_candidate_sets
      (id,user_id,client_request_id,source_signal_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`)
      .run(twinSetId, USER_ID, randomUUID(), "[]", timestamp);
    const twinId = randomUUID();
    repository.db.prepare(`INSERT INTO digital_twin_aggregation_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_signal_refs_json,final_truth_allowed,
       context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,'pending','untrusted',?)`)
      .run(twinId, USER_ID, twinSetId, JSON.stringify({ aggregationState: "candidate_only" }), "[]", timestamp);

    const decisionSetId = randomUUID();
    repository.db.prepare(`INSERT INTO personal_decision_candidate_sets
      (id,user_id,client_request_id,source_candidate_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`)
      .run(decisionSetId, USER_ID, randomUUID(), "[]", timestamp);
    const decisionId = randomUUID();
    repository.db.prepare(`INSERT INTO personal_decision_intelligence_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_candidate_refs_json,automatic_judgement_allowed,
       final_truth_allowed,context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`)
      .run(decisionId, USER_ID, decisionSetId, JSON.stringify({ aggregationState: "candidate_only" }), "[]", timestamp);

    const reflectionSetId = randomUUID();
    repository.db.prepare(`INSERT INTO personal_reflection_mentor_candidate_sets
      (id,user_id,client_request_id,source_signal_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`)
      .run(reflectionSetId, USER_ID, randomUUID(), "[]", timestamp);
    const reflectionId = randomUUID();
    repository.db.prepare(`INSERT INTO personal_reflection_mentor_intelligence_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_signal_refs_json,final_user_judgement_allowed,
       final_truth_allowed,context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`)
      .run(reflectionId, USER_ID, reflectionSetId, JSON.stringify({ aggregationState: "candidate_only" }), "[]", timestamp);

    const knowledgeSourceId = randomUUID();
    repository.db.prepare(`INSERT INTO knowledge_objects
      (id,user_id,client_request_id,object_type,created_by,approval_status,validation_status,data_kind,created_at,updated_at,archived_at)
      VALUES (?,?,?,'source','user','not_required','valid','user',?,?,NULL)`)
      .run(knowledgeSourceId, USER_ID, randomUUID(), timestamp, timestamp);
    repository.db.prepare(`INSERT INTO knowledge_sources
      (id,title,source_type,ownership,original_locator,legacy_knowledge_item_id,research_source_id,provenance_json,captured_at)
      VALUES (?,'Life strategy source','user_note','user_owned',NULL,NULL,NULL,?,?)`)
      .run(knowledgeSourceId, JSON.stringify({ sourceIds: [], capturedAt: timestamp, notes: ["Owner source"] }), timestamp);
    const knowledgeId = randomUUID();
    repository.db.prepare(`INSERT INTO knowledge_analysis_candidates
      (id,user_id,client_request_id,source_id,artifact_id,ingestion_run_id,source_object_ids_json,
       analysis_json,difficulty_score,learning_value_score,confidence,provider,model,model_mode,
       prompt_version,limitations_json,status,trust_class,created_at)
      VALUES (?,?,?,?,NULL,NULL,?,?,2,0.5,0.3,'demo','deterministic-fixture','demo','test-v1',?,'pending','untrusted',?)`)
      .run(knowledgeId, USER_ID, randomUUID(), knowledgeSourceId, JSON.stringify([knowledgeSourceId]),
        JSON.stringify({ summary: "Candidate reference for mission reflection." }),
        JSON.stringify(["Test fixture remains untrusted."]), timestamp);

    return [
      { signalType: "reflection_mentor_intelligence_candidate", signalId: reflectionId },
      { signalType: "decision_intelligence_candidate", signalId: decisionId },
      { signalType: "digital_twin_aggregation_candidate", signalId: twinId },
      { signalType: "knowledge_analysis_candidate", signalId: knowledgeId },
    ];
  }

  function input(signals: MissionLifeStrategySignalRef[], clientRequestId = randomUUID()) {
    return {
      clientRequestId,
      sourceSignals: signals,
      missionCandidate: {
        purposeQuestion: "Why might this direction be worth sustained effort?",
        statementCandidate: "A possible mission is to build verifiable systems that improve learning and responsible action.",
        nonGoals: ["Treating a generated statement as permanent identity truth"],
        reviewConditions: ["Review after time-separated projects and owner-confirmed outcomes"],
        sourceSignals: signals,
      },
      longTermDirections: [{
        horizon: "three_to_five_years" as const,
        directionCandidate: "Develop reliable engineering and learning systems with measurable real-world outcomes.",
        rationaleCandidate: "Current candidates may support this direction, but they do not establish a commitment.",
        disconfirmingEvidenceNeeded: "Repeated owner-confirmed outcomes showing the direction is not useful or sustainable.",
        sourceSignals: signals,
      }],
      valueSignals: [{
        valueLabel: "verifiability",
        observationCandidate: "The available candidates may show attention to evidence and explicit review boundaries.",
        tensionQuestion: "When might speed or exploration reasonably take priority over immediate verification?",
        counterEvidenceNeeded: "Time-separated choices where verification was consistently deprioritized after owner review.",
        sourceSignals: signals,
      }],
      strategicGoals: [{
        title: "Build one independently verified personal system",
        intendedOutcomeCandidate: "A system used over time with observable outcomes and preserved approval boundaries.",
        horizon: "one_to_three_years" as const,
        successEvidenceNeeded: "Owner-confirmed usage records, outcome evidence, and an explicit review decision.",
        tradeoffQuestion: "Which other opportunity would receive less time if this Candidate became a real Goal?",
        sourceSignals: signals,
      }],
      lifeStrategyReflection: {
        whyQuestion: "Why would this work matter beyond completing another project?",
        becomingQuestion: "What kind of person might repeated evidence-bound work help the owner become?",
        priorityTensions: ["Depth versus breadth", "Long-term evidence versus short-term output"],
        assumptions: ["The candidate direction remains useful across more than one context"],
        sourceSignals: signals,
      },
      goalAlignments: [{
        opportunity: "Join a short project that promises reach but has weak verification boundaries.",
        strategicGoalTitle: "Build one independently verified personal system",
        supportingCandidates: ["The project may provide real users and deployment practice."],
        conflictingCandidates: ["Weak verification boundaries may conflict with the candidate goal's evidence requirement."],
        unknowns: ["The actual autonomy, data access, and validation process are unknown."],
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
      goals: count("learning_goals"), missionCandidates: count("mission_candidates"), missions: count("missions"),
      strategyCandidates: count("strategy_candidates"), strategies: count("growth_strategies"), plans: count("daily_plans"),
    };
  }

  it("creates isolated mission, direction, value, strategic-goal, reflection, alignment, and aggregate Candidates", () => {
    const signals = sourceSignals();
    const before = formalCounts();
    const snapshot = new PersonalMissionLifeStrategyService(repository).createCandidate(input(signals)).snapshot;

    expect(snapshot.missionCandidates).toHaveLength(1);
    expect(snapshot.longTermDirectionCandidates).toHaveLength(1);
    expect(snapshot.valueSignalCandidates).toHaveLength(1);
    expect(snapshot.strategicGoalCandidates).toHaveLength(1);
    expect(snapshot.lifeStrategyReflectionCandidates).toHaveLength(1);
    expect(snapshot.goalAlignmentCandidates).toHaveLength(1);
    expect(snapshot.intelligenceCandidates).toHaveLength(1);
    expect(new Set(snapshot.candidateSets[0].sourceSignals.map((signal: { sourceDomain: string }) => signal.sourceDomain)))
      .toEqual(new Set(["reflection", "decision", "digital_twin", "knowledge"]));
    expect(formalCounts()).toEqual(before);
    expect(genesisCapabilityRegistry.map((item) => item.capability_id).sort())
      .toEqual([...GENESIS_REQUIRED_CAPABILITY_IDS].sort());
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0044_personal_mission_life_strategy.sql'").get()).toBeTruthy();
  });

  it("keeps mission, identity, value, priority, and opportunity alignment untrusted and unassessed", () => {
    const snapshot = new PersonalMissionLifeStrategyService(repository).createCandidate(input(sourceSignals())).snapshot;
    expect(snapshot.missionCandidates[0]).toMatchObject({
      status: "pending", trustClass: "untrusted", finalMissionAllowed: false,
      candidate: { missionStatus: "candidate_hypothesis", finalMission: false },
    });
    expect(snapshot.longTermDirectionCandidates[0]).toMatchObject({
      finalDirectionAllowed: false, candidate: { finalDirection: false },
    });
    expect(snapshot.valueSignalCandidates[0]).toMatchObject({
      stableValueAllowed: false, candidate: { stableValueConclusion: false },
    });
    expect(snapshot.strategicGoalCandidates[0]).toMatchObject({
      formalGoalAllowed: false, priorityRank: null,
      candidate: { formalGoalCreated: false, priorityStatus: "unranked" },
    });
    expect(snapshot.lifeStrategyReflectionCandidates[0]).toMatchObject({
      identityConclusionAllowed: false, candidate: { finalIdentityConclusion: false },
    });
    expect(snapshot.goalAlignmentCandidates[0]).toMatchObject({
      alignmentRecommendationAllowed: false,
      candidate: { alignmentStatus: "unassessed", recommendation: null },
    });
    expect(snapshot.intelligenceCandidates[0]).toMatchObject({
      finalMissionAllowed: false, finalIdentityAllowed: false, contextEligible: false,
      status: "pending", trustClass: "untrusted",
      candidate: {
        aggregationState: "candidate_only", finalMission: false, finalIdentityConclusion: false,
        formalGoalWriteAllowed: false, formalMissionWriteAllowed: false, formalStrategyWriteAllowed: false,
        profileMutationAllowed: false, memoryWriteAllowed: false, abilityGrowthMutationAllowed: false,
        masteryMutationAllowed: false, contextEligible: false,
      },
    });
  });

  it("rejects missing, incomplete, and undeclared upstream Candidates", () => {
    const service = new PersonalMissionLifeStrategyService(repository);
    const signals = sourceSignals();
    const missing = input(signals.map((signal) => signal.signalType === "reflection_mentor_intelligence_candidate"
      ? { ...signal, signalId: randomUUID() }
      : signal));
    expect(() => service.createCandidate(missing)).toThrow("LIFE_STRATEGY_REFLECTION_CANDIDATE_REQUIRED");

    const incomplete = signals.filter((signal) => signal.signalType !== "digital_twin_aggregation_candidate");
    expect(() => service.createCandidate(input(incomplete))).toThrow("LIFE_STRATEGY_SOURCE_DOMAINS_INCOMPLETE");

    const undeclared = input(signals);
    undeclared.goalAlignments[0].sourceSignals = [{ signalType: "ability_dimension_candidate", signalId: randomUUID() }];
    expect(() => service.createCandidate(undeclared)).toThrow("LIFE_STRATEGY_SIGNAL_NOT_DECLARED");
    expect(service.snapshot().candidateSets).toHaveLength(0);
  });

  it("blocks approval bypass and keeps Candidates out of ContextEngine and formal Mission/Strategy/Profile state", () => {
    const signals = sourceSignals();
    const context = new ContextEngine(repository);
    const packet = () => JSON.stringify(context.prepare({
      currentPage: "/strategy", currentTask: "mission life strategy candidate boundary",
      currentQuestion: "What mission or direction is formally approved?", currentChapter: null, currentConversation: [],
    }, "full").packet);
    const packetBefore = packet();
    const before = formalCounts();
    const service = new PersonalMissionLifeStrategyService(repository);
    const created = service.createCandidate(input(signals));
    const snapshot = created.snapshot;
    const ids = [
      created.candidateSetId,
      snapshot.missionCandidates[0].id,
      snapshot.longTermDirectionCandidates[0].id,
      snapshot.valueSignalCandidates[0].id,
      snapshot.strategicGoalCandidates[0].id,
      snapshot.lifeStrategyReflectionCandidates[0].id,
      snapshot.goalAlignmentCandidates[0].id,
      created.intelligenceId,
    ];
    const updates = [
      ["personal_mission_life_strategy_candidate_sets", ids[0], "status='approved'", "MISSION_LIFE_STRATEGY_CANDIDATE_SET_IMMUTABLE"],
      ["personal_mission_statement_candidates", ids[1], "final_mission_allowed=1", "PERSONAL_MISSION_STATEMENT_CANDIDATE_IMMUTABLE"],
      ["long_term_direction_candidates", ids[2], "final_direction_allowed=1", "LONG_TERM_DIRECTION_CANDIDATE_IMMUTABLE"],
      ["personal_value_signal_candidates", ids[3], "stable_value_allowed=1", "PERSONAL_VALUE_SIGNAL_CANDIDATE_IMMUTABLE"],
      ["strategic_goal_direction_candidates", ids[4], "formal_goal_allowed=1", "STRATEGIC_GOAL_DIRECTION_CANDIDATE_IMMUTABLE"],
      ["life_strategy_reflection_candidates", ids[5], "identity_conclusion_allowed=1", "LIFE_STRATEGY_REFLECTION_CANDIDATE_IMMUTABLE"],
      ["goal_alignment_analysis_candidates", ids[6], "alignment_recommendation_allowed=1", "GOAL_ALIGNMENT_ANALYSIS_CANDIDATE_IMMUTABLE"],
      ["personal_mission_life_strategy_intelligence_candidates", ids[7], "context_eligible=1", "MISSION_LIFE_STRATEGY_INTELLIGENCE_IMMUTABLE"],
    ];
    for (const [table, id, assignment, error] of updates) {
      expect(() => repository.db.prepare(`UPDATE ${table} SET ${assignment} WHERE id=?`).run(id)).toThrow(error);
    }
    const packetAfter = packet();
    for (const id of ids) {
      expect(packetBefore).not.toContain(id);
      expect(packetAfter).not.toContain(id);
    }
    expect(packetAfter).not.toContain("candidate_hypothesis");
    expect(formalCounts()).toEqual(before);
    expect(service.snapshot().meta).toEqual({
      deterministicFoundation: true, providerCall: false, approvalProjection: false, contextIntegration: false,
      finalMissionDefinition: false, finalIdentityConclusion: false, formalGoalMutation: false,
      formalMissionMutation: false, formalStrategyMutation: false, profileMutation: false,
      memoryMutation: false, abilityGrowthMutation: false, masteryMutation: false, aiSelfModification: false,
    });
  });

  it("is idempotent and restores Candidates without promotion or formal-state mutation", () => {
    const service = new PersonalMissionLifeStrategyService(repository);
    const requestId = randomUUID();
    const candidateInput = input(sourceSignals(), requestId);
    const first = service.createCandidate(candidateInput);
    expect(service.createCandidate(candidateInput)).toMatchObject({ duplicate: true, candidateSetId: first.candidateSetId });

    const backup = new DataPortabilityService(repository).exportJson();
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      const snapshot = new PersonalMissionLifeStrategyService(restored).snapshot();
      expect(snapshot.candidateSets).toHaveLength(1);
      expect(snapshot.intelligenceCandidates[0]).toMatchObject({
        status: "pending", trustClass: "untrusted",
        finalMissionAllowed: false, finalIdentityAllowed: false, contextEligible: false,
      });
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
      expect(formalCounts(restored)).toEqual(formalCounts(repository));
    } finally {
      restored.close();
    }
  });
});
