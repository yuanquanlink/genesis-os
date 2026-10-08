import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  createPersonalDecisionIntelligenceSchema,
  decisionChoiceFactorCandidateSchema,
  decisionContextAnalysisCandidateSchema,
  decisionHistoryCandidateSchema,
  decisionImprovementSignalCandidateSchema,
  decisionTradeoffAnalysisCandidateSchema,
  personalDecisionIntelligenceCandidateSchema,
  type DecisionIntelligenceSignalRef,
  type ValidatedDecisionIntelligenceSignal,
} from "@/lib/domain/personal-decision-intelligence";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function signalKey(signal: DecisionIntelligenceSignalRef) {
  return `${signal.signalType}:${signal.signalId}`;
}

export class PersonalDecisionIntelligenceService {
  constructor(private readonly repository: ProfileRepository) {}

  private validateSignal(signal: DecisionIntelligenceSignalRef): ValidatedDecisionIntelligenceSignal {
    const exists = (sql: string) => Boolean(this.repository.db.prepare(sql).get(signal.signalId, USER_ID));
    let sourceDomain: "digital_twin" | "ability" | "knowledge";
    switch (signal.signalType) {
      case "digital_twin_aggregation_candidate":
        sourceDomain = "digital_twin";
        if (!exists(`SELECT 1 FROM digital_twin_aggregation_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
          AND final_truth_allowed=0 AND context_eligible=0`))
          throw new Error("DECISION_PENDING_DIGITAL_TWIN_AGGREGATE_REQUIRED");
        break;
      case "digital_twin_dimension_candidate":
        sourceDomain = "digital_twin";
        if (!exists(`SELECT 1 FROM digital_twin_profile_dimension_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("DECISION_PENDING_DIGITAL_TWIN_DIMENSION_REQUIRED");
        break;
      case "digital_twin_decision_pattern_candidate":
        sourceDomain = "digital_twin";
        if (!exists(`SELECT 1 FROM decision_pattern_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("DECISION_PENDING_DIGITAL_TWIN_PATTERN_REQUIRED");
        break;
      case "ability_dimension_candidate":
        sourceDomain = "ability";
        if (!exists(`SELECT 1 FROM ability_dimension_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("DECISION_PENDING_ABILITY_CANDIDATE_REQUIRED");
        break;
      case "knowledge_analysis_candidate":
        sourceDomain = "knowledge";
        if (!exists(`SELECT 1 FROM knowledge_analysis_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("DECISION_PENDING_KNOWLEDGE_ANALYSIS_REQUIRED");
        break;
      case "knowledge_learning_candidate":
        sourceDomain = "knowledge";
        if (!exists(`SELECT 1 FROM knowledge_learning_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("DECISION_PENDING_KNOWLEDGE_LEARNING_REQUIRED");
        break;
    }
    return { ...signal, signalClass: "candidate", sourceDomain };
  }

  createCandidate(raw: unknown) {
    const input = createPersonalDecisionIntelligenceSchema.parse(raw);
    const existing = this.repository.db.prepare(
      "SELECT id FROM personal_decision_candidate_sets WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, candidateSetId: existing.id, snapshot: this.snapshot() };

    const sourceKeys = input.sourceSignals.map(signalKey);
    if (new Set(sourceKeys).size !== sourceKeys.length) throw new Error("DECISION_SIGNAL_DUPLICATE");
    const validatedSignals = new Map(input.sourceSignals.map((signal) => {
      const validated = this.validateSignal(signal);
      return [signalKey(signal), validated] as const;
    }));
    const domains = new Set([...validatedSignals.values()].map((signal) => signal.sourceDomain));
    if (!["digital_twin", "ability", "knowledge"].every((domain) => domains.has(domain as "digital_twin" | "ability" | "knowledge")))
      throw new Error("DECISION_SOURCE_DOMAINS_INCOMPLETE");
    const requireSignals = (signals: DecisionIntelligenceSignalRef[]) => signals.map((signal) => {
      const validated = validatedSignals.get(signalKey(signal));
      if (!validated) throw new Error("DECISION_SIGNAL_NOT_DECLARED");
      return validated;
    });

    const history = input.decisionHistory.map((item) => decisionHistoryCandidateSchema.parse({
      ...item,
      outcomeVerified: false,
      judgementStatus: "not_judged",
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["A recalled decision and observed outcome are unverified candidate history, not a judgement of the owner."],
    }));
    const context = decisionContextAnalysisCandidateSchema.parse({
      ...input.contextAnalysis,
      analysisStatus: "candidate_analysis",
      contextComplete: false,
      sourceSignals: requireSignals(input.contextAnalysis.sourceSignals),
      limitations: ["Decision context is necessarily incomplete and requires owner review before interpretation."],
    });
    const factors = input.choiceFactors.map((item) => decisionChoiceFactorCandidateSchema.parse({
      ...item,
      influence: "unassessed",
      finalWeight: null,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["The factor is extracted as a candidate only; no importance, direction, or user preference is asserted."],
    }));
    const tradeoff = decisionTradeoffAnalysisCandidateSchema.parse({
      ...input.tradeoffAnalysis,
      comparisonConclusion: null,
      finalRecommendationAllowed: false,
      sourceSignals: requireSignals(input.tradeoffAnalysis.sourceSignals),
      limitations: ["Risk, reward, and opportunity cost entries are candidates, not a recommendation or outcome prediction."],
    });
    const improvements = input.improvementSignals.map((item) => decisionImprovementSignalCandidateSchema.parse({
      ...item,
      improvementStatus: "candidate_signal",
      userDeficiencyConclusion: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["An improvement signal proposes a reviewable experiment and does not diagnose a user deficiency."],
    }));

    const candidateSetId = randomUUID();
    const historyIds = history.map(() => randomUUID());
    const contextId = randomUUID();
    const factorIds = factors.map(() => randomUUID());
    const tradeoffId = randomUUID();
    const improvementIds = improvements.map(() => randomUUID());
    const intelligenceId = randomUUID();
    const aggregate = personalDecisionIntelligenceCandidateSchema.parse({
      aggregationState: "candidate_only",
      decisionHistoryCandidateIds: historyIds,
      contextAnalysisCandidateId: contextId,
      choiceFactorCandidateIds: factorIds,
      tradeoffAnalysisCandidateId: tradeoffId,
      improvementSignalCandidateIds: improvementIds,
      sourceSignals: [...validatedSignals.values()],
      automaticDecisionJudgement: false,
      finalPersonalityConclusion: false,
      profileMutationAllowed: false,
      memoryWriteAllowed: false,
      abilityGrowthMutationAllowed: false,
      masteryMutationAllowed: false,
      contextEligible: false,
      limitations: [
        "This aggregate is pending and untrusted; it cannot judge decisions or become final personal truth.",
        "Digital Twin, Ability, and Knowledge candidates preserve their original candidate trust class.",
        "No ContextEngine, Profile, Memory, Ability, Growth, Evidence, or Mastery mutation is performed.",
      ],
    });
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO personal_decision_candidate_sets
        (id,user_id,client_request_id,source_candidate_refs_json,status,trust_class,generation_method,created_at)
        VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`)
        .run(candidateSetId, USER_ID, input.clientRequestId, JSON.stringify([...validatedSignals.values()]), timestamp);
      history.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO decision_history_candidates
        (id,user_id,candidate_set_id,history_json,source_candidate_refs_json,outcome_verified,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(historyIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      this.repository.db.prepare(`INSERT INTO decision_context_analysis_candidates
        (id,user_id,candidate_set_id,analysis_json,source_candidate_refs_json,status,trust_class,created_at)
        VALUES (?,?,?,?,?,'pending','untrusted',?)`)
        .run(contextId, USER_ID, candidateSetId, JSON.stringify(context), JSON.stringify(context.sourceSignals), timestamp);
      factors.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO decision_choice_factor_candidates
        (id,user_id,candidate_set_id,factor_type,factor_json,source_candidate_refs_json,final_weight,status,trust_class,created_at)
        VALUES (?,?,?,?,?,?,NULL,'pending','untrusted',?)`)
        .run(factorIds[index], USER_ID, candidateSetId, candidate.factorType, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      this.repository.db.prepare(`INSERT INTO decision_tradeoff_analysis_candidates
        (id,user_id,candidate_set_id,analysis_json,source_candidate_refs_json,final_recommendation_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(tradeoffId, USER_ID, candidateSetId, JSON.stringify(tradeoff), JSON.stringify(tradeoff.sourceSignals), timestamp);
      improvements.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO decision_improvement_signal_candidates
        (id,user_id,candidate_set_id,signal_json,source_candidate_refs_json,user_deficiency_conclusion,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(improvementIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      this.repository.db.prepare(`INSERT INTO personal_decision_intelligence_candidates
        (id,user_id,candidate_set_id,aggregate_json,source_candidate_refs_json,automatic_judgement_allowed,
         final_truth_allowed,context_eligible,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`)
        .run(intelligenceId, USER_ID, candidateSetId, JSON.stringify(aggregate), JSON.stringify(aggregate.sourceSignals), timestamp);
      this.audit("personal_decision_intelligence.candidate_created", "personal_decision_candidate_set", candidateSetId, {
        status: "pending", trustClass: "untrusted", intelligenceId,
        sourceDomains: [...domains].sort(), automaticJudgementAllowed: false,
        finalTruthAllowed: false, contextEligible: false, automaticFormalWrites: false,
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
      candidateSets: rows("personal_decision_candidate_sets").map((row) => ({
        id: String(row.id), sourceSignals: parseJson(row.source_candidate_refs_json, []),
        status: String(row.status), trustClass: String(row.trust_class), generationMethod: String(row.generation_method), createdAt: String(row.created_at),
      })),
      decisionHistoryCandidates: rows("decision_history_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: decisionHistoryCandidateSchema.parse(parseJson(row.history_json, {})),
        outcomeVerified: Boolean(row.outcome_verified), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      contextAnalysisCandidates: rows("decision_context_analysis_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: decisionContextAnalysisCandidateSchema.parse(parseJson(row.analysis_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      choiceFactorCandidates: rows("decision_choice_factor_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: decisionChoiceFactorCandidateSchema.parse(parseJson(row.factor_json, {})),
        finalWeight: row.final_weight === null ? null : Number(row.final_weight), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      tradeoffAnalysisCandidates: rows("decision_tradeoff_analysis_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: decisionTradeoffAnalysisCandidateSchema.parse(parseJson(row.analysis_json, {})),
        finalRecommendationAllowed: Boolean(row.final_recommendation_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      improvementSignalCandidates: rows("decision_improvement_signal_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: decisionImprovementSignalCandidateSchema.parse(parseJson(row.signal_json, {})),
        userDeficiencyConclusion: Boolean(row.user_deficiency_conclusion), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      intelligenceCandidates: rows("personal_decision_intelligence_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: personalDecisionIntelligenceCandidateSchema.parse(parseJson(row.aggregate_json, {})),
        automaticJudgementAllowed: Boolean(row.automatic_judgement_allowed),
        finalTruthAllowed: Boolean(row.final_truth_allowed), contextEligible: Boolean(row.context_eligible),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      meta: {
        deterministicFoundation: true, approvalProjection: false, contextIntegration: false,
        decisionJudgement: false, profileMutation: false, memoryMutation: false,
        abilityGrowthMutation: false, masteryMutation: false, aiSelfModification: false,
      },
    };
  }
}
