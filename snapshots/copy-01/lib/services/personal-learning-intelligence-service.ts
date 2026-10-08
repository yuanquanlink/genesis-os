import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  learningMaterialGoalCandidateSchema,
  learningMaterialPathCandidateSchema,
  learningMaterialTimeCandidateSchema,
} from "@/lib/domain/learning-material-intelligence";
import {
  createPersonalLearningIntelligenceSchema,
  learningProgressEvidencePreparationSchema,
  learningRecommendationCandidateSchema,
  personalLearningIntelligenceCandidateSchema,
  personalLearningStateCandidateSchema,
  prepareLearningProgressEvidenceSchema,
  type LearningRecommendationCandidate,
  type PersonalLearningIntelligenceCandidate,
  type PersonalLearningStateCandidate,
} from "@/lib/domain/personal-learning-intelligence";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sameIds(left: string[], right: string[]) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export class PersonalLearningIntelligenceService {
  constructor(private readonly repository: ProfileRepository) {}

  private materialCandidateSet(candidateSetId: string) {
    const set = this.repository.db.prepare(`
      SELECT material.*,analysis.confidence AS analysis_confidence,analysis.status AS analysis_status,
        analysis.trust_class AS analysis_trust_class
      FROM learning_material_candidate_sets material
      JOIN knowledge_analysis_candidates analysis ON analysis.id=material.analysis_candidate_id
      WHERE material.id=? AND material.user_id=? AND material.status='pending' AND material.trust_class='untrusted'
    `).get(candidateSetId, USER_ID) as Row | undefined;
    if (!set || set.analysis_status !== "pending" || set.analysis_trust_class !== "untrusted") {
      throw new Error("LEARNING_MATERIAL_CANDIDATE_SET_NOT_FOUND");
    }
    const goalRow = this.repository.db.prepare(`
      SELECT * FROM material_learning_goal_candidates
      WHERE candidate_set_id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
    `).get(candidateSetId, USER_ID) as Row | undefined;
    const timeRow = this.repository.db.prepare(`
      SELECT * FROM material_learning_time_candidates
      WHERE candidate_set_id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
    `).get(candidateSetId, USER_ID) as Row | undefined;
    const pathRow = this.repository.db.prepare(`
      SELECT * FROM material_learning_path_candidates
      WHERE candidate_set_id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
    `).get(candidateSetId, USER_ID) as Row | undefined;
    if (!goalRow || !timeRow || !pathRow) throw new Error("LEARNING_MATERIAL_CANDIDATES_INCOMPLETE");

    const goal = learningMaterialGoalCandidateSchema.parse({
      targetCapability: goalRow.target_capability,
      learningObjective: goalRow.learning_objective,
      prerequisiteList: parseJson(goalRow.prerequisite_list_json, []),
      expectedOutcome: goalRow.expected_outcome,
      relatedKnowledgeSourceIds: parseJson(goalRow.related_source_ids_json, []),
    });
    const time = learningMaterialTimeCandidateSchema.parse({
      estimateKind: timeRow.estimate_kind,
      materialComplexity: timeRow.material_complexity,
      knowledgeSize: parseJson(timeRow.knowledge_size_json, {}),
      prerequisiteGap: timeRow.prerequisite_gap,
      availableMinutesPerWeek: timeRow.available_minutes_per_week,
      estimatedStudyHours: parseJson(timeRow.estimated_study_hours_json, {}),
      estimatedCalendarWeeks: parseJson(timeRow.estimated_calendar_weeks_json, {}),
      assumptions: parseJson(timeRow.assumptions_json, []),
      disclaimer: timeRow.disclaimer,
      relatedKnowledgeSourceIds: parseJson(timeRow.related_source_ids_json, []),
    });
    const path = learningMaterialPathCandidateSchema.parse({
      stages: parseJson(pathRow.stages_json, []),
      relatedKnowledgeSourceIds: parseJson(pathRow.related_source_ids_json, []),
      limitations: parseJson(pathRow.limitations_json, []),
    });
    const sourceIds = goal.relatedKnowledgeSourceIds;
    if (!sameIds(sourceIds, time.relatedKnowledgeSourceIds) || !sameIds(sourceIds, path.relatedKnowledgeSourceIds)) {
      throw new Error("PERSONAL_LEARNING_SOURCE_LINEAGE_MISMATCH");
    }
    const placeholders = sourceIds.map(() => "?").join(",");
    const trusted = Number(this.repository.db.prepare(`
      SELECT count(*) FROM knowledge_objects
      WHERE user_id=? AND id IN (${placeholders}) AND archived_at IS NULL
        AND approval_status IN ('not_required','approved') AND validation_status!='invalid'
    `).pluck().get(USER_ID, ...sourceIds));
    if (trusted !== sourceIds.length) throw new Error("PERSONAL_LEARNING_TRUSTED_SOURCE_REQUIRED");
    return { set, goalRow, timeRow, pathRow, goal, time, path, sourceIds };
  }

  private aggregate(material: ReturnType<PersonalLearningIntelligenceService["materialCandidateSet"]>): PersonalLearningIntelligenceCandidate {
    return personalLearningIntelligenceCandidateSchema.parse({
      lineage: {
        materialCandidateSetId: material.set.id,
        analysisCandidateId: material.set.analysis_candidate_id,
        goalCandidateId: material.goalRow.id,
        timeCandidateId: material.timeRow.id,
        pathCandidateId: material.pathRow.id,
      },
      goal: material.goal,
      studyWorkload: material.time,
      adaptivePath: material.path,
      relatedKnowledgeSourceIds: material.sourceIds,
      upstreamConfidence: Number(material.set.analysis_confidence),
      limitations: unique([
        ...material.path.limitations,
        "This aggregate is an untrusted Candidate, not an active Learning Goal or personal fact.",
        "Study workload is not mastery time; Mastery remains governed by the eight hard Gates.",
      ]).slice(0, 16),
    });
  }

  private state(aggregate: PersonalLearningIntelligenceCandidate): PersonalLearningStateCandidate {
    return personalLearningStateCandidateSchema.parse({
      targetCapability: aggregate.goal.targetCapability,
      learningObjective: aggregate.goal.learningObjective,
      state: "candidate_not_started",
      recommendedStartingStage: "foundation",
      prerequisiteReadiness: aggregate.goal.prerequisiteList.map((prerequisite) => ({ prerequisite, status: "unknown" })),
      availableMinutesPerWeek: aggregate.studyWorkload.availableMinutesPerWeek,
      estimatedStudyWorkload: {
        hours: aggregate.studyWorkload.estimatedStudyHours,
        calendarWeeks: aggregate.studyWorkload.estimatedCalendarWeeks,
        estimateKind: "study_workload_not_mastery",
      },
      completedStages: [],
      masteryStatus: "not_evaluated",
      abilityImpact: "none",
      memoryImpact: "none",
      relatedKnowledgeSourceIds: aggregate.relatedKnowledgeSourceIds,
    });
  }

  private recommendations(aggregate: PersonalLearningIntelligenceCandidate): LearningRecommendationCandidate[] {
    const confidence = Math.min(0.65, aggregate.upstreamConfidence);
    const sources = aggregate.relatedKnowledgeSourceIds;
    const commonLimitations = ["Recommendation Candidate only; owner review is required before any formal learning action."];
    const prerequisiteAction = aggregate.goal.prerequisiteList.length
      ? `Review readiness for: ${aggregate.goal.prerequisiteList.join(", ")}. Record unknowns instead of assuming proficiency.`
      : "Confirm the baseline and required vocabulary before treating the foundation stage as complete.";
    return [
      learningRecommendationCandidateSchema.parse({
        recommendationType: "starting_stage", title: "Start with the foundation candidate",
        rationale: aggregate.adaptivePath.stages[0].objective,
        suggestedAction: aggregate.adaptivePath.stages[0].expectedArtifact,
        relatedKnowledgeSourceIds: sources, confidence, limitations: commonLimitations,
      }),
      learningRecommendationCandidateSchema.parse({
        recommendationType: "weekly_capacity", title: "Use the declared weekly capacity",
        rationale: `The candidate estimate assumes ${aggregate.studyWorkload.availableMinutesPerWeek} available minutes per week.`,
        suggestedAction: "Reserve the declared capacity for the current candidate stage; do not infer progress from elapsed calendar time.",
        relatedKnowledgeSourceIds: sources, confidence, limitations: [...commonLimitations, "Calendar allocation does not prove learning or mastery."],
      }),
      learningRecommendationCandidateSchema.parse({
        recommendationType: "prerequisite_review", title: "Verify prerequisites before progression",
        rationale: `The upstream prerequisite-gap input is ${aggregate.studyWorkload.prerequisiteGap}.`,
        suggestedAction: prerequisiteAction,
        relatedKnowledgeSourceIds: sources, confidence, limitations: [...commonLimitations, "Prerequisite readiness remains unknown until user evidence is reviewed."],
      }),
      learningRecommendationCandidateSchema.parse({
        recommendationType: "progress_evidence_prompt", title: "Prepare traceable progress evidence",
        rationale: "Learning activity becomes useful growth evidence only when the work, assistance, artifact, and source can be reviewed.",
        suggestedAction: "After completing a bounded artifact, prepare an unverified Evidence draft and submit it separately through the existing Evidence contract.",
        relatedKnowledgeSourceIds: sources, confidence, limitations: [...commonLimitations, "Preparing a draft does not create or approve Evidence."],
      }),
    ];
  }

  create(raw: unknown) {
    const input = createPersonalLearningIntelligenceSchema.parse(raw);
    const existing = this.repository.db.prepare(`
      SELECT id FROM personal_learning_intelligence_candidates
      WHERE user_id=? AND (client_request_id=? OR material_candidate_set_id=?)
    `).get(USER_ID, input.clientRequestId, input.materialCandidateSetId) as { id: string } | undefined;
    if (existing) return { duplicate: true, intelligenceCandidateId: existing.id, snapshot: this.snapshot() };

    const material = this.materialCandidateSet(input.materialCandidateSetId);
    const aggregate = this.aggregate(material);
    const state = this.state(aggregate);
    const recommendations = this.recommendations(aggregate);
    const intelligenceCandidateId = randomUUID();
    const stateCandidateId = randomUUID();
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO personal_learning_intelligence_candidates (
          id,user_id,client_request_id,material_candidate_set_id,aggregate_json,related_source_ids_json,
          upstream_confidence,generation_method,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,?,?,'deterministic_v1','pending','untrusted',?)
      `).run(intelligenceCandidateId, USER_ID, input.clientRequestId, input.materialCandidateSetId,
        JSON.stringify(aggregate), JSON.stringify(aggregate.relatedKnowledgeSourceIds), aggregate.upstreamConfidence, timestamp);
      this.repository.db.prepare(`
        INSERT INTO personal_learning_state_candidates (
          id,user_id,intelligence_candidate_id,state_json,status,trust_class,created_at
        ) VALUES (?,?,?,?,'pending','untrusted',?)
      `).run(stateCandidateId, USER_ID, intelligenceCandidateId, JSON.stringify(state), timestamp);
      for (const recommendation of recommendations) {
        this.repository.db.prepare(`
          INSERT INTO learning_recommendation_candidates (
            id,user_id,intelligence_candidate_id,recommendation_type,recommendation_json,
            related_source_ids_json,confidence,status,trust_class,created_at
          ) VALUES (?,?,?,?,?,?,?,'pending','untrusted',?)
        `).run(randomUUID(), USER_ID, intelligenceCandidateId, recommendation.recommendationType,
          JSON.stringify(recommendation), JSON.stringify(recommendation.relatedKnowledgeSourceIds), recommendation.confidence, timestamp);
      }
      this.audit("personal_learning.intelligence_candidate_created", "personal_learning_intelligence_candidate", intelligenceCandidateId, {
        status: "pending", trustClass: "untrusted", materialCandidateSetId: input.materialCandidateSetId,
        stateCandidateId, recommendationCount: recommendations.length, sourceIds: aggregate.relatedKnowledgeSourceIds,
      });
    })();
    return { duplicate: false, intelligenceCandidateId, stateCandidateId, snapshot: this.snapshot() };
  }

  prepareProgressEvidence(raw: unknown) {
    const input = prepareLearningProgressEvidenceSchema.parse(raw);
    const existing = this.repository.db.prepare(
      "SELECT id FROM learning_progress_evidence_preparations WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, preparationId: existing.id, snapshot: this.snapshot() };
    const intelligenceRow = this.repository.db.prepare(`
      SELECT * FROM personal_learning_intelligence_candidates
      WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
    `).get(input.intelligenceCandidateId, USER_ID) as Row | undefined;
    if (!intelligenceRow) throw new Error("PERSONAL_LEARNING_INTELLIGENCE_CANDIDATE_NOT_FOUND");
    const stateRow = this.repository.db.prepare(`
      SELECT * FROM personal_learning_state_candidates
      WHERE intelligence_candidate_id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
    `).get(input.intelligenceCandidateId, USER_ID) as Row | undefined;
    if (!stateRow) throw new Error("PERSONAL_LEARNING_STATE_CANDIDATE_NOT_FOUND");
    const aggregate = personalLearningIntelligenceCandidateSchema.parse(parseJson(intelligenceRow.aggregate_json, {}));
    if (!aggregate.adaptivePath.stages.some((stage) => stage.stage === input.stage)) throw new Error("PERSONAL_LEARNING_STAGE_NOT_FOUND");
    const preparationId = randomUUID();
    const artifact = input.artifactReference ? ` Artifact reference: ${input.artifactReference}.` : " No artifact reference was supplied.";
    const description = `User-reported ${input.stage} progress: ${input.completedWork}.${artifact} Assistance: ${input.assistanceLevel}. ${input.notes}`
      .replace(/\s+/g, " ").trim().slice(0, 2_000);
    const preparation = learningProgressEvidencePreparationSchema.parse({
      stage: input.stage,
      rawProgress: {
        completedWork: input.completedWork, artifactReference: input.artifactReference,
        observedAt: input.observedAt, assistanceLevel: input.assistanceLevel, notes: input.notes,
      },
      evidenceDraft: {
        action: "create", evidenceType: "learning",
        source: "Personal Learning Intelligence progress preparation (not submitted)",
        description, relatedAbility: aggregate.goal.targetCapability.slice(0, 120),
        capturedAt: input.observedAt, dataKind: "user", clientRequestId: preparationId,
      },
      verificationStatus: "unverified",
      requiresExplicitEvidenceSubmission: true,
      relatedKnowledgeSourceIds: aggregate.relatedKnowledgeSourceIds,
      limitations: [
        "This preparation stores user-reported progress and an Evidence draft only; it does not create Evidence.",
        "The existing Evidence review and approval contract must independently verify any later submission.",
        "A prepared draft does not update Ability, Mastery, Memory, Mission, Daily Plan, or Digital Twin state.",
      ],
    });
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO learning_progress_evidence_preparations (
          id,user_id,client_request_id,intelligence_candidate_id,state_candidate_id,stage,
          preparation_json,related_source_ids_json,status,trust_class,handoff_status,created_at
        ) VALUES (?,?,?,?,?,?,?,?,'pending','untrusted','not_submitted',?)
      `).run(preparationId, USER_ID, input.clientRequestId, input.intelligenceCandidateId, stateRow.id,
        input.stage, JSON.stringify(preparation), JSON.stringify(preparation.relatedKnowledgeSourceIds), timestamp);
      this.audit("personal_learning.progress_evidence_prepared", "learning_progress_evidence_preparation", preparationId, {
        status: "pending", trustClass: "untrusted", handoffStatus: "not_submitted",
        intelligenceCandidateId: input.intelligenceCandidateId, stage: input.stage,
      });
    })();
    return { duplicate: false, preparationId, snapshot: this.snapshot() };
  }

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.repository.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(randomUUID(), USER_ID, action, entityType, entityId, null, JSON.stringify(after), now());
  }

  snapshot() {
    const intelligence = this.repository.db.prepare(
      "SELECT * FROM personal_learning_intelligence_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const states = this.repository.db.prepare(
      "SELECT * FROM personal_learning_state_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const recommendations = this.repository.db.prepare(
      "SELECT * FROM learning_recommendation_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const preparations = this.repository.db.prepare(
      "SELECT * FROM learning_progress_evidence_preparations WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    return {
      intelligenceCandidates: intelligence.map((row) => ({
        id: String(row.id), materialCandidateSetId: String(row.material_candidate_set_id),
        aggregate: personalLearningIntelligenceCandidateSchema.parse(parseJson(row.aggregate_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), generationMethod: String(row.generation_method), createdAt: String(row.created_at),
      })),
      stateCandidates: states.map((row) => ({
        id: String(row.id), intelligenceCandidateId: String(row.intelligence_candidate_id),
        state: personalLearningStateCandidateSchema.parse(parseJson(row.state_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      recommendationCandidates: recommendations.map((row) => ({
        id: String(row.id), intelligenceCandidateId: String(row.intelligence_candidate_id),
        recommendation: learningRecommendationCandidateSchema.parse(parseJson(row.recommendation_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at),
      })),
      progressEvidencePreparations: preparations.map((row) => ({
        id: String(row.id), intelligenceCandidateId: String(row.intelligence_candidate_id), stateCandidateId: String(row.state_candidate_id),
        preparation: learningProgressEvidencePreparationSchema.parse(parseJson(row.preparation_json, {})),
        status: String(row.status), trustClass: String(row.trust_class), handoffStatus: String(row.handoff_status), createdAt: String(row.created_at),
      })),
      meta: { deterministicFoundation: true, contextIntegration: false, evidenceSubmission: false, approvalProjection: false, automaticFormalWrites: false },
    };
  }
}
