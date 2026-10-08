import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import { knowledgeAnalysisOutputSchema } from "@/lib/domain/knowledge-intelligence";
import {
  createLearningMaterialCandidatesSchema,
  learningMaterialGoalCandidateSchema,
  learningMaterialPathCandidateSchema,
  learningMaterialTimeCandidateSchema,
  type LearningMaterialGoalCandidate,
  type LearningMaterialPathCandidate,
  type LearningMaterialTimeCandidate,
} from "@/lib/domain/learning-material-intelligence";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export class LearningMaterialIntelligenceService {
  constructor(private readonly repository: ProfileRepository) {}

  private analysis(candidateId: string) {
    const row = this.repository.db.prepare(`
      SELECT * FROM knowledge_analysis_candidates
      WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
    `).get(candidateId, USER_ID) as Row | undefined;
    if (!row) throw new Error("KNOWLEDGE_ANALYSIS_CANDIDATE_NOT_FOUND");
    const analysis = knowledgeAnalysisOutputSchema.parse(parseJson(row.analysis_json, {}));
    const sourceIds = unique(parseJson<string[]>(row.source_object_ids_json, []));
    if (!sourceIds.length) throw new Error("LEARNING_MATERIAL_SOURCE_REQUIRED");
    const placeholders = sourceIds.map(() => "?").join(",");
    const trusted = Number(this.repository.db.prepare(`
      SELECT count(*) FROM knowledge_objects
      WHERE user_id=? AND id IN (${placeholders}) AND archived_at IS NULL
        AND approval_status IN ('not_required','approved') AND validation_status!='invalid'
    `).pluck().get(USER_ID, ...sourceIds));
    if (trusted !== sourceIds.length) throw new Error("LEARNING_MATERIAL_TRUSTED_SOURCE_REQUIRED");
    return { row, analysis, sourceIds };
  }

  private size(sourceIds: string[], conceptCount: number) {
    const placeholders = sourceIds.map(() => "?").join(",");
    const row = this.repository.db.prepare(`
      SELECT count(*) AS unit_count,COALESCE(sum(length(content)),0) AS character_count
      FROM knowledge_units WHERE id IN (${placeholders})
    `).get(...sourceIds) as { unit_count: number; character_count: number };
    return {
      unitCount: Number(row.unit_count),
      conceptCount: Math.max(1, conceptCount),
      characterCount: Number(row.character_count),
    };
  }

  private goal(
    targetCapability: string,
    analysis: ReturnType<typeof knowledgeAnalysisOutputSchema.parse>,
    sourceIds: string[],
  ): LearningMaterialGoalCandidate {
    const prerequisites = unique([
      ...analysis.prerequisites.map((item) => item.name),
      ...analysis.requiredPrerequisites.map((item) => item.title),
    ]);
    return learningMaterialGoalCandidateSchema.parse({
      targetCapability,
      learningObjective: analysis.learningGoal.description,
      prerequisiteList: prerequisites,
      expectedOutcome: analysis.learningPath.steps.at(-1)?.outcome || analysis.learningGoal.description,
      relatedKnowledgeSourceIds: sourceIds,
    });
  }

  private time(
    complexity: number,
    knowledgeSize: { unitCount: number; conceptCount: number; characterCount: number },
    prerequisiteGap: number,
    availableMinutesPerWeek: number,
    sourceIds: string[],
  ): LearningMaterialTimeCandidate {
    const contentHours = Math.max(1, knowledgeSize.characterCount / 6_000);
    const conceptHours = Math.max(1, knowledgeSize.conceptCount * 0.75);
    const complexityMultiplier = 0.75 + complexity * 0.25;
    const gapMultiplier = 1 + prerequisiteGap * 0.8;
    const expected = round((contentHours + conceptHours) * complexityMultiplier * gapMultiplier);
    const hours = { low: round(Math.max(1, expected * 0.75)), expected, high: round(expected * 1.5) };
    const toWeeks = (studyHours: number) => round(Math.max(0.1, studyHours * 60 / availableMinutesPerWeek));
    return learningMaterialTimeCandidateSchema.parse({
      estimateKind: "study_workload_not_mastery",
      materialComplexity: complexity,
      knowledgeSize,
      prerequisiteGap,
      availableMinutesPerWeek,
      estimatedStudyHours: hours,
      estimatedCalendarWeeks: { low: toWeeks(hours.low), expected: toWeeks(hours.expected), high: toWeeks(hours.high) },
      assumptions: [
        "Material complexity comes from an untrusted Knowledge Analysis Candidate.",
        "Knowledge size uses currently extracted Units and concepts; incomplete extraction can understate workload.",
        "Prerequisite gap and available time are owner-supplied planning inputs, not observed mastery evidence.",
      ],
      disclaimer: "This estimates study workload and calendar capacity only. It does not predict, certify, or imply actual mastery time.",
      relatedKnowledgeSourceIds: sourceIds,
    });
  }

  private path(
    goal: LearningMaterialGoalCandidate,
    analysis: ReturnType<typeof knowledgeAnalysisOutputSchema.parse>,
    sourceIds: string[],
  ): LearningMaterialPathCandidate {
    const prerequisites = goal.prerequisiteList.length ? goal.prerequisiteList.join(", ") : "Confirm current baseline and required vocabulary";
    const concepts = analysis.concepts.slice(0, 8).map((item) => item.name).join(", ");
    const applications = analysis.learningValue.possibleUses.slice(0, 5).join(", ") || "Apply the concepts to one bounded example";
    return learningMaterialPathCandidateSchema.parse({
      stages: [
        {
          stage: "foundation", title: "Establish prerequisites",
          objective: prerequisites, expectedArtifact: "A reviewed prerequisite checklist with identified gaps.",
          relatedKnowledgeSourceIds: sourceIds,
        },
        {
          stage: "concept", title: "Build the concept model",
          objective: `Explain and connect: ${concepts}.`, expectedArtifact: "A source-linked concept map or explanation.",
          relatedKnowledgeSourceIds: sourceIds,
        },
        {
          stage: "application", title: "Apply the material",
          objective: applications, expectedArtifact: "A worked example with assumptions and source references.",
          relatedKnowledgeSourceIds: sourceIds,
        },
        {
          stage: "project", title: "Produce a verifiable outcome",
          objective: goal.expectedOutcome, expectedArtifact: "A project candidate specification; no Mission or formal project is created.",
          relatedKnowledgeSourceIds: sourceIds,
        },
        {
          stage: "extension", title: "Test transfer and extension",
          objective: "Compare limitations, alternative explanations, and one novel application.",
          expectedArtifact: "An extension note and unanswered-question list for owner review.",
          relatedKnowledgeSourceIds: sourceIds,
        },
      ],
      relatedKnowledgeSourceIds: sourceIds,
      limitations: [
        ...analysis.limitations.slice(0, 8),
        "This path is an untrusted Candidate and does not activate a Learning Goal, Mission, Daily Plan, or Mastery Gate.",
      ],
    });
  }

  create(raw: unknown) {
    const input = createLearningMaterialCandidatesSchema.parse(raw);
    const existing = this.repository.db.prepare(
      "SELECT id FROM learning_material_candidate_sets WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, candidateSetId: existing.id, snapshot: this.snapshot() };

    const upstream = this.analysis(input.analysisCandidateId);
    const size = this.size(upstream.sourceIds, upstream.analysis.concepts.length);
    const goal = this.goal(input.targetCapability, upstream.analysis, upstream.sourceIds);
    const time = this.time(Number(upstream.row.difficulty_score), size, input.prerequisiteGap, input.availableMinutesPerWeek, upstream.sourceIds);
    const path = this.path(goal, upstream.analysis, upstream.sourceIds);
    const candidateSetId = randomUUID();
    const timestamp = now();

    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO learning_material_candidate_sets (
          id,user_id,client_request_id,analysis_candidate_id,generation_method,status,trust_class,created_at
        ) VALUES (?,?,?,?,'deterministic_v1','pending','untrusted',?)
      `).run(candidateSetId, USER_ID, input.clientRequestId, input.analysisCandidateId, timestamp);
      this.repository.db.prepare(`
        INSERT INTO material_learning_goal_candidates (
          id,user_id,candidate_set_id,target_capability,learning_objective,prerequisite_list_json,
          expected_outcome,related_source_ids_json,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,?,?,?,'pending','untrusted',?)
      `).run(randomUUID(), USER_ID, candidateSetId, goal.targetCapability, goal.learningObjective,
        JSON.stringify(goal.prerequisiteList), goal.expectedOutcome, JSON.stringify(goal.relatedKnowledgeSourceIds), timestamp);
      this.repository.db.prepare(`
        INSERT INTO material_learning_time_candidates (
          id,user_id,candidate_set_id,estimate_kind,material_complexity,knowledge_size_json,
          prerequisite_gap,available_minutes_per_week,estimated_study_hours_json,estimated_calendar_weeks_json,
          assumptions_json,disclaimer,related_source_ids_json,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','untrusted',?)
      `).run(randomUUID(), USER_ID, candidateSetId, time.estimateKind, time.materialComplexity,
        JSON.stringify(time.knowledgeSize), time.prerequisiteGap, time.availableMinutesPerWeek,
        JSON.stringify(time.estimatedStudyHours), JSON.stringify(time.estimatedCalendarWeeks),
        JSON.stringify(time.assumptions), time.disclaimer, JSON.stringify(time.relatedKnowledgeSourceIds), timestamp);
      this.repository.db.prepare(`
        INSERT INTO material_learning_path_candidates (
          id,user_id,candidate_set_id,stages_json,related_source_ids_json,limitations_json,status,trust_class,created_at
        ) VALUES (?,?,?,?,?,?,'pending','untrusted',?)
      `).run(randomUUID(), USER_ID, candidateSetId, JSON.stringify(path.stages),
        JSON.stringify(path.relatedKnowledgeSourceIds), JSON.stringify(path.limitations), timestamp);
      this.repository.db.prepare(
        "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(randomUUID(), USER_ID, "learning_material.candidates_created", "learning_material_candidate_set", candidateSetId,
        null, JSON.stringify({ status: "pending", trustClass: "untrusted", analysisCandidateId: input.analysisCandidateId, sourceIds: upstream.sourceIds }), timestamp);
    })();
    return { duplicate: false, candidateSetId, snapshot: this.snapshot() };
  }

  snapshot() {
    const sets = this.repository.db.prepare(
      "SELECT * FROM learning_material_candidate_sets WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const goals = this.repository.db.prepare(
      "SELECT * FROM material_learning_goal_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const times = this.repository.db.prepare(
      "SELECT * FROM material_learning_time_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const paths = this.repository.db.prepare(
      "SELECT * FROM material_learning_path_candidates WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    return {
      candidateSets: sets.map((row) => ({ id: String(row.id), analysisCandidateId: String(row.analysis_candidate_id), generationMethod: String(row.generation_method), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at) })),
      goalCandidates: goals.map((row) => ({ id: String(row.id), candidateSetId: String(row.candidate_set_id), ...learningMaterialGoalCandidateSchema.parse({ targetCapability: row.target_capability, learningObjective: row.learning_objective, prerequisiteList: parseJson(row.prerequisite_list_json, []), expectedOutcome: row.expected_outcome, relatedKnowledgeSourceIds: parseJson(row.related_source_ids_json, []) }), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at) })),
      timeCandidates: times.map((row) => ({ id: String(row.id), candidateSetId: String(row.candidate_set_id), ...learningMaterialTimeCandidateSchema.parse({ estimateKind: row.estimate_kind, materialComplexity: row.material_complexity, knowledgeSize: parseJson(row.knowledge_size_json, {}), prerequisiteGap: row.prerequisite_gap, availableMinutesPerWeek: row.available_minutes_per_week, estimatedStudyHours: parseJson(row.estimated_study_hours_json, {}), estimatedCalendarWeeks: parseJson(row.estimated_calendar_weeks_json, {}), assumptions: parseJson(row.assumptions_json, []), disclaimer: row.disclaimer, relatedKnowledgeSourceIds: parseJson(row.related_source_ids_json, []) }), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at) })),
      pathCandidates: paths.map((row) => ({ id: String(row.id), candidateSetId: String(row.candidate_set_id), ...learningMaterialPathCandidateSchema.parse({ stages: parseJson(row.stages_json, []), relatedKnowledgeSourceIds: parseJson(row.related_source_ids_json, []), limitations: parseJson(row.limitations_json, []) }), status: String(row.status), trustClass: String(row.trust_class), createdAt: String(row.created_at) })),
      meta: { deterministicFoundation: true, contextIntegration: false, approvalProjection: false, automaticFormalWrites: false },
    };
  }
}
