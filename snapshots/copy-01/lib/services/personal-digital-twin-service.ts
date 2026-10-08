import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  behaviorObservationCandidateSchema,
  createDigitalTwinCandidateSchema,
  decisionPatternCandidateSchema,
  digitalTwinAggregationCandidateSchema,
  digitalTwinProfileDimensionCandidateSchema,
  digitalTwinProfileDimensionLabels,
  personalPreferenceCandidateSchema,
  type DigitalTwinSignalRef,
  type ValidatedDigitalTwinSignal,
} from "@/lib/domain/personal-digital-twin";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function signalKey(signal: DigitalTwinSignalRef) {
  return `${signal.signalType}:${signal.signalId}`;
}

export class PersonalDigitalTwinService {
  constructor(private readonly repository: ProfileRepository) {}

  private validateSignal(signal: DigitalTwinSignalRef): ValidatedDigitalTwinSignal {
    const db = this.repository.db;
    const exists = (sql: string) => Boolean(db.prepare(sql).get(signal.signalId, USER_ID));
    let signalClass: "approved" | "candidate";
    switch (signal.signalType) {
      case "approved_profile_fact":
        signalClass = "approved";
        if (!exists("SELECT 1 FROM profile_facts WHERE id=? AND user_id=? AND is_active=1 AND user_confirmed=1 AND deleted_at IS NULL"))
          throw new Error("DIGITAL_TWIN_APPROVED_PROFILE_FACT_REQUIRED");
        break;
      case "approved_memory":
        signalClass = "approved";
        if (!exists(`
          SELECT 1 FROM user_memory_profile memory
          JOIN memory_candidates candidate ON candidate.id=memory.source_candidate_id
          WHERE memory.id=? AND memory.user_id=? AND memory.status='active' AND candidate.status='approved'
        `)) throw new Error("DIGITAL_TWIN_APPROVED_MEMORY_REQUIRED");
        break;
      case "verified_evidence":
        signalClass = "approved";
        if (!exists("SELECT 1 FROM evidence_items WHERE id=? AND user_id=? AND verification_status='verified'"))
          throw new Error("DIGITAL_TWIN_VERIFIED_EVIDENCE_REQUIRED");
        break;
      case "formal_ability":
        signalClass = "approved";
        if (!exists("SELECT 1 FROM growth_nodes WHERE id=? AND user_id=? AND node_type='ability' AND status='active'"))
          throw new Error("DIGITAL_TWIN_FORMAL_ABILITY_REQUIRED");
        break;
      case "memory_candidate":
        signalClass = "candidate";
        if (!exists("SELECT 1 FROM memory_candidates WHERE id=? AND user_id=? AND status='pending'"))
          throw new Error("DIGITAL_TWIN_PENDING_MEMORY_CANDIDATE_REQUIRED");
        break;
      case "learning_intelligence_candidate":
        signalClass = "candidate";
        if (!exists("SELECT 1 FROM personal_learning_intelligence_candidates WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'"))
          throw new Error("DIGITAL_TWIN_LEARNING_CANDIDATE_REQUIRED");
        break;
      case "ability_dimension_candidate":
        signalClass = "candidate";
        if (!exists("SELECT 1 FROM ability_dimension_candidates WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'"))
          throw new Error("DIGITAL_TWIN_ABILITY_CANDIDATE_REQUIRED");
        break;
      case "growth_trend_candidate":
        signalClass = "candidate";
        if (!exists("SELECT 1 FROM growth_trend_candidates WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted' AND trend_direction='unknown' AND formal_delta_allowed=0"))
          throw new Error("DIGITAL_TWIN_GROWTH_TREND_CANDIDATE_REQUIRED");
        break;
    }
    return { ...signal, signalClass };
  }

  createCandidate(raw: unknown) {
    const input = createDigitalTwinCandidateSchema.parse(raw);
    const existing = this.repository.db.prepare(
      "SELECT id FROM personal_digital_twin_candidate_sets WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, candidateSetId: existing.id, snapshot: this.snapshot() };
    const sourceKeys = input.sourceSignals.map(signalKey);
    if (new Set(sourceKeys).size !== sourceKeys.length) throw new Error("DIGITAL_TWIN_SIGNAL_DUPLICATE");
    const validatedSignals = new Map(input.sourceSignals.map((signal) => {
      const validated = this.validateSignal(signal);
      return [signalKey(signal), validated] as const;
    }));
    const requireSignals = (signals: DigitalTwinSignalRef[]) => signals.map((signal) => {
      const validated = validatedSignals.get(signalKey(signal));
      if (!validated) throw new Error("DIGITAL_TWIN_SIGNAL_NOT_DECLARED");
      return validated;
    });
    const dimensionTypes = input.profileDimensions.map((item) => item.dimension);
    if (new Set(dimensionTypes).size !== 7) throw new Error("DIGITAL_TWIN_DIMENSIONS_INCOMPLETE");

    const dimensions = input.profileDimensions.map((item) => {
      const signals = requireSignals(item.sourceSignals);
      return digitalTwinProfileDimensionCandidateSchema.parse({
        dimension: item.dimension,
        label: digitalTwinProfileDimensionLabels[item.dimension],
        hypothesis: item.hypothesis,
        truthStatus: "candidate_hypothesis",
        finalTruth: false,
        sourceSignals: signals,
        confidence: this.candidateConfidence(signals),
        limitations: [
          "This profile dimension is an untrusted hypothesis, not final personality or identity truth.",
          "Approved sources support provenance only; the interpretation still requires explicit owner review.",
        ],
      });
    });
    const observations = input.behaviorObservations.map((item) => behaviorObservationCandidateSchema.parse({
      observation: item.observation,
      observedAt: item.observedAt,
      observationStatus: "unverified_candidate",
      confirmedBehavior: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["A source-linked observation is not a stable behavior trait and may be situational."],
    }));
    const preferences = input.preferenceCandidates.map((item) => personalPreferenceCandidateSchema.parse({
      preferenceArea: item.preferenceArea,
      candidatePreference: item.candidatePreference,
      stability: "unknown",
      confirmedPreference: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["Preference stability is unknown until the owner reviews repeated, time-separated signals."],
    }));
    const decisions = input.decisionPatternCandidates.map((item) => decisionPatternCandidateSchema.parse({
      context: item.context,
      pattern: item.pattern,
      counterEvidenceNeeded: item.counterEvidenceNeeded,
      recurrence: "unverified",
      confirmedPattern: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["One or more source-linked decisions do not establish a stable decision tendency."],
    }));

    const candidateSetId = randomUUID();
    const dimensionIds = dimensions.map(() => randomUUID());
    const observationIds = observations.map(() => randomUUID());
    const preferenceIds = preferences.map(() => randomUUID());
    const decisionIds = decisions.map(() => randomUUID());
    const aggregationId = randomUUID();
    const aggregate = digitalTwinAggregationCandidateSchema.parse({
      aggregationState: "candidate_only",
      profileDimensionCandidateIds: dimensionIds,
      behaviorObservationCandidateIds: observationIds,
      preferenceCandidateIds: preferenceIds,
      decisionPatternCandidateIds: decisionIds,
      sourceSignals: [...validatedSignals.values()],
      finalPersonalityTruth: false,
      profileMutationAllowed: false,
      memoryWriteAllowed: false,
      abilityGrowthMutationAllowed: false,
      masteryMutationAllowed: false,
      contextEligible: false,
      limitations: [
        "This Digital Twin aggregate is an untrusted Candidate and cannot become final identity truth automatically.",
        "Pending candidates remain visibly distinct from approved signals and are never promoted by aggregation.",
        "No ContextEngine, Memory, Profile, Ability, Growth, Evidence, or Mastery write is performed.",
      ],
    });
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO personal_digital_twin_candidate_sets (
          id,user_id,client_request_id,source_signal_refs_json,status,trust_class,generation_method,created_at
        ) VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)
      `).run(candidateSetId, USER_ID, input.clientRequestId, JSON.stringify([...validatedSignals.values()]), timestamp);
      dimensions.forEach((candidate, index) => this.repository.db.prepare(`
        INSERT INTO digital_twin_profile_dimension_candidates (
          id,user_id,candidate_set_id,dimension_type,candidate_json,source_signal_refs_json,
          confidence,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,?,?,'pending','untrusted',?)
      `).run(dimensionIds[index], USER_ID, candidateSetId, candidate.dimension, JSON.stringify(candidate),
        JSON.stringify(candidate.sourceSignals), candidate.confidence, timestamp));
      observations.forEach((candidate, index) => this.repository.db.prepare(`
        INSERT INTO personal_behavior_observation_candidates (
          id,user_id,candidate_set_id,observation_json,source_signal_refs_json,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,'pending','untrusted',?)
      `).run(observationIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      preferences.forEach((candidate, index) => this.repository.db.prepare(`
        INSERT INTO personal_preference_candidates (
          id,user_id,candidate_set_id,preference_json,source_signal_refs_json,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,'pending','untrusted',?)
      `).run(preferenceIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      decisions.forEach((candidate, index) => this.repository.db.prepare(`
        INSERT INTO decision_pattern_candidates (
          id,user_id,candidate_set_id,pattern_json,source_signal_refs_json,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,'pending','untrusted',?)
      `).run(decisionIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      this.repository.db.prepare(`
        INSERT INTO digital_twin_aggregation_candidates (
          id,user_id,candidate_set_id,aggregate_json,source_signal_refs_json,final_truth_allowed,
          context_eligible,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,0,0,'pending','untrusted',?)
      `).run(aggregationId, USER_ID, candidateSetId, JSON.stringify(aggregate), JSON.stringify(aggregate.sourceSignals), timestamp);
      this.audit("personal_digital_twin.candidate_created", "personal_digital_twin_candidate_set", candidateSetId, {
        status: "pending", trustClass: "untrusted", aggregationId,
        dimensionCount: dimensionIds.length, sourceSignals: aggregate.sourceSignals,
        finalTruthAllowed: false, contextEligible: false, automaticFormalWrites: false,
      });
    })();
    return { duplicate: false, candidateSetId, aggregationId, snapshot: this.snapshot() };
  }

  private candidateConfidence(signals: ValidatedDigitalTwinSignal[]) {
    const approved = signals.filter((signal) => signal.signalClass === "approved").length;
    const candidates = signals.length - approved;
    return Math.min(0.5, 0.12 + approved * 0.08 + candidates * 0.03);
  }

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.repository.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(randomUUID(), USER_ID, action, entityType, entityId, null, JSON.stringify(after), now());
  }

  snapshot() {
    const sets = this.repository.db.prepare(
      "SELECT * FROM personal_digital_twin_candidate_sets WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const dimensions = this.repository.db.prepare(
      "SELECT * FROM digital_twin_profile_dimension_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const observations = this.repository.db.prepare(
      "SELECT * FROM personal_behavior_observation_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const preferences = this.repository.db.prepare(
      "SELECT * FROM personal_preference_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const decisions = this.repository.db.prepare(
      "SELECT * FROM decision_pattern_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const aggregates = this.repository.db.prepare(
      "SELECT * FROM digital_twin_aggregation_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    return {
      candidateSets: sets.map((row) => ({
        id: String(row.id), sourceSignals: parseJson(row.source_signal_refs_json, []),
        status: String(row.status), trustClass: String(row.trust_class), generationMethod: String(row.generation_method), createdAt: String(row.created_at),
      })),
      profileDimensionCandidates: dimensions.map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: digitalTwinProfileDimensionCandidateSchema.parse(parseJson(row.candidate_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      behaviorObservationCandidates: observations.map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: behaviorObservationCandidateSchema.parse(parseJson(row.observation_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      preferenceCandidates: preferences.map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: personalPreferenceCandidateSchema.parse(parseJson(row.preference_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      decisionPatternCandidates: decisions.map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: decisionPatternCandidateSchema.parse(parseJson(row.pattern_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      aggregationCandidates: aggregates.map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        aggregate: digitalTwinAggregationCandidateSchema.parse(parseJson(row.aggregate_json, {})),
        finalTruthAllowed: Boolean(row.final_truth_allowed), contextEligible: Boolean(row.context_eligible),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      meta: {
        deterministicFoundation: true, approvalProjection: false, contextIntegration: false,
        profileMutation: false, memoryMutation: false, abilityGrowthMutation: false,
        masteryMutation: false, aiSelfModification: false,
      },
    };
  }
}
