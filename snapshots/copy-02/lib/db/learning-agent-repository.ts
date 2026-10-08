import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import type {
  CurriculumPhase,
  LearningAgentDiagnosis,
  LearningAgentPlan,
  LearningResultEvaluation,
  LearningResultInput,
  TodayMission,
} from "@/lib/domain/learning-agent";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

const mapped = (record: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  ) as Record<string, unknown>;

type AgentMeta = {
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
};

export type AgentDiagnosisRecord = LearningAgentDiagnosis & {
  id: string;
  goalId: string;
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type CurriculumPhaseRecord = CurriculumPhase & {
  id: string;
  goalId: string;
  phaseIndex: number;
  status: "planned" | "active" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type TodayMissionRecord = TodayMission & {
  id: string;
  goalId: string;
  phaseId: string | null;
  missionDate: string;
  status: "planned" | "in_progress" | "completed" | "partial" | "blocked";
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type LearningAgentResultRecord = {
  id: string;
  goalId: string;
  missionId: string | null;
  clientRequestId: string;
  summary: string;
  practiceOutput: string;
  reflection: string;
  artifactUrl: string | null;
  completionStatus: "completed" | "partial" | "blocked";
  userConfidence: number;
  assessmentScore: number;
  assessment: LearningResultEvaluation;
  evidenceItemId: string | null;
  candidateId: string | null;
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type LearningAgentSnapshot = {
  diagnoses: AgentDiagnosisRecord[];
  curricula: CurriculumPhaseRecord[];
  missions: TodayMissionRecord[];
  results: LearningAgentResultRecord[];
};

export class LearningAgentRepository {
  constructor(private readonly repository: ProfileRepository) {}

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.repository.db
      .prepare(
        "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)",
      )
      .run(randomUUID(), USER_ID, action, entityType, entityId, JSON.stringify(after), now());
  }

  diagnosis(goalId: string): AgentDiagnosisRecord | null {
    const row = this.repository.db
      .prepare("SELECT * FROM learning_agent_diagnoses WHERE goal_id=?")
      .get(goalId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ...mapped(row),
      strengths: parseJson<string[]>(row.strengths_json, []),
      weaknesses: parseJson<string[]>(row.weaknesses_json, []),
      learningFocus: parseJson<string[]>(row.learning_focus_json, []),
      evidenceRefs: parseJson<string[]>(row.evidence_refs_json, []),
      limitations: parseJson<string[]>(row.limitations_json, []),
    } as AgentDiagnosisRecord;
  }

  curriculum(goalId: string): CurriculumPhaseRecord[] {
    return (
      this.repository.db
        .prepare("SELECT * FROM learning_curriculum_phases WHERE goal_id=? ORDER BY phase_index")
        .all(goalId) as Array<Record<string, unknown>>
    ).map((row) => ({
      ...mapped(row),
      knowledgePoints: parseJson<string[]>(row.knowledge_points_json, []),
      exercises: parseJson<string[]>(row.exercises_json, []),
      acceptanceCriteria: parseJson<string[]>(row.acceptance_criteria_json, []),
    }) as CurriculumPhaseRecord);
  }

  savePlan(goalId: string, plan: LearningAgentPlan, meta: AgentMeta) {
    const existing = this.diagnosis(goalId);
    if (existing) return { diagnosis: existing, curriculum: this.curriculum(goalId), duplicate: true };
    const timestamp = now();
    const diagnosisId = randomUUID();
    this.repository.db.transaction(() => {
      this.repository.db
        .prepare(
          "INSERT INTO learning_agent_diagnoses (id,goal_id,current_level,strengths_json,weaknesses_json,learning_focus_json,estimated_days,estimated_minutes,confidence,evidence_refs_json,limitations_json,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          diagnosisId,
          goalId,
          plan.diagnosis.currentLevel,
          JSON.stringify(plan.diagnosis.strengths),
          JSON.stringify(plan.diagnosis.weaknesses),
          JSON.stringify(plan.diagnosis.learningFocus),
          plan.diagnosis.estimatedDays,
          plan.diagnosis.estimatedMinutes,
          plan.diagnosis.confidence,
          JSON.stringify(plan.diagnosis.evidenceRefs),
          JSON.stringify(plan.diagnosis.limitations),
          meta.provider,
          meta.model,
          meta.modelMode,
          meta.promptVersion,
          timestamp,
          timestamp,
        );
      const insertPhase = this.repository.db.prepare(
        "INSERT INTO learning_curriculum_phases (id,goal_id,phase_index,phase_key,title,objective,knowledge_points_json,exercises_json,project,acceptance_criteria_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'planned',?,?)",
      );
      plan.curriculum.forEach((phase, index) =>
        insertPhase.run(
          randomUUID(),
          goalId,
          index + 1,
          phase.phaseKey,
          phase.title,
          phase.objective,
          JSON.stringify(phase.knowledgePoints),
          JSON.stringify(phase.exercises),
          phase.project,
          JSON.stringify(phase.acceptanceCriteria),
          timestamp,
          timestamp,
        ),
      );
      this.repository.db
        .prepare("UPDATE learning_curriculum_phases SET status='active',updated_at=? WHERE goal_id=? AND phase_index=1")
        .run(timestamp, goalId);
      this.audit("learning_agent.plan_created", "learning_goal", goalId, {
        diagnosisId,
        phaseCount: plan.curriculum.length,
        provider: meta.provider,
        modelMode: meta.modelMode,
      });
    })();
    return { diagnosis: this.diagnosis(goalId), curriculum: this.curriculum(goalId), duplicate: false };
  }

  mission(goalId: string, missionDate: string): TodayMissionRecord | null {
    const row = this.repository.db
      .prepare("SELECT * FROM daily_learning_missions WHERE goal_id=? AND mission_date=?")
      .get(goalId, missionDate) as Record<string, unknown> | undefined;
    return row ? this.mapMission(row) : null;
  }

  saveMission(goalId: string, missionDate: string, mission: TodayMission, meta: AgentMeta) {
    const existing = this.mission(goalId, missionDate);
    if (existing) return { ...existing, duplicate: true };
    const phase = this.repository.db
      .prepare("SELECT id FROM learning_curriculum_phases WHERE goal_id=? AND status='active' ORDER BY phase_index LIMIT 1")
      .get(goalId) as { id: string } | undefined;
    const id = randomUUID();
    const timestamp = now();
    this.repository.db
      .prepare(
        "INSERT INTO daily_learning_missions (id,goal_id,phase_id,mission_date,learning_objective,learning_content_json,estimated_minutes,practice_task,acceptance_questions_json,reflection_question,confidence,source_refs_json,status,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'planned',?,?,?,?,?,?)",
      )
      .run(
        id,
        goalId,
        phase?.id ?? null,
        missionDate,
        mission.learningObjective,
        JSON.stringify(mission.learningContent),
        mission.estimatedMinutes,
        mission.practiceTask,
        JSON.stringify(mission.acceptanceQuestions),
        mission.reflectionQuestion,
        mission.confidence,
        JSON.stringify(mission.sourceRefs),
        meta.provider,
        meta.model,
        meta.modelMode,
        meta.promptVersion,
        timestamp,
        timestamp,
      );
    this.audit("learning_agent.mission_created", "daily_learning_mission", id, {
      goalId,
      missionDate,
      provider: meta.provider,
    });
    return { ...this.mission(goalId, missionDate), duplicate: false };
  }

  private mapMission(row: Record<string, unknown>): TodayMissionRecord {
    return {
      ...mapped(row),
      learningContent: parseJson<string[]>(row.learning_content_json, []),
      acceptanceQuestions: parseJson<string[]>(row.acceptance_questions_json, []),
      sourceRefs: parseJson<string[]>(row.source_refs_json, []),
    } as TodayMissionRecord;
  }

  resultByRequest(clientRequestId: string): LearningAgentResultRecord | null {
    const row = this.repository.db
      .prepare("SELECT * FROM learning_agent_results WHERE client_request_id=?")
      .get(clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.mapResult(row) : null;
  }

  saveResult(
    goalId: string,
    input: LearningResultInput,
    evaluation: LearningResultEvaluation,
    meta: AgentMeta,
  ) {
    const existing = this.resultByRequest(input.clientRequestId);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db
        .prepare(
          "INSERT INTO learning_agent_results (id,goal_id,mission_id,client_request_id,summary,practice_output,reflection,artifact_url,completion_status,user_confidence,assessment_score,assessment_json,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          goalId,
          input.missionId,
          input.clientRequestId,
          input.summary,
          input.practiceOutput,
          input.reflection,
          input.artifactUrl,
          input.completionStatus,
          input.confidence,
          evaluation.score,
          JSON.stringify(evaluation),
          meta.provider,
          meta.model,
          meta.modelMode,
          meta.promptVersion,
          timestamp,
          timestamp,
        );
      if (input.missionId)
        this.repository.db
          .prepare("UPDATE daily_learning_missions SET status=?,completed_at=?,updated_at=? WHERE id=? AND goal_id=?")
          .run(input.completionStatus, timestamp, timestamp, input.missionId, goalId);
      this.audit("learning_agent.result_recorded", "learning_agent_result", id, {
        goalId,
        missionId: input.missionId,
        score: evaluation.score,
        growthGraphUpdated: false,
      });
    })();
    return { ...this.resultByRequest(input.clientRequestId), duplicate: false };
  }

  linkEvidence(resultId: string, evidenceItemId: string, candidateId: string | null) {
    this.repository.db
      .prepare("UPDATE learning_agent_results SET evidence_item_id=?,candidate_id=?,updated_at=? WHERE id=?")
      .run(evidenceItemId, candidateId, now(), resultId);
    this.audit("learning_agent.evidence_handoff", "learning_agent_result", resultId, {
      evidenceItemId,
      candidateId,
      growthGraphUpdated: false,
      approvalRequired: true,
    });
  }

  private mapResult(row: Record<string, unknown>): LearningAgentResultRecord {
    return {
      ...mapped(row),
      assessment: parseJson<LearningResultEvaluation | null>(row.assessment_json, null),
    } as LearningAgentResultRecord;
  }

  snapshot(goalId?: string): LearningAgentSnapshot {
    const goalFilter = goalId ? " AND goal_id=?" : "";
    const params = goalId ? [goalId] : [];
    const diagnoses = (
      this.repository.db
        .prepare(`SELECT * FROM learning_agent_diagnoses WHERE 1=1${goalFilter} ORDER BY updated_at DESC`)
        .all(...params) as Array<Record<string, unknown>>
    ).map((row) => ({
      ...mapped(row),
      strengths: parseJson(row.strengths_json, []),
      weaknesses: parseJson(row.weaknesses_json, []),
      learningFocus: parseJson(row.learning_focus_json, []),
      evidenceRefs: parseJson(row.evidence_refs_json, []),
      limitations: parseJson(row.limitations_json, []),
    }) as unknown as AgentDiagnosisRecord);
    const curricula = goalId
      ? this.curriculum(goalId)
      : (this.repository.db
          .prepare("SELECT * FROM learning_curriculum_phases ORDER BY goal_id,phase_index")
          .all() as Array<Record<string, unknown>>).map((row) => ({
          ...mapped(row),
          knowledgePoints: parseJson(row.knowledge_points_json, []),
          exercises: parseJson(row.exercises_json, []),
          acceptanceCriteria: parseJson(row.acceptance_criteria_json, []),
        }) as unknown as CurriculumPhaseRecord);
    const missions = (
      this.repository.db
        .prepare(`SELECT * FROM daily_learning_missions WHERE 1=1${goalFilter} ORDER BY mission_date DESC`)
        .all(...params) as Array<Record<string, unknown>>
    ).map((row) => this.mapMission(row));
    const results = (
      this.repository.db
        .prepare(`SELECT * FROM learning_agent_results WHERE 1=1${goalFilter} ORDER BY created_at DESC`)
        .all(...params) as Array<Record<string, unknown>>
    ).map((row) => this.mapResult(row));
    return { diagnoses, curricula, missions, results };
  }
}
