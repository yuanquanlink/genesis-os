import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import { learningProgressEvidencePreparationSchema } from "@/lib/domain/personal-learning-intelligence";
import { personalLearningIntelligenceCandidateSchema } from "@/lib/domain/personal-learning-intelligence";
import {
  abilityDimensionCandidateSchema,
  abilityDimensionLabels,
  abilityEvidencePreparationSchema,
  createAbilityCandidateSetSchema,
  generateGrowthTrendSchema,
  growthTrackingCandidateSchema,
  growthTrendCandidateSchema,
  prepareAbilityEvidenceSchema,
  type AbilityDimensionCandidate,
  type GrowthTrackingCandidate,
} from "@/lib/domain/personal-ability-growth-intelligence";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export class PersonalAbilityGrowthIntelligenceService {
  constructor(private readonly repository: ProfileRepository) {}

  private learningIntelligence(id: string) {
    const row = this.repository.db.prepare(`
      SELECT intelligence.*,state.id AS state_candidate_id
      FROM personal_learning_intelligence_candidates intelligence
      JOIN personal_learning_state_candidates state ON state.intelligence_candidate_id=intelligence.id
      WHERE intelligence.id=? AND intelligence.user_id=?
        AND intelligence.status='pending' AND intelligence.trust_class='untrusted'
        AND state.status='pending' AND state.trust_class='untrusted'
    `).get(id, USER_ID) as Row | undefined;
    if (!row) throw new Error("PERSONAL_LEARNING_INTELLIGENCE_CANDIDATE_NOT_FOUND");
    const aggregate = personalLearningIntelligenceCandidateSchema.parse(parseJson(row.aggregate_json, {}));
    const sourceIds = aggregate.relatedKnowledgeSourceIds;
    const placeholders = sourceIds.map(() => "?").join(",");
    const trusted = Number(this.repository.db.prepare(`
      SELECT count(*) FROM knowledge_objects
      WHERE user_id=? AND id IN (${placeholders}) AND archived_at IS NULL
        AND approval_status IN ('not_required','approved') AND validation_status!='invalid'
    `).pluck().get(USER_ID, ...sourceIds));
    if (trusted !== sourceIds.length) throw new Error("PERSONAL_ABILITY_TRUSTED_SOURCE_REQUIRED");
    return { row, aggregate, sourceIds };
  }

  createAbilityModel(raw: unknown) {
    const input = createAbilityCandidateSetSchema.parse(raw);
    const existing = this.repository.db.prepare(
      "SELECT id FROM personal_ability_candidate_sets WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, candidateSetId: existing.id, snapshot: this.snapshot() };
    if (new Set(input.dimensions.map((item) => item.dimension)).size !== input.dimensions.length) {
      throw new Error("ABILITY_DIMENSION_DUPLICATE");
    }
    const learning = this.learningIntelligence(input.learningIntelligenceCandidateId);
    const confidence = Math.min(0.5, learning.aggregate.upstreamConfidence * 0.6);
    const candidates = input.dimensions.map((dimension) => abilityDimensionCandidateSchema.parse({
      dimension: dimension.dimension,
      label: abilityDimensionLabels[dimension.dimension],
      hypothesis: dimension.hypothesis,
      observationFocus: dimension.observationFocus,
      relatedStages: unique(dimension.relatedStages),
      assessmentState: "unassessed_candidate",
      currentLevel: null,
      proposedLevel: null,
      abilityImpact: "none",
      relatedKnowledgeSourceIds: learning.sourceIds,
      confidence,
      limitations: [
        "This dimension is an untrusted hypothesis, not a measured or approved Ability.",
        "Learning material and planned work cannot establish an Ability level without approved Evidence.",
      ],
    }));
    const candidateSetId = randomUUID();
    const timestamp = now();
    const dimensionIds: string[] = [];
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO personal_ability_candidate_sets (
          id,user_id,client_request_id,learning_intelligence_candidate_id,status,trust_class,generation_method,created_at
        ) VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)
      `).run(candidateSetId, USER_ID, input.clientRequestId, input.learningIntelligenceCandidateId, timestamp);
      for (const candidate of candidates) {
        const dimensionId = randomUUID();
        dimensionIds.push(dimensionId);
        this.repository.db.prepare(`
          INSERT INTO ability_dimension_candidates (
            id,user_id,candidate_set_id,dimension_type,candidate_json,related_source_ids_json,
            confidence,status,trust_class,created_at
          ) VALUES (?,?,?,?,?,?,?,'pending','untrusted',?)
        `).run(dimensionId, USER_ID, candidateSetId, candidate.dimension, JSON.stringify(candidate),
          JSON.stringify(candidate.relatedKnowledgeSourceIds), candidate.confidence, timestamp);
        const tracking = this.trackingCandidate(candidate);
        this.repository.db.prepare(`
          INSERT INTO growth_tracking_candidates (
            id,user_id,ability_dimension_candidate_id,tracking_json,status,trust_class,created_at
          ) VALUES (?,?,?,?,'pending','untrusted',?)
        `).run(randomUUID(), USER_ID, dimensionId, JSON.stringify(tracking), timestamp);
      }
      this.audit("personal_ability.candidate_set_created", "personal_ability_candidate_set", candidateSetId, {
        status: "pending", trustClass: "untrusted", learningIntelligenceCandidateId: input.learningIntelligenceCandidateId,
        dimensionIds, automaticFormalWrites: false,
      });
    })();
    return { duplicate: false, candidateSetId, dimensionIds, snapshot: this.snapshot() };
  }

  private trackingCandidate(candidate: AbilityDimensionCandidate): GrowthTrackingCandidate {
    return growthTrackingCandidateSchema.parse({
      dimension: candidate.dimension,
      trackingState: "candidate_not_active",
      baseline: "unknown",
      relatedStages: candidate.relatedStages,
      observationFocus: candidate.observationFocus,
      verifiedEvidenceIds: [],
      abilityImpact: "none",
      growthImpact: "none",
      relatedKnowledgeSourceIds: candidate.relatedKnowledgeSourceIds,
    });
  }

  prepareAbilityEvidence(raw: unknown) {
    const input = prepareAbilityEvidenceSchema.parse(raw);
    const existingRequest = this.repository.db.prepare(
      "SELECT id FROM ability_evidence_preparations WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existingRequest) return { duplicate: true, preparationId: existingRequest.id, snapshot: this.snapshot() };
    const dimensionRow = this.repository.db.prepare(`
      SELECT dimension.*,candidate_set.learning_intelligence_candidate_id
      FROM ability_dimension_candidates dimension
      JOIN personal_ability_candidate_sets candidate_set ON candidate_set.id=dimension.candidate_set_id
      WHERE dimension.id=? AND dimension.user_id=?
        AND dimension.status='pending' AND dimension.trust_class='untrusted'
        AND candidate_set.status='pending' AND candidate_set.trust_class='untrusted'
    `).get(input.abilityDimensionCandidateId, USER_ID) as Row | undefined;
    if (!dimensionRow) throw new Error("ABILITY_DIMENSION_CANDIDATE_NOT_FOUND");
    const progressRow = this.repository.db.prepare(`
      SELECT * FROM learning_progress_evidence_preparations
      WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted' AND handoff_status='not_submitted'
    `).get(input.learningProgressPreparationId, USER_ID) as Row | undefined;
    if (!progressRow) throw new Error("LEARNING_PROGRESS_PREPARATION_NOT_FOUND");
    if (progressRow.intelligence_candidate_id !== dimensionRow.learning_intelligence_candidate_id) {
      throw new Error("ABILITY_PROGRESS_LINEAGE_MISMATCH");
    }
    const existingLink = this.repository.db.prepare(`
      SELECT link.id,preparation.id AS preparation_id
      FROM learning_progress_ability_candidate_links link
      LEFT JOIN ability_evidence_preparations preparation ON preparation.progress_ability_link_id=link.id
      WHERE link.learning_progress_preparation_id=? AND link.ability_dimension_candidate_id=?
    `).get(input.learningProgressPreparationId, input.abilityDimensionCandidateId) as Row | undefined;
    if (existingLink?.preparation_id) {
      return { duplicate: true, preparationId: String(existingLink.preparation_id), snapshot: this.snapshot() };
    }
    const dimension = abilityDimensionCandidateSchema.parse(parseJson(dimensionRow.candidate_json, {}));
    const progress = learningProgressEvidencePreparationSchema.parse(parseJson(progressRow.preparation_json, {}));
    if (!dimension.relatedStages.includes(progress.stage)) throw new Error("ABILITY_PROGRESS_STAGE_NOT_RELATED");
    const preparationId = randomUUID();
    const linkId = existingLink ? String(existingLink.id) : randomUUID();
    const description = [
      `Unverified learning progress possibly related to ${dimension.label}: ${progress.rawProgress.completedWork}.`,
      progress.rawProgress.artifactReference ? `Artifact reference: ${progress.rawProgress.artifactReference}.` : "No artifact reference was supplied.",
      `Assistance: ${progress.rawProgress.assistanceLevel}.`,
      progress.rawProgress.notes,
    ].join(" ").replace(/\s+/g, " ").trim().slice(0, 2_000);
    const preparation = abilityEvidencePreparationSchema.parse({
      dimension: dimension.dimension,
      learningProgressPreparationId: input.learningProgressPreparationId,
      sourceStage: progress.stage,
      sourceProgress: progress.rawProgress,
      evidenceDraft: {
        action: "create",
        evidenceType: "learning",
        source: "Ability intelligence preparation (not submitted)",
        description,
        relatedAbility: dimension.label,
        capturedAt: progress.rawProgress.observedAt,
        dataKind: "user",
        clientRequestId: preparationId,
      },
      verificationStatus: "unverified",
      requiresExplicitEvidenceSubmission: true,
      allowsAbilityUpdate: false,
      allowsGrowthUpdate: false,
      relatedKnowledgeSourceIds: dimension.relatedKnowledgeSourceIds,
      limitations: [
        "This is an unverified Ability Evidence preparation, not Evidence and not an Ability assessment.",
        "The existing Evidence approval flow must verify any later submission before Growth can use it.",
        "Learning progress alone cannot establish Mastery, Ability level, Growth delta, Memory, or Digital Twin truth.",
      ],
    });
    const timestamp = now();
    this.repository.db.transaction(() => {
      if (!existingLink) this.repository.db.prepare(`
        INSERT INTO learning_progress_ability_candidate_links (
          id,user_id,learning_progress_preparation_id,ability_dimension_candidate_id,
          relation_type,status,trust_class,created_at
        ) VALUES (?,?,?,?,'possible_signal','pending','untrusted',?)
      `).run(linkId, USER_ID, input.learningProgressPreparationId, input.abilityDimensionCandidateId, timestamp);
      this.repository.db.prepare(`
        INSERT INTO ability_evidence_preparations (
          id,user_id,client_request_id,progress_ability_link_id,preparation_json,related_source_ids_json,
          status,trust_class,handoff_status,created_at
        ) VALUES (?,?,?,?,?,?,'pending','untrusted','not_submitted',?)
      `).run(preparationId, USER_ID, input.clientRequestId, linkId, JSON.stringify(preparation),
        JSON.stringify(preparation.relatedKnowledgeSourceIds), timestamp);
      this.audit("personal_ability.evidence_prepared", "ability_evidence_preparation", preparationId, {
        status: "pending", trustClass: "untrusted", handoffStatus: "not_submitted",
        abilityDimensionCandidateId: input.abilityDimensionCandidateId,
        learningProgressPreparationId: input.learningProgressPreparationId,
      });
    })();
    return { duplicate: false, preparationId, linkId, snapshot: this.snapshot() };
  }

  generateGrowthTrend(raw: unknown) {
    const input = generateGrowthTrendSchema.parse(raw);
    const existing = this.repository.db.prepare(
      "SELECT id FROM growth_trend_candidates WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, trendCandidateId: existing.id, snapshot: this.snapshot() };
    const dimensionRow = this.repository.db.prepare(`
      SELECT * FROM ability_dimension_candidates
      WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
    `).get(input.abilityDimensionCandidateId, USER_ID) as Row | undefined;
    if (!dimensionRow) throw new Error("ABILITY_DIMENSION_CANDIDATE_NOT_FOUND");
    const dimension = abilityDimensionCandidateSchema.parse(parseJson(dimensionRow.candidate_json, {}));
    const preparationRows = this.repository.db.prepare(`
      SELECT preparation.id
      FROM ability_evidence_preparations preparation
      JOIN learning_progress_ability_candidate_links link ON link.id=preparation.progress_ability_link_id
      WHERE link.ability_dimension_candidate_id=? AND preparation.user_id=?
        AND preparation.status='pending' AND preparation.trust_class='untrusted'
        AND preparation.handoff_status='not_submitted'
      ORDER BY preparation.created_at
    `).all(input.abilityDimensionCandidateId, USER_ID) as Array<{ id: string }>;
    const observationIds = preparationRows.map((row) => row.id);
    const confidence = observationIds.length ? Math.min(0.35, 0.1 + observationIds.length * 0.05) : 0;
    const trend = growthTrendCandidateSchema.parse({
      dimension: dimension.dimension,
      trendDirection: "unknown",
      numericDelta: null,
      assessmentState: observationIds.length ? "unverified_observations_only" : "insufficient_data",
      observedPreparationCount: observationIds.length,
      observationPreparationIds: observationIds,
      verifiedEvidenceIds: [],
      abilityImpact: "none",
      growthImpact: "none",
      relatedKnowledgeSourceIds: dimension.relatedKnowledgeSourceIds,
      confidence,
      limitations: [
        "Unverified preparations cannot establish a positive, negative, or stable Growth trend.",
        "No numeric Ability delta is calculated and no formal Growth record is written.",
        "Approved Evidence and the existing Growth approval contract are required for any formal change.",
      ],
    });
    const trendCandidateId = randomUUID();
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO growth_trend_candidates (
          id,user_id,client_request_id,ability_dimension_candidate_id,trend_json,related_source_ids_json,
          trend_direction,formal_delta_allowed,confidence,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,?,'unknown',0,?,'pending','untrusted',?)
      `).run(trendCandidateId, USER_ID, input.clientRequestId, input.abilityDimensionCandidateId,
        JSON.stringify(trend), JSON.stringify(trend.relatedKnowledgeSourceIds), trend.confidence, timestamp);
      this.audit("personal_ability.growth_trend_candidate_created", "growth_trend_candidate", trendCandidateId, {
        status: "pending", trustClass: "untrusted", trendDirection: "unknown",
        formalDeltaAllowed: false, observedPreparationCount: observationIds.length,
      });
    })();
    return { duplicate: false, trendCandidateId, snapshot: this.snapshot() };
  }

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.repository.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(randomUUID(), USER_ID, action, entityType, entityId, null, JSON.stringify(after), now());
  }

  snapshot() {
    const candidateSets = this.repository.db.prepare(
      "SELECT * FROM personal_ability_candidate_sets WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const dimensions = this.repository.db.prepare(
      "SELECT * FROM ability_dimension_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const tracking = this.repository.db.prepare(
      "SELECT * FROM growth_tracking_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const links = this.repository.db.prepare(
      "SELECT * FROM learning_progress_ability_candidate_links WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const preparations = this.repository.db.prepare(
      "SELECT * FROM ability_evidence_preparations WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const trends = this.repository.db.prepare(
      "SELECT * FROM growth_trend_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    return {
      candidateSets: candidateSets.map((row) => ({
        id: String(row.id), learningIntelligenceCandidateId: String(row.learning_intelligence_candidate_id),
        status: String(row.status), trustClass: String(row.trust_class), generationMethod: String(row.generation_method), createdAt: String(row.created_at),
      })),
      abilityDimensionCandidates: dimensions.map((row) => ({
        id: String(row.id), candidateSetId: String(row.candidate_set_id),
        candidate: abilityDimensionCandidateSchema.parse(parseJson(row.candidate_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      growthTrackingCandidates: tracking.map((row) => ({
        id: String(row.id), abilityDimensionCandidateId: String(row.ability_dimension_candidate_id),
        tracking: growthTrackingCandidateSchema.parse(parseJson(row.tracking_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      progressAbilityLinks: links.map((row) => ({
        id: String(row.id), learningProgressPreparationId: String(row.learning_progress_preparation_id),
        abilityDimensionCandidateId: String(row.ability_dimension_candidate_id), relationType: String(row.relation_type),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      abilityEvidencePreparations: preparations.map((row) => ({
        id: String(row.id), progressAbilityLinkId: String(row.progress_ability_link_id),
        preparation: abilityEvidencePreparationSchema.parse(parseJson(row.preparation_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), handoffStatus: String(row.handoff_status), createdAt: String(row.created_at),
      })),
      growthTrendCandidates: trends.map((row) => ({
        id: String(row.id), abilityDimensionCandidateId: String(row.ability_dimension_candidate_id),
        trend: growthTrendCandidateSchema.parse(parseJson(row.trend_json, {})),
        trendDirection: String(row.trend_direction), formalDeltaAllowed: Boolean(row.formal_delta_allowed),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      meta: {
        deterministicFoundation: true, contextIntegration: false, evidenceSubmission: false,
        approvalProjection: false, abilityMutation: false, growthMutation: false,
        masteryMutation: false, memoryMutation: false, digitalTwinMutation: false,
      },
    };
  }
}
