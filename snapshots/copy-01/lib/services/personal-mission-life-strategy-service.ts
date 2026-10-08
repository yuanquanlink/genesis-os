import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  createPersonalMissionLifeStrategySchema,
  goalAlignmentAnalysisCandidateSchema,
  lifeStrategyReflectionCandidateSchema,
  longTermDirectionCandidateSchema,
  personalMissionLifeStrategyIntelligenceCandidateSchema,
  personalMissionStatementCandidateSchema,
  personalValueSignalCandidateSchema,
  strategicGoalDirectionCandidateSchema,
  type MissionLifeStrategySignalRef,
  type ValidatedMissionLifeStrategySignal,
} from "@/lib/domain/personal-mission-life-strategy";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function signalKey(signal: MissionLifeStrategySignalRef) {
  return `${signal.signalType}:${signal.signalId}`;
}

export class PersonalMissionLifeStrategyService {
  constructor(private readonly repository: ProfileRepository) {}

  private validateSignal(signal: MissionLifeStrategySignalRef): ValidatedMissionLifeStrategySignal {
    const exists = (sql: string) => Boolean(this.repository.db.prepare(sql).get(signal.signalId, USER_ID));
    let sourceDomain: "reflection" | "decision" | "digital_twin" | "ability" | "knowledge";
    switch (signal.signalType) {
      case "reflection_mentor_intelligence_candidate":
        sourceDomain = "reflection";
        if (!exists(`SELECT 1 FROM personal_reflection_mentor_intelligence_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
          AND final_user_judgement_allowed=0 AND final_truth_allowed=0 AND context_eligible=0`))
          throw new Error("LIFE_STRATEGY_REFLECTION_CANDIDATE_REQUIRED");
        break;
      case "decision_intelligence_candidate":
        sourceDomain = "decision";
        if (!exists(`SELECT 1 FROM personal_decision_intelligence_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
          AND automatic_judgement_allowed=0 AND final_truth_allowed=0 AND context_eligible=0`))
          throw new Error("LIFE_STRATEGY_DECISION_CANDIDATE_REQUIRED");
        break;
      case "digital_twin_aggregation_candidate":
        sourceDomain = "digital_twin";
        if (!exists(`SELECT 1 FROM digital_twin_aggregation_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
          AND final_truth_allowed=0 AND context_eligible=0`))
          throw new Error("LIFE_STRATEGY_DIGITAL_TWIN_CANDIDATE_REQUIRED");
        break;
      case "ability_dimension_candidate":
        sourceDomain = "ability";
        if (!exists(`SELECT 1 FROM ability_dimension_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("LIFE_STRATEGY_ABILITY_CANDIDATE_REQUIRED");
        break;
      case "knowledge_analysis_candidate":
        sourceDomain = "knowledge";
        if (!exists(`SELECT 1 FROM knowledge_analysis_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("LIFE_STRATEGY_KNOWLEDGE_CANDIDATE_REQUIRED");
        break;
    }
    return { ...signal, signalClass: "candidate", sourceDomain };
  }

  createCandidate(raw: unknown) {
    const input = createPersonalMissionLifeStrategySchema.parse(raw);
    const existing = this.repository.db.prepare(
      "SELECT id FROM personal_mission_life_strategy_candidate_sets WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, candidateSetId: existing.id, snapshot: this.snapshot() };

    const keys = input.sourceSignals.map(signalKey);
    if (new Set(keys).size !== keys.length) throw new Error("LIFE_STRATEGY_SIGNAL_DUPLICATE");
    const validatedSignals = new Map(input.sourceSignals.map((signal) => {
      const validated = this.validateSignal(signal);
      return [signalKey(signal), validated] as const;
    }));
    const domains = new Set([...validatedSignals.values()].map((signal) => signal.sourceDomain));
    if (!["reflection", "decision", "digital_twin"].every((domain) => domains.has(domain as "reflection" | "decision" | "digital_twin")))
      throw new Error("LIFE_STRATEGY_SOURCE_DOMAINS_INCOMPLETE");
    const requireSignals = (signals: MissionLifeStrategySignalRef[]) => signals.map((signal) => {
      const validated = validatedSignals.get(signalKey(signal));
      if (!validated) throw new Error("LIFE_STRATEGY_SIGNAL_NOT_DECLARED");
      return validated;
    });

    const mission = personalMissionStatementCandidateSchema.parse({
      ...input.missionCandidate,
      missionStatus: "candidate_hypothesis",
      finalMission: false,
      sourceSignals: requireSignals(input.missionCandidate.sourceSignals),
      limitations: ["This statement is a reviewable mission hypothesis and cannot define the owner's mission automatically."],
    });
    const directions = input.longTermDirections.map((item) => longTermDirectionCandidateSchema.parse({
      ...item,
      finalDirection: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["A long-term direction Candidate is not a commitment and requires owner review over time."],
    }));
    const values = input.valueSignals.map((item) => personalValueSignalCandidateSchema.parse({
      ...item,
      stableValueConclusion: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["A source-linked value signal cannot establish a stable personal value or identity conclusion."],
    }));
    const goals = input.strategicGoals.map((item) => strategicGoalDirectionCandidateSchema.parse({
      ...item,
      formalGoalCreated: false,
      priorityStatus: "unranked",
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["This is a Strategic Goal Candidate; no formal Goal, Mission, Strategy, or priority rank is created."],
    }));
    const reflection = lifeStrategyReflectionCandidateSchema.parse({
      ...input.lifeStrategyReflection,
      finalIdentityConclusion: false,
      sourceSignals: requireSignals(input.lifeStrategyReflection.sourceSignals),
      limitations: ["Questions about purpose and becoming remain reflection prompts, not final identity conclusions."],
    });
    const alignments = input.goalAlignments.map((item) => goalAlignmentAnalysisCandidateSchema.parse({
      ...item,
      alignmentStatus: "unassessed",
      recommendation: null,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["Opportunity alignment remains unassessed and cannot make an accept, reject, or priority recommendation."],
    }));

    const candidateSetId = randomUUID();
    const missionId = randomUUID();
    const directionIds = directions.map(() => randomUUID());
    const valueIds = values.map(() => randomUUID());
    const goalIds = goals.map(() => randomUUID());
    const reflectionId = randomUUID();
    const alignmentIds = alignments.map(() => randomUUID());
    const intelligenceId = randomUUID();
    const aggregate = personalMissionLifeStrategyIntelligenceCandidateSchema.parse({
      aggregationState: "candidate_only",
      missionCandidateId: missionId,
      longTermDirectionCandidateIds: directionIds,
      valueSignalCandidateIds: valueIds,
      strategicGoalCandidateIds: goalIds,
      lifeStrategyReflectionCandidateId: reflectionId,
      goalAlignmentCandidateIds: alignmentIds,
      sourceSignals: [...validatedSignals.values()],
      finalMission: false,
      finalIdentityConclusion: false,
      formalGoalWriteAllowed: false,
      formalMissionWriteAllowed: false,
      formalStrategyWriteAllowed: false,
      profileMutationAllowed: false,
      memoryWriteAllowed: false,
      abilityGrowthMutationAllowed: false,
      masteryMutationAllowed: false,
      contextEligible: false,
      limitations: [
        "This Mission and Life Strategy aggregate is pending/untrusted and cannot define purpose or identity automatically.",
        "All goals, directions, values, and alignment analyses remain owner-review Candidates.",
        "No ContextEngine, Profile, Memory, Ability, Growth, Mastery, formal Goal, Mission, or Strategy write is performed.",
      ],
    });
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO personal_mission_life_strategy_candidate_sets
        (id,user_id,client_request_id,source_candidate_refs_json,status,trust_class,generation_method,created_at)
        VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`)
        .run(candidateSetId, USER_ID, input.clientRequestId, JSON.stringify([...validatedSignals.values()]), timestamp);
      this.repository.db.prepare(`INSERT INTO personal_mission_statement_candidates
        (id,user_id,candidate_set_id,mission_json,source_candidate_refs_json,final_mission_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(missionId, USER_ID, candidateSetId, JSON.stringify(mission), JSON.stringify(mission.sourceSignals), timestamp);
      directions.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO long_term_direction_candidates
        (id,user_id,candidate_set_id,horizon,direction_json,source_candidate_refs_json,final_direction_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(directionIds[index], USER_ID, candidateSetId, candidate.horizon, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      values.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO personal_value_signal_candidates
        (id,user_id,candidate_set_id,value_json,source_candidate_refs_json,stable_value_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(valueIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      goals.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO strategic_goal_direction_candidates
        (id,user_id,candidate_set_id,goal_json,source_candidate_refs_json,formal_goal_allowed,priority_rank,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,NULL,'pending','untrusted',?)`)
        .run(goalIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      this.repository.db.prepare(`INSERT INTO life_strategy_reflection_candidates
        (id,user_id,candidate_set_id,reflection_json,source_candidate_refs_json,identity_conclusion_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(reflectionId, USER_ID, candidateSetId, JSON.stringify(reflection), JSON.stringify(reflection.sourceSignals), timestamp);
      alignments.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO goal_alignment_analysis_candidates
        (id,user_id,candidate_set_id,analysis_json,source_candidate_refs_json,alignment_recommendation_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(alignmentIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      this.repository.db.prepare(`INSERT INTO personal_mission_life_strategy_intelligence_candidates
        (id,user_id,candidate_set_id,aggregate_json,source_candidate_refs_json,final_mission_allowed,
         final_identity_allowed,context_eligible,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`)
        .run(intelligenceId, USER_ID, candidateSetId, JSON.stringify(aggregate), JSON.stringify(aggregate.sourceSignals), timestamp);
      this.audit("personal_mission_life_strategy.candidate_created", "personal_mission_life_strategy_candidate_set", candidateSetId, {
        status: "pending", trustClass: "untrusted", intelligenceId,
        sourceDomains: [...domains].sort(), finalMissionAllowed: false,
        finalIdentityAllowed: false, contextEligible: false, automaticFormalWrites: false,
      });
    })();
    return { duplicate: false, candidateSetId, intelligenceId, snapshot: this.snapshot() };
  }

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.repository.db.prepare(`INSERT INTO audit_logs
      (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), USER_ID, action, entityType, entityId, null, JSON.stringify(after), now());
  }

  snapshot() {
    const rows = (table: string) => this.repository.db.prepare(
      `SELECT * FROM ${table} WHERE user_id=? ORDER BY created_at DESC`,
    ).all(USER_ID) as Row[];
    return {
      candidateSets: rows("personal_mission_life_strategy_candidate_sets").map((row) => ({
        id: String(row.id), sourceSignals: parseJson(row.source_candidate_refs_json, []),
        status: String(row.status), trustClass: String(row.trust_class), generationMethod: String(row.generation_method), createdAt: String(row.created_at),
      })),
      missionCandidates: rows("personal_mission_statement_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: personalMissionStatementCandidateSchema.parse(parseJson(row.mission_json, {})),
        finalMissionAllowed: Boolean(row.final_mission_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      longTermDirectionCandidates: rows("long_term_direction_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: longTermDirectionCandidateSchema.parse(parseJson(row.direction_json, {})),
        finalDirectionAllowed: Boolean(row.final_direction_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      valueSignalCandidates: rows("personal_value_signal_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: personalValueSignalCandidateSchema.parse(parseJson(row.value_json, {})),
        stableValueAllowed: Boolean(row.stable_value_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      strategicGoalCandidates: rows("strategic_goal_direction_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: strategicGoalDirectionCandidateSchema.parse(parseJson(row.goal_json, {})),
        formalGoalAllowed: Boolean(row.formal_goal_allowed), priorityRank: row.priority_rank === null ? null : Number(row.priority_rank),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      lifeStrategyReflectionCandidates: rows("life_strategy_reflection_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: lifeStrategyReflectionCandidateSchema.parse(parseJson(row.reflection_json, {})),
        identityConclusionAllowed: Boolean(row.identity_conclusion_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      goalAlignmentCandidates: rows("goal_alignment_analysis_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: goalAlignmentAnalysisCandidateSchema.parse(parseJson(row.analysis_json, {})),
        alignmentRecommendationAllowed: Boolean(row.alignment_recommendation_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      intelligenceCandidates: rows("personal_mission_life_strategy_intelligence_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: personalMissionLifeStrategyIntelligenceCandidateSchema.parse(parseJson(row.aggregate_json, {})),
        finalMissionAllowed: Boolean(row.final_mission_allowed), finalIdentityAllowed: Boolean(row.final_identity_allowed),
        contextEligible: Boolean(row.context_eligible), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      meta: {
        deterministicFoundation: true, providerCall: false, approvalProjection: false, contextIntegration: false,
        finalMissionDefinition: false, finalIdentityConclusion: false, formalGoalMutation: false,
        formalMissionMutation: false, formalStrategyMutation: false, profileMutation: false,
        memoryMutation: false, abilityGrowthMutation: false, masteryMutation: false, aiSelfModification: false,
      },
    };
  }
}
