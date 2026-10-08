import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  cognitiveElevationCandidateSchema,
  createPersonalReflectionMentorSchema,
  dailyReflectionIntelligenceCandidateSchema,
  expertThinkingPatternReferenceCandidateSchema,
  mentorPerspectiveCandidateSchema,
  personalReflectionMentorIntelligenceCandidateSchema,
  reflectionStrengthWeaknessSignalCandidateSchema,
  selfReviewCandidateSchema,
  type ReflectionMentorSignalRef,
  type ValidatedReflectionMentorSignal,
} from "@/lib/domain/personal-reflection-mentor-intelligence";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function signalKey(signal: ReflectionMentorSignalRef) {
  return `${signal.signalType}:${signal.signalId}`;
}

export class PersonalReflectionMentorIntelligenceService {
  constructor(private readonly repository: ProfileRepository) {}

  private validateSignal(signal: ReflectionMentorSignalRef): ValidatedReflectionMentorSignal {
    const exists = (sql: string) => Boolean(this.repository.db.prepare(sql).get(signal.signalId, USER_ID));
    let signalClass: "self_report" | "verified" | "candidate";
    let sourceDomain: "reflection" | "evidence" | "decision" | "digital_twin" | "ability" | "knowledge";
    switch (signal.signalType) {
      case "operating_reflection":
        signalClass = "self_report";
        sourceDomain = "reflection";
        if (!exists("SELECT 1 FROM operating_reflections WHERE id=? AND user_id=?"))
          throw new Error("REFLECTION_MENTOR_SELF_REPORT_REQUIRED");
        break;
      case "verified_evidence":
        signalClass = "verified";
        sourceDomain = "evidence";
        if (!exists("SELECT 1 FROM evidence_items WHERE id=? AND user_id=? AND verification_status='verified'"))
          throw new Error("REFLECTION_MENTOR_VERIFIED_EVIDENCE_REQUIRED");
        break;
      case "decision_intelligence_candidate":
        signalClass = "candidate";
        sourceDomain = "decision";
        if (!exists(`SELECT 1 FROM personal_decision_intelligence_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
          AND automatic_judgement_allowed=0 AND final_truth_allowed=0 AND context_eligible=0`))
          throw new Error("REFLECTION_MENTOR_DECISION_CANDIDATE_REQUIRED");
        break;
      case "digital_twin_aggregation_candidate":
        signalClass = "candidate";
        sourceDomain = "digital_twin";
        if (!exists(`SELECT 1 FROM digital_twin_aggregation_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
          AND final_truth_allowed=0 AND context_eligible=0`))
          throw new Error("REFLECTION_MENTOR_DIGITAL_TWIN_CANDIDATE_REQUIRED");
        break;
      case "ability_dimension_candidate":
        signalClass = "candidate";
        sourceDomain = "ability";
        if (!exists(`SELECT 1 FROM ability_dimension_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("REFLECTION_MENTOR_ABILITY_CANDIDATE_REQUIRED");
        break;
      case "knowledge_analysis_candidate":
        signalClass = "candidate";
        sourceDomain = "knowledge";
        if (!exists(`SELECT 1 FROM knowledge_analysis_candidates
          WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'`))
          throw new Error("REFLECTION_MENTOR_KNOWLEDGE_CANDIDATE_REQUIRED");
        break;
    }
    return { ...signal, signalClass, sourceDomain };
  }

  createCandidate(raw: unknown) {
    const input = createPersonalReflectionMentorSchema.parse(raw);
    const existing = this.repository.db.prepare(
      "SELECT id FROM personal_reflection_mentor_candidate_sets WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, candidateSetId: existing.id, snapshot: this.snapshot() };

    const keys = input.sourceSignals.map(signalKey);
    if (new Set(keys).size !== keys.length) throw new Error("REFLECTION_MENTOR_SIGNAL_DUPLICATE");
    const validatedSignals = new Map(input.sourceSignals.map((signal) => {
      const validated = this.validateSignal(signal);
      return [signalKey(signal), validated] as const;
    }));
    const domains = new Set([...validatedSignals.values()].map((signal) => signal.sourceDomain));
    if (!["reflection", "decision", "knowledge"].every((domain) => domains.has(domain as "reflection" | "decision" | "knowledge")))
      throw new Error("REFLECTION_MENTOR_SOURCE_DOMAINS_INCOMPLETE");
    const requireSignals = (signals: ReflectionMentorSignalRef[]) => signals.map((signal) => {
      const validated = validatedSignals.get(signalKey(signal));
      if (!validated) throw new Error("REFLECTION_MENTOR_SIGNAL_NOT_DECLARED");
      return validated;
    });
    const signalTypes = new Set(input.strengthWeaknessSignals.map((signal) => signal.signalType));
    if (!signalTypes.has("strength") || !signalTypes.has("weakness"))
      throw new Error("REFLECTION_STRENGTH_WEAKNESS_REQUIRED");

    const daily = dailyReflectionIntelligenceCandidateSchema.parse({
      ...input.dailyReflection,
      finalDailyJudgement: false,
      sourceSignals: requireSignals(input.dailyReflection.sourceSignals),
      limitations: ["This daily summary is a source-linked Candidate and not a final judgement of the owner or the day."],
    });
    const selfReview = selfReviewCandidateSchema.parse({
      ...input.selfReview,
      finalSelfAssessment: null,
      sourceSignals: requireSignals(input.selfReview.sourceSignals),
      limitations: ["Done-well and improvement items remain review prompts, not a final self-assessment."],
    });
    const reflectionSignals = input.strengthWeaknessSignals.map((item) => reflectionStrengthWeaknessSignalCandidateSchema.parse({
      ...item,
      stableTraitConclusion: false,
      abilityMutationAllowed: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["A reflection signal cannot establish a stable strength, weakness, or formal Ability level."],
    }));
    const mentorPerspectives = input.mentorPerspectives.map((item) => mentorPerspectiveCandidateSchema.parse({
      ...item,
      userJudgement: false,
      certainty: "candidate",
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["A Mentor perspective is an alternative lens for owner review, not authoritative advice or user judgement."],
    }));
    const expertReferences = input.expertThinkingReferences.map((item) => expertThinkingPatternReferenceCandidateSchema.parse({
      ...item,
      attributionStatus: "reference_only_not_attributed",
      claimedExpertIdentity: null,
      claimedExpertDecision: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["This is a generic thinking-pattern reference and does not claim what any exceptional person would decide."],
    }));
    const elevations = input.cognitiveElevations.map((item) => cognitiveElevationCandidateSchema.parse({
      ...item,
      cognitiveGrowthClaim: false,
      masteryClaim: false,
      sourceSignals: requireSignals(item.sourceSignals),
      limitations: ["An alternative frame and practice experiment do not prove cognitive growth or Mastery."],
    }));

    const candidateSetId = randomUUID();
    const dailyId = randomUUID();
    const selfReviewId = randomUUID();
    const reflectionSignalIds = reflectionSignals.map(() => randomUUID());
    const mentorPerspectiveIds = mentorPerspectives.map(() => randomUUID());
    const expertReferenceIds = expertReferences.map(() => randomUUID());
    const elevationIds = elevations.map(() => randomUUID());
    const intelligenceId = randomUUID();
    const aggregate = personalReflectionMentorIntelligenceCandidateSchema.parse({
      aggregationState: "candidate_only",
      dailyReflectionCandidateId: dailyId,
      selfReviewCandidateId: selfReviewId,
      strengthWeaknessSignalCandidateIds: reflectionSignalIds,
      mentorPerspectiveCandidateIds: mentorPerspectiveIds,
      expertThinkingReferenceCandidateIds: expertReferenceIds,
      cognitiveElevationCandidateIds: elevationIds,
      sourceSignals: [...validatedSignals.values()],
      finalUserJudgement: false,
      finalPersonalityConclusion: false,
      profileMutationAllowed: false,
      memoryWriteAllowed: false,
      abilityGrowthMutationAllowed: false,
      evidenceWriteAllowed: false,
      masteryMutationAllowed: false,
      contextEligible: false,
      limitations: [
        "This Reflection and Mentor aggregate is pending/untrusted and cannot become final user truth automatically.",
        "Expert references are generic thinking patterns and never claims about an expert's actual decision.",
        "No ContextEngine, Profile, Memory, Evidence, Ability, Growth, or Mastery write is performed.",
      ],
    });
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO personal_reflection_mentor_candidate_sets
        (id,user_id,client_request_id,source_signal_refs_json,status,trust_class,generation_method,created_at)
        VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`)
        .run(candidateSetId, USER_ID, input.clientRequestId, JSON.stringify([...validatedSignals.values()]), timestamp);
      this.repository.db.prepare(`INSERT INTO daily_reflection_intelligence_candidates
        (id,user_id,candidate_set_id,reflection_date,reflection_json,source_signal_refs_json,final_judgement_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(dailyId, USER_ID, candidateSetId, daily.reflectionDate, JSON.stringify(daily), JSON.stringify(daily.sourceSignals), timestamp);
      this.repository.db.prepare(`INSERT INTO self_review_candidates
        (id,user_id,candidate_set_id,review_json,source_signal_refs_json,final_self_assessment,status,trust_class,created_at)
        VALUES (?,?,?,?,?,NULL,'pending','untrusted',?)`)
        .run(selfReviewId, USER_ID, candidateSetId, JSON.stringify(selfReview), JSON.stringify(selfReview.sourceSignals), timestamp);
      reflectionSignals.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO reflection_strength_weakness_signal_candidates
        (id,user_id,candidate_set_id,signal_type,signal_json,source_signal_refs_json,trait_conclusion_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(reflectionSignalIds[index], USER_ID, candidateSetId, candidate.signalType, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      mentorPerspectives.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO mentor_perspective_candidates
        (id,user_id,candidate_set_id,perspective_type,perspective_json,source_signal_refs_json,user_judgement_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(mentorPerspectiveIds[index], USER_ID, candidateSetId, candidate.perspectiveType, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      expertReferences.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO expert_thinking_pattern_reference_candidates
        (id,user_id,candidate_set_id,reference_json,source_signal_refs_json,expert_identity_claim_allowed,expert_decision_claim_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,0,'pending','untrusted',?)`)
        .run(expertReferenceIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      elevations.forEach((candidate, index) => this.repository.db.prepare(`INSERT INTO cognitive_elevation_candidates
        (id,user_id,candidate_set_id,elevation_json,source_signal_refs_json,cognitive_growth_claim_allowed,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,'pending','untrusted',?)`)
        .run(elevationIds[index], USER_ID, candidateSetId, JSON.stringify(candidate), JSON.stringify(candidate.sourceSignals), timestamp));
      this.repository.db.prepare(`INSERT INTO personal_reflection_mentor_intelligence_candidates
        (id,user_id,candidate_set_id,aggregate_json,source_signal_refs_json,final_user_judgement_allowed,
         final_truth_allowed,context_eligible,status,trust_class,created_at)
        VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`)
        .run(intelligenceId, USER_ID, candidateSetId, JSON.stringify(aggregate), JSON.stringify(aggregate.sourceSignals), timestamp);
      this.audit("personal_reflection_mentor.candidate_created", "personal_reflection_mentor_candidate_set", candidateSetId, {
        status: "pending", trustClass: "untrusted", intelligenceId,
        sourceDomains: [...domains].sort(), finalUserJudgementAllowed: false,
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
      candidateSets: rows("personal_reflection_mentor_candidate_sets").map((row) => ({
        id: String(row.id), sourceSignals: parseJson(row.source_signal_refs_json, []),
        status: String(row.status), trustClass: String(row.trust_class), generationMethod: String(row.generation_method), createdAt: String(row.created_at),
      })),
      dailyReflectionCandidates: rows("daily_reflection_intelligence_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: dailyReflectionIntelligenceCandidateSchema.parse(parseJson(row.reflection_json, {})),
        finalJudgementAllowed: Boolean(row.final_judgement_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      selfReviewCandidates: rows("self_review_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: selfReviewCandidateSchema.parse(parseJson(row.review_json, {})),
        finalSelfAssessment: row.final_self_assessment === null ? null : String(row.final_self_assessment), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      strengthWeaknessSignalCandidates: rows("reflection_strength_weakness_signal_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: reflectionStrengthWeaknessSignalCandidateSchema.parse(parseJson(row.signal_json, {})),
        traitConclusionAllowed: Boolean(row.trait_conclusion_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      mentorPerspectiveCandidates: rows("mentor_perspective_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: mentorPerspectiveCandidateSchema.parse(parseJson(row.perspective_json, {})),
        userJudgementAllowed: Boolean(row.user_judgement_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      expertThinkingReferenceCandidates: rows("expert_thinking_pattern_reference_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: expertThinkingPatternReferenceCandidateSchema.parse(parseJson(row.reference_json, {})),
        expertIdentityClaimAllowed: Boolean(row.expert_identity_claim_allowed), expertDecisionClaimAllowed: Boolean(row.expert_decision_claim_allowed),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      cognitiveElevationCandidates: rows("cognitive_elevation_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: cognitiveElevationCandidateSchema.parse(parseJson(row.elevation_json, {})),
        cognitiveGrowthClaimAllowed: Boolean(row.cognitive_growth_claim_allowed), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      intelligenceCandidates: rows("personal_reflection_mentor_intelligence_candidates").map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: personalReflectionMentorIntelligenceCandidateSchema.parse(parseJson(row.aggregate_json, {})),
        finalUserJudgementAllowed: Boolean(row.final_user_judgement_allowed), finalTruthAllowed: Boolean(row.final_truth_allowed),
        contextEligible: Boolean(row.context_eligible), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      meta: {
        deterministicFoundation: true, providerCall: false, approvalProjection: false, contextIntegration: false,
        finalUserJudgement: false, expertDecisionClaim: false, profileMutation: false,
        memoryMutation: false, evidenceMutation: false, abilityGrowthMutation: false,
        masteryMutation: false, aiSelfModification: false,
      },
    };
  }
}
