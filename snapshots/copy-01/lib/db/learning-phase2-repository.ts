import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  calculatePhase2Mastery,
  decideCurriculumAdjustment,
  effectiveIndependence,
  independenceWeightedScore,
  recalibrateEstimate,
  scheduleNextReview,
  type AssessmentEvaluation,
  type CodeAssessmentEvaluation,
  type CodeAssessmentInput,
  type FormalAssessmentOutput,
  type FormalAssessmentSubmission,
} from "@/lib/domain/learning-phase2";
import type { AssessmentAIMeta } from "@/lib/ai/assessment-engine";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);
const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

function mapped(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  ) as Record<string, unknown>;
}

type QuestionRow = {
  id: string;
  assessment_id: string;
  question_key: string;
  question_type: string;
  prompt: string;
  rubric_json: string;
  concept: string;
  source_resource_id: string | null;
  source_locator: string | null;
  source_reference: string | null;
  difficulty: number;
  expected_skill: string;
  position: number;
};

function questionDto(row: QuestionRow, includeExpected = false) {
  const rubric = parseJson<unknown>(row.rubric_json, []);
  const details = Array.isArray(rubric)
    ? { criteria: rubric.map(String), expectedAnswer: "", options: [] as string[] }
    : (rubric as { criteria?: string[]; expectedAnswer?: string; options?: string[] });
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    key: row.question_key,
    type: row.question_type,
    question: row.prompt,
    concept: row.concept,
    difficulty: Number(row.difficulty),
    expectedSkill: row.expected_skill,
    rubric: details.criteria ?? [],
    options: details.options ?? [],
    ...(includeExpected ? { expectedAnswer: details.expectedAnswer ?? "" } : {}),
    sourceResourceId: row.source_resource_id,
    sourceLocator: row.source_locator,
    sourceReference: row.source_reference ?? row.source_locator ?? "",
    position: Number(row.position),
  };
}

type AssessmentQuestionDto = ReturnType<typeof questionDto>;
type Phase2AssessmentDto = Record<string, unknown> & {
  questions: AssessmentQuestionDto[];
  attempts: Record<string, unknown>[];
};

type CodeAssessmentDto = Record<string, unknown> & {
  followUpQuestions: unknown[];
};

export class LearningPhase2Repository {
  constructor(private readonly repository: ProfileRepository) {}

  private get db() {
    return this.repository.db;
  }

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.db
      .prepare(
        "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)",
      )
      .run(randomUUID(), USER_ID, action, entityType, entityId, json(after), now());
  }

  sourcesForGoal(goalId: string) {
    const rows = this.db
      .prepare(
        `SELECT r.id resource_id,r.title,s.locator_type,s.locator_value,s.excerpt
         FROM learning_resources r
         JOIN resource_sections s ON s.resource_id=r.id
         WHERE r.goal_id=? AND r.status='ready' AND r.deleted_at IS NULL
         ORDER BY r.created_at,s.position LIMIT 20`,
      )
      .all(goalId) as Array<Record<string, unknown>>;
    if (rows.length)
      return rows.map((row) => ({
        resourceId: String(row.resource_id),
        title: String(row.title),
        reference: `${String(row.resource_id)}:${String(row.locator_type)}:${String(row.locator_value)}`,
        excerpt: String(row.excerpt).slice(0, 900),
      }));
    return (this.db
      .prepare(
        "SELECT id resource_id,title,extracted_text FROM learning_resources WHERE goal_id=? AND status='ready' AND deleted_at IS NULL ORDER BY created_at LIMIT 4",
      )
      .all(goalId) as Array<Record<string, unknown>>).map((row) => ({
      resourceId: String(row.resource_id),
      title: String(row.title),
      reference: `${String(row.resource_id)}:resource:全文`,
      excerpt: String(row.extracted_text ?? "").slice(0, 900),
    }));
  }

  activeNode(goalId: string, nodeId?: string | null) {
    const row = nodeId
      ? this.db.prepare("SELECT * FROM knowledge_nodes WHERE id=? AND goal_id=?").get(nodeId, goalId)
      : this.db
          .prepare(
            "SELECT * FROM knowledge_nodes WHERE goal_id=? AND learning_state IN ('ready','learning','weak','review_due') ORDER BY CASE learning_state WHEN 'review_due' THEN 0 WHEN 'weak' THEN 1 WHEN 'learning' THEN 2 ELSE 3 END,position LIMIT 1",
          )
          .get(goalId);
    return row ? mapped(row as Record<string, unknown>) : null;
  }

  syncResourceIntelligence(resourceId: string) {
    const resource = this.db
      .prepare("SELECT * FROM learning_resources WHERE id=?")
      .get(resourceId) as Record<string, unknown> | undefined;
    if (!resource) throw new Error("LEARNING_RESOURCE_NOT_FOUND");
    const sections = this.db
      .prepare("SELECT title,locator_type,locator_value,excerpt FROM resource_sections WHERE resource_id=? ORDER BY position")
      .all(resourceId) as Array<Record<string, unknown>>;
    const legacyStatus = String(resource.status);
    const intelligenceStatus =
      legacyStatus === "ready"
        ? "ready"
        : legacyStatus === "queued"
          ? "waiting"
          : legacyStatus === "processing"
            ? "processing"
            : legacyStatus === "unsupported"
              ? "incomplete"
              : "failed";
    const concepts = parseJson<string[]>(resource.key_concepts_json, []);
    const prerequisites = parseJson<string[]>(resource.prerequisites_json, []);
    const practice = parseJson<string[]>(resource.practice_opportunities_json, []);
    const chapters = sections.map((section, index) => ({
      index,
      title: String(section.title),
      locator: `${String(section.locator_type)}:${String(section.locator_value)}`,
    }));
    const dependencies = chapters.slice(1).map((chapter, index) => ({
      prerequisite: chapters[index]?.title,
      next: chapter.title,
    }));
    const citations = sections.map((section) => ({
      resourceId,
      locatorType: String(section.locator_type),
      locatorValue: String(section.locator_value),
      excerpt: String(section.excerpt).slice(0, 280),
    }));
    const limitations = intelligenceStatus === "ready"
      ? sections.length
        ? ["引用仅限已真实提取的章节、标题、段落或页码定位。"]
        : ["正文可读，但没有稳定章节定位；引用只能指向全文。"]
      : [String(resource.status_message || "内容不可读取，未进行语义分析。")];
    const id = randomUUID();
    const timestamp = now();
    this.db
      .prepare(
        `INSERT INTO resource_intelligence
         (id,resource_id,intelligence_status,confirmed_author,chapters_json,concepts_json,prerequisites_json,difficulty,estimated_minutes,practice_opportunities_json,chapter_dependencies_json,citations_json,confidence,limitations_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(resource_id) DO UPDATE SET intelligence_status=excluded.intelligence_status,confirmed_author=excluded.confirmed_author,chapters_json=excluded.chapters_json,concepts_json=excluded.concepts_json,prerequisites_json=excluded.prerequisites_json,difficulty=excluded.difficulty,estimated_minutes=excluded.estimated_minutes,practice_opportunities_json=excluded.practice_opportunities_json,chapter_dependencies_json=excluded.chapter_dependencies_json,citations_json=excluded.citations_json,confidence=excluded.confidence,limitations_json=excluded.limitations_json,updated_at=excluded.updated_at`,
      )
      .run(
        id,
        resourceId,
        intelligenceStatus,
        null,
        json(chapters),
        json(concepts),
        json(prerequisites),
        resource.difficulty ?? null,
        resource.estimated_minutes ?? null,
        json(practice),
        json(dependencies),
        json(citations),
        intelligenceStatus === "ready" ? (sections.length ? 0.78 : 0.58) : intelligenceStatus === "incomplete" ? 0.3 : 0.1,
        json(limitations),
        timestamp,
        timestamp,
      );
    return this.resourceIntelligence(resourceId);
  }

  syncAllResourceIntelligence(goalId?: string) {
    const ids = (this.db
      .prepare(`SELECT id FROM learning_resources WHERE deleted_at IS NULL${goalId ? " AND goal_id=?" : ""}`)
      .all(...(goalId ? [goalId] : [])) as Array<{ id: string }>).map((item) => item.id);
    ids.forEach((id) => this.syncResourceIntelligence(id));
  }

  resourceIntelligence(resourceId: string) {
    const row = this.db.prepare("SELECT * FROM resource_intelligence WHERE resource_id=?").get(resourceId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ...mapped(row),
      chapters: parseJson(row.chapters_json, []),
      concepts: parseJson(row.concepts_json, []),
      prerequisites: parseJson(row.prerequisites_json, []),
      practiceOpportunities: parseJson(row.practice_opportunities_json, []),
      chapterDependencies: parseJson(row.chapter_dependencies_json, []),
      citations: parseJson(row.citations_json, []),
      limitations: parseJson(row.limitations_json, []),
    };
  }

  assessmentByRequest(clientRequestId: string) {
    const row = this.db.prepare("SELECT id FROM assessments WHERE client_request_id=?").get(clientRequestId) as { id: string } | undefined;
    return row ? this.assessment(row.id) : null;
  }

  createAssessment(
    goalId: string,
    request: { clientRequestId: string; nodeId: string | null; missionId: string | null; assessmentType: string },
    output: FormalAssessmentOutput,
    meta: AssessmentAIMeta,
  ) {
    const existing = this.assessmentByRequest(request.clientRequestId);
    if (existing) return Object.assign(existing, { duplicate: true as const });
    const assessmentId = randomUUID();
    const timestamp = now();
    const attempt = this.db
      .prepare("SELECT COUNT(*) count FROM assessments WHERE goal_id=? AND assessment_type=?")
      .get(goalId, request.assessmentType) as { count: number };
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO assessments
           (id,goal_id,diagnostic_id,assessment_type,status,model_mode,created_at,updated_at,client_request_id,node_id,mission_id,attempt_number,is_delayed,provider,model,prompt_version)
           VALUES (?,?,NULL,?,'ready',?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          assessmentId,
          goalId,
          request.assessmentType,
          meta.mode,
          timestamp,
          timestamp,
          request.clientRequestId,
          request.nodeId,
          request.missionId,
          Number(attempt.count) + 1,
          request.assessmentType === "delayed" ? 1 : 0,
          meta.provider,
          meta.model,
          "formal-assessment-v1",
        );
      const insert = this.db.prepare(
        `INSERT INTO assessment_questions
         (id,assessment_id,question_key,question_type,prompt,rubric_json,concept,source_resource_id,source_locator,position,difficulty,expected_skill,source_reference)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      output.questions.forEach((question, index) => {
        const [resourceId, ...locator] = question.sourceRef.split(":");
        const sourceExists = this.db.prepare("SELECT 1 FROM learning_resources WHERE id=? AND goal_id=?").get(resourceId, goalId);
        insert.run(
          randomUUID(),
          assessmentId,
          question.key,
          question.type,
          question.question,
          json({ criteria: question.rubric, expectedAnswer: question.expectedAnswer, options: question.options }),
          question.concept,
          sourceExists ? resourceId : null,
          locator.join(":") || question.sourceRef,
          index,
          question.difficulty,
          question.expectedSkill,
          question.sourceRef,
        );
      });
      this.audit("learning_assessment.created", "assessment", assessmentId, {
        goalId,
        nodeId: request.nodeId,
        type: request.assessmentType,
        questionTypes: output.questions.map((item) => item.type),
        provider: meta.provider,
      });
    })();
    return Object.assign(this.assessment(assessmentId), { duplicate: false as const });
  }

  assessment(id: string, includeExpected = false): Phase2AssessmentDto {
    const row = this.db.prepare("SELECT * FROM assessments WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("ASSESSMENT_NOT_FOUND");
    const questions = (this.db
      .prepare("SELECT * FROM assessment_questions WHERE assessment_id=? ORDER BY position")
      .all(id) as QuestionRow[]).map((item) => questionDto(item, includeExpected));
    const attempts = (this.db
      .prepare("SELECT * FROM assessment_attempts WHERE assessment_id=? ORDER BY created_at")
      .all(id) as Array<Record<string, unknown>>).map(mapped);
    return Object.assign(mapped(row), { questions, attempts });
  }

  private typeMetrics(nodeId: string) {
    const rows = this.db
      .prepare(
        `SELECT q.question_type,a.score,a.raw_score,a.reasoning_quality,a.independence_level,a.hint_count,a.is_delayed
         FROM assessment_attempts a JOIN assessment_questions q ON q.id=a.question_id
         JOIN assessments s ON s.id=a.assessment_id WHERE s.node_id=?`,
      )
      .all(nodeId) as Array<Record<string, unknown>>;
    const average = (types: string[], field = "score", predicate: (row: Record<string, unknown>) => boolean = () => true) => {
      const values = rows.filter((row) => types.includes(String(row.question_type)) && predicate(row)).map((row) => Number(row[field] ?? 0));
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    };
    const delayedEvidence = (this.db
      .prepare("SELECT score FROM mastery_evidence WHERE node_id=? AND is_delayed=1")
      .all(nodeId) as Array<{ score: number }>).map((row) => Number(row.score));
    const practical = rows.filter((row) => ["code_task", "mini_project"].includes(String(row.question_type)));
    const engineeringIndependence = practical.length
      ? practical.reduce((sum, row) => sum + effectiveIndependence(Number(row.independence_level), Number(row.hint_count)) / 4, 0) / practical.length
      : 0;
    return {
      immediateCorrectness: average(["choice", "true_false"]),
      delayedCorrectness: delayedEvidence.length
        ? delayedEvidence.reduce((sum, value) => sum + value, 0) / delayedEvidence.length
        : 0,
      explanation: average(["concept_explanation"], "reasoning_quality"),
      correction: average(["correction"]),
      transfer: average(["transfer"]),
      practice: average(["code_task", "mini_project"]),
      engineeringIndependence,
    };
  }

  private updateMastery(nodeId: string, reason: string) {
    const node = this.db.prepare("SELECT * FROM knowledge_nodes WHERE id=?").get(nodeId) as Record<string, unknown> | undefined;
    if (!node) return null;
    const calculated = calculatePhase2Mastery(this.typeMetrics(nodeId));
    const evidence = this.db.prepare("SELECT COUNT(*) count FROM mastery_evidence WHERE node_id=?").get(nodeId) as { count: number };
    const state =
      calculated.mastery >= 0.82 && calculated.metrics.delayedCorrectness >= 0.68 && evidence.count >= 7
        ? "mastered"
        : calculated.mastery < 0.5
          ? "weak"
          : "learning";
    const legacy = state === "mastered" ? "mastered" : state === "weak" ? "review" : "learning";
    const timestamp = now();
    this.db
      .prepare(
        "UPDATE knowledge_nodes SET mastery=?,mastery_confidence=?,evidence_count=?,status=?,learning_state=?,last_assessed_at=?,updated_at=? WHERE id=?",
      )
      .run(calculated.mastery, calculated.confidence, evidence.count, legacy, state, timestamp, timestamp, nodeId);
    this.db
      .prepare(
        "INSERT INTO mastery_snapshots (id,goal_id,node_id,mastery,confidence,evidence_count,reason,created_at,metrics_json,independence_level,delayed_score) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        node.goal_id,
        nodeId,
        calculated.mastery,
        calculated.confidence,
        evidence.count,
        reason,
        timestamp,
        json(calculated.metrics),
        calculated.metrics.engineeringIndependence * 4,
        calculated.metrics.delayedCorrectness,
      );
    return calculated;
  }

  private scheduleReview(goalId: string, nodeId: string, signals: Parameters<typeof scheduleNextReview>[0]) {
    const current = this.db.prepare("SELECT * FROM review_schedule WHERE node_id=?").get(nodeId) as Record<string, unknown> | undefined;
    const schedule = scheduleNextReview({
      ...signals,
      previousIntervalDays: Number(current?.interval_days ?? signals.previousIntervalDays),
    });
    const timestamp = now();
    const dueAt = new Date(Date.now() + schedule.intervalDays * 86_400_000).toISOString();
    this.db
      .prepare(
        `INSERT INTO review_schedule (id,goal_id,node_id,due_at,interval_days,reason,status,updated_at,stability,difficulty_factor,lapse_count,last_attempt_at)
         VALUES (?,?,?,?,?,?,'scheduled',?,?,?,?,?)
         ON CONFLICT(node_id) DO UPDATE SET due_at=excluded.due_at,interval_days=excluded.interval_days,reason=excluded.reason,status='scheduled',updated_at=excluded.updated_at,stability=excluded.stability,difficulty_factor=excluded.difficulty_factor,lapse_count=review_schedule.lapse_count+?,last_attempt_at=excluded.last_attempt_at`,
      )
      .run(
        randomUUID(),
        goalId,
        nodeId,
        dueAt,
        schedule.intervalDays,
        schedule.reason,
        timestamp,
        schedule.stability,
        schedule.difficultyFactor,
        signals.repeatedError ? 1 : 0,
        timestamp,
        signals.repeatedError ? 1 : 0,
      );
    this.db.prepare("UPDATE knowledge_nodes SET next_review_at=? WHERE id=?").run(dueAt, nodeId);
    return { ...schedule, dueAt };
  }

  private pathSnapshot(goalId: string) {
    return (this.db
      .prepare("SELECT id,title,position,learning_state,mastery FROM knowledge_nodes WHERE goal_id=? ORDER BY position")
      .all(goalId) as Array<Record<string, unknown>>).map((row) => mapped(row));
  }

  private adaptCurriculum(input: {
    goalId: string;
    nodeId: string;
    assessmentId: string | null;
    triggerType: "assessment" | "learning_result" | "review" | "evidence";
    sourceId: string;
    score: number;
    delayedScore: number;
    transferScore: number;
    practiceScore: number;
    independenceLevel: number;
    prerequisiteGap: boolean;
  }) {
    const oldPath = this.pathSnapshot(input.goalId);
    const decision = decideCurriculumAdjustment(input);
    const timestamp = now();
    if (decision.action === "advance_phase") {
      const active = this.db
        .prepare("SELECT phase_index FROM learning_curriculum_phases WHERE goal_id=? AND status='active' ORDER BY phase_index LIMIT 1")
        .get(input.goalId) as { phase_index: number } | undefined;
      if (active) {
        this.db.prepare("UPDATE learning_curriculum_phases SET status='completed',updated_at=? WHERE goal_id=? AND phase_index=?").run(timestamp, input.goalId, active.phase_index);
        this.db.prepare("UPDATE learning_curriculum_phases SET status='active',updated_at=? WHERE goal_id=? AND phase_index=? AND status='planned'").run(timestamp, input.goalId, active.phase_index + 1);
      }
      const node = this.db.prepare("SELECT position FROM knowledge_nodes WHERE id=?").get(input.nodeId) as { position: number };
      this.db.prepare("UPDATE knowledge_nodes SET learning_state='ready',status='ready',updated_at=? WHERE goal_id=? AND position=? AND status='locked'").run(timestamp, input.goalId, node.position + 1);
    } else if (decision.action === "remediate_prerequisite") {
      const prerequisite = this.db
        .prepare(
          "SELECT prerequisite_node_id id FROM knowledge_edges WHERE dependent_node_id=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(input.nodeId) as { id: string } | undefined;
      if (prerequisite)
        this.db.prepare("UPDATE knowledge_nodes SET learning_state='ready',status='ready',updated_at=? WHERE id=?").run(timestamp, prerequisite.id);
    } else if (decision.action === "lower_difficulty" || decision.action === "increase_practice") {
      this.db.prepare("UPDATE knowledge_nodes SET learning_state='weak',status='review',updated_at=? WHERE id=?").run(timestamp, input.nodeId);
    } else if (decision.action === "schedule_review") {
      this.db.prepare("UPDATE knowledge_nodes SET learning_state='review_due',status='review',updated_at=? WHERE id=?").run(timestamp, input.nodeId);
    }
    const newPath = this.pathSnapshot(input.goalId);
    const adjustmentId = randomUUID();
    this.db
      .prepare(
        "INSERT INTO curriculum_adjustments (id,goal_id,node_id,assessment_id,trigger_type,action,reason,evidence_json,old_path_json,new_path_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(adjustmentId, input.goalId, input.nodeId, input.assessmentId, input.triggerType, decision.action, decision.reason, json(input), json(oldPath), json(newPath), timestamp);
    this.db.prepare("UPDATE learning_paths SET rationale=?,version=version+1,updated_at=? WHERE goal_id=?").run(decision.reason, timestamp, input.goalId);
    this.audit("learning_curriculum.adjusted", "curriculum_adjustment", adjustmentId, { ...decision, evidence: input });
    return { id: adjustmentId, ...decision, oldPath, newPath, createdAt: timestamp };
  }

  private recalibrate(goalId: string, input: { actualMinutes: number; score: number; delayedScore: number }) {
    const previous = this.db
      .prepare("SELECT * FROM learning_time_estimates WHERE goal_id=? ORDER BY created_at DESC LIMIT 1")
      .get(goalId) as Record<string, unknown> | undefined;
    const goal = this.db.prepare("SELECT * FROM learning_goals WHERE id=?").get(goalId) as Record<string, unknown>;
    const gaps = this.db.prepare("SELECT prerequisite_gaps_json FROM baseline_diagnostics WHERE goal_id=?").get(goalId) as { prerequisite_gaps_json?: string } | undefined;
    const estimate = recalibrateEstimate({
      previousRealisticMinutes: Number(previous?.realistic_minutes ?? 1_800),
      plannedMinutes: Number(goal.daily_minutes ?? 60),
      actualMinutes: input.actualMinutes,
      assessmentScore: input.score,
      prerequisiteGapCount: parseJson<unknown[]>(gaps?.prerequisite_gaps_json, []).length,
      delayedScore: input.delayedScore,
      projectComplexity: Number(goal.mastery_level ?? 3),
      dailyMinutes: Number(goal.daily_minutes ?? 60),
    });
    const id = randomUUID();
    const timestamp = now();
    const realistic = estimate.realisticMinutes;
    this.db
      .prepare(
        `INSERT INTO learning_time_estimates
         (id,goal_id,diagnostic_id,optimistic_minutes,realistic_minutes,conservative_minutes,prerequisite_minutes,theory_minutes,practice_minutes,project_minutes,review_minutes,confidence,uncertainty_json,calibration_reason,created_at,realistic_min_minutes,realistic_max_minutes,estimated_finish_date,basis_json,previous_estimate_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        goalId,
        previous?.diagnostic_id ?? null,
        estimate.optimisticMinutes,
        realistic,
        estimate.conservativeMinutes,
        Math.round(realistic * 0.12),
        Math.round(realistic * 0.2),
        Math.round(realistic * 0.26),
        Math.round(realistic * 0.3),
        Math.round(realistic * 0.12),
        estimate.confidence,
        json(["学习速度和工程调试仍可能变化。"]),
        estimate.reason,
        timestamp,
        estimate.realisticMinMinutes,
        estimate.realisticMaxMinutes,
        estimate.estimatedFinishDate,
        json(input),
        previous?.id ?? null,
      );
    return { id, ...estimate, createdAt: timestamp, previousEstimateId: previous?.id ?? null };
  }

  saveAssessmentSubmission(
    assessmentId: string,
    submission: FormalAssessmentSubmission,
    evaluation: AssessmentEvaluation,
  ) {
    const assessment = this.assessment(assessmentId, true);
    if (String(assessment.status) === "graded")
      return { ...this.assessment(assessmentId), duplicate: true as const };
    if (submission.answers.length !== assessment.questions.length) throw new Error("ASSESSMENT_INCOMPLETE_SUBMISSION");
    const nodeId = String(assessment.nodeId || "");
    if (!nodeId) throw new Error("ASSESSMENT_NODE_REQUIRED");
    const goalId = String(assessment.goalId);
    const timestamp = now();
    const byQuestion = new Map(evaluation.items.map((item) => [item.questionId, item]));
    const summaries: Array<{ type: string; score: number; rawScore: number; independence: number; hintCount: number; isDelayed: boolean }> = [];
    this.db.transaction(() => {
      for (const [index, answer] of submission.answers.entries()) {
        const question = assessment.questions.find((item) => item.id === answer.questionId);
        const evaluated = byQuestion.get(answer.questionId);
        if (!question || !evaluated) throw new Error("ASSESSMENT_UNKNOWN_QUESTION");
        const questionType = String(question.type);
        const practical = ["code_task", "mini_project"].includes(questionType);
        const objective = ["choice", "true_false"].includes(questionType);
        const normalizedAnswer = answer.userAnswer.trim().toLocaleLowerCase("zh-CN").replace(/[。；;,.，\s]+$/g, "");
        const normalizedExpected = String(question.expectedAnswer || "").trim().toLocaleLowerCase("zh-CN");
        const objectiveCorrect = objective && (
          normalizedExpected === normalizedAnswer ||
          normalizedExpected.startsWith(`${normalizedAnswer}；`) ||
          normalizedExpected.startsWith(`${normalizedAnswer};`) ||
          normalizedExpected.startsWith(`${normalizedAnswer}。`)
        );
        const rawScore = objective ? (objectiveCorrect ? 1 : 0) : evaluated.rawScore;
        const correctness = objective ? (objectiveCorrect ? "correct" : "incorrect") : evaluated.correctness;
        const feedback = objective
          ? `${objectiveCorrect ? "客观题答案正确" : "客观题答案错误"}；推理说明仍由 Assessment Evaluator 单独评估。`
          : evaluated.feedback;
        const misconception = objective && !objectiveCorrect
          ? "客观题答案与服务端保存的预期答案不一致。"
          : evaluated.misconception;
        const score = independenceWeightedScore(rawScore, answer.independenceLevel, answer.hintCount, practical);
        const attemptId = randomUUID();
        const evidenceId = randomUUID();
        const isDelayedEvidence = questionType === "delayed_recall" && ["delayed", "review"].includes(String(assessment.assessmentType));
        const evidenceType = {
          concept_explanation: "explanation",
          choice: "immediate_test",
          true_false: "immediate_test",
          correction: "correction",
          transfer: "transfer",
          code_task: "coding",
          mini_project: "project",
          delayed_recall: isDelayedEvidence ? "delayed_test" : "active_recall",
        }[questionType] ?? "immediate_test";
        this.db
          .prepare(
            `INSERT INTO assessment_attempts
             (id,assessment_id,question_id,user_answer,response_time_seconds,confidence,score,correctness,error_type,ai_evaluation,evidence_source,created_at,client_request_id,hint_count,reasoning_quality,independence_level,raw_score,evidence_id,is_delayed)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            attemptId,
            assessmentId,
            answer.questionId,
            answer.userAnswer,
            answer.answerDurationSeconds,
            answer.confidence,
            score,
            correctness,
            misconception,
            feedback,
            question.sourceReference,
            timestamp,
            `${submission.clientRequestId}:${index}`,
            answer.hintCount,
            evaluated.reasoningQuality,
            answer.independenceLevel,
            rawScore,
            null,
            isDelayedEvidence ? 1 : 0,
          );
        this.db
          .prepare(
            `INSERT INTO mastery_evidence
             (id,goal_id,node_id,session_id,evidence_type,score,detail,code_authorship,artifact_url,created_at,user_output,ai_evaluation,confidence,is_delayed,is_independent,independence_level,hint_count,assessment_attempt_id)
             VALUES (?,?,?,NULL,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            evidenceId,
            goalId,
            nodeId,
            evidenceType,
            score,
            `${question.question}\n来源：${question.sourceReference}`,
            answer.independenceLevel === 0 ? "ai_generated" : answer.independenceLevel >= 3 ? "user_independent" : "user_modified",
            timestamp,
            answer.userAnswer,
            feedback,
            answer.confidence,
            isDelayedEvidence ? 1 : 0,
            effectiveIndependence(answer.independenceLevel, answer.hintCount) >= 3 ? 1 : 0,
            answer.independenceLevel,
            answer.hintCount,
            attemptId,
          );
        this.db.prepare("UPDATE assessment_attempts SET evidence_id=? WHERE id=?").run(evidenceId, attemptId);
        summaries.push({ type: questionType, score, rawScore, independence: effectiveIndependence(answer.independenceLevel, answer.hintCount), hintCount: answer.hintCount, isDelayed: isDelayedEvidence });
      }
      this.db.prepare("UPDATE assessments SET status='graded',submitted_at=?,updated_at=? WHERE id=?").run(timestamp, timestamp, assessmentId);
      const misconceptions = evaluation.items.map((item) => item.misconception).filter(Boolean);
      if (misconceptions.length) {
        const node = this.db.prepare("SELECT misconceptions_json FROM knowledge_nodes WHERE id=?").get(nodeId) as { misconceptions_json: string };
        const existing = parseJson<string[]>(node.misconceptions_json, []);
        this.db.prepare("UPDATE knowledge_nodes SET misconceptions_json=? WHERE id=?").run(json([...new Set([...existing, ...misconceptions.map(String)])].slice(-12)), nodeId);
      }
    })();
    const mastery = this.updateMastery(nodeId, `正式 Assessment ${assessmentId} 产生 ${summaries.length} 条分维度证据`);
    const average = summaries.reduce((sum, item) => sum + item.score, 0) / Math.max(1, summaries.length);
    const delayed = summaries.filter((item) => item.isDelayed);
    const transfer = summaries.filter((item) => item.type === "transfer");
    const practice = summaries.filter((item) => ["code_task", "mini_project"].includes(item.type));
    const averageOf = (items: typeof summaries) => items.length ? items.reduce((sum, item) => sum + item.score, 0) / items.length : 0;
    const independence = practice.length ? practice.reduce((sum, item) => sum + item.independence, 0) / practice.length : 0;
    const totalSeconds = submission.answers.reduce((sum, item) => sum + item.answerDurationSeconds, 0);
    const review = this.scheduleReview(goalId, nodeId, {
      score: average,
      responseTimeSeconds: Math.round(totalSeconds / Math.max(1, submission.answers.length)),
      expectedSeconds: 180,
      confidence: Math.round(submission.answers.reduce((sum, item) => sum + item.confidence, 0) / submission.answers.length),
      hintCount: submission.answers.reduce((sum, item) => sum + item.hintCount, 0),
      independenceLevel: independence,
      repeatedError: evaluation.items.filter((item) => item.correctness === "incorrect").length >= 2,
      transferScore: averageOf(transfer),
      previousIntervalDays: 0,
    });
    const adjustment = this.adaptCurriculum({
      goalId,
      nodeId,
      assessmentId,
      triggerType: "assessment",
      sourceId: assessmentId,
      score: average,
      delayedScore: averageOf(delayed),
      transferScore: averageOf(transfer),
      practiceScore: averageOf(practice),
      independenceLevel: independence,
      prerequisiteGap: summaries.slice(0, 2).some((item) => item.score < 0.42),
    });
    const estimate = this.recalibrate(goalId, { actualMinutes: Math.ceil(totalSeconds / 60), score: average, delayedScore: averageOf(delayed) });
    this.audit("learning_assessment.graded", "assessment", assessmentId, { average, mastery, review, adjustment: adjustment.action, estimateId: estimate.id });
    return {
      ...this.assessment(assessmentId),
      duplicate: false as const,
      summary: { average, mastery, review, adjustment, estimate },
    };
  }

  recordAdaptiveSignal(input: {
    goalId: string;
    nodeId: string;
    triggerType: "learning_result" | "review" | "evidence";
    sourceId: string;
    score: number;
    delayedScore?: number;
    transferScore?: number;
    practiceScore?: number;
    independenceLevel?: number;
    prerequisiteGap?: boolean;
    actualMinutes?: number;
  }) {
    const existing = this.db
      .prepare(
        "SELECT * FROM curriculum_adjustments WHERE goal_id=? AND trigger_type=? AND json_extract(evidence_json,'$.sourceId')=? ORDER BY created_at DESC LIMIT 1",
      )
      .get(input.goalId, input.triggerType, input.sourceId) as Record<string, unknown> | undefined;
    if (existing)
      return {
        adjustment: { ...mapped(existing), duplicate: true },
        estimate: null,
      };
    const node = this.db
      .prepare("SELECT id FROM knowledge_nodes WHERE id=? AND goal_id=?")
      .get(input.nodeId, input.goalId);
    if (!node) throw new Error("KNOWLEDGE_NODE_NOT_FOUND");
    const timestamp = now();
    this.db
      .prepare(
        input.triggerType === "learning_result"
          ? "UPDATE knowledge_nodes SET last_studied_at=?,updated_at=? WHERE id=?"
          : "UPDATE knowledge_nodes SET last_assessed_at=?,updated_at=? WHERE id=?",
      )
      .run(timestamp, timestamp, input.nodeId);
    const adjustment = this.adaptCurriculum({
      goalId: input.goalId,
      nodeId: input.nodeId,
      assessmentId: null,
      triggerType: input.triggerType,
      sourceId: input.sourceId,
      score: input.score,
      delayedScore: input.delayedScore ?? 0,
      transferScore: input.transferScore ?? 0,
      practiceScore: input.practiceScore ?? 0,
      independenceLevel: input.independenceLevel ?? 0,
      prerequisiteGap: input.prerequisiteGap ?? false,
    });
    const estimate = this.recalibrate(input.goalId, {
      actualMinutes: Math.max(1, input.actualMinutes ?? 1),
      score: input.score,
      delayedScore: input.delayedScore ?? 0,
    });
    return { adjustment, estimate };
  }

  codeAssessmentByRequest(clientRequestId: string) {
    const row = this.db.prepare("SELECT * FROM code_assessments WHERE client_request_id=?").get(clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.codeAssessmentDto(row) : null;
  }

  saveCodeAssessment(goalId: string, input: CodeAssessmentInput, evaluation: CodeAssessmentEvaluation, meta: AssessmentAIMeta) {
    const existing = this.codeAssessmentByRequest(input.clientRequestId);
    if (existing) return Object.assign(existing, { duplicate: true as const });
    const id = randomUUID();
    const timestamp = now();
    const metricAverage = (evaluation.correctness + evaluation.structure + evaluation.readability + evaluation.errorHandling + evaluation.testing + evaluation.engineering + evaluation.understanding) / 7;
    const weighted = independenceWeightedScore(metricAverage, input.independenceLevel, input.hintCount, true);
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO code_assessments
           (id,goal_id,node_id,client_request_id,language,filename,source_code,user_explanation,changed_condition_answer,failure_analysis,hint_count,independence_level,correctness,structure_score,readability_score,error_handling_score,testing_score,engineering_score,understanding_score,weighted_score,feedback,follow_up_questions_json,provider,model,model_mode,prompt_version,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id, goalId, input.nodeId, input.clientRequestId, input.language, input.filename, input.sourceCode, input.userExplanation, input.changedConditionAnswer, input.failureAnalysis, input.hintCount, input.independenceLevel,
          evaluation.correctness, evaluation.structure, evaluation.readability, evaluation.errorHandling, evaluation.testing, evaluation.engineering, evaluation.understanding, weighted, evaluation.feedback, json(evaluation.followUpQuestions), meta.provider, meta.model, meta.mode, "code-assessment-v1", timestamp, timestamp,
        );
      if (input.nodeId)
        this.db
          .prepare(
            `INSERT INTO mastery_evidence
             (id,goal_id,node_id,session_id,evidence_type,score,detail,code_authorship,artifact_url,created_at,user_output,ai_evaluation,confidence,is_delayed,is_independent,independence_level,hint_count,assessment_attempt_id)
             VALUES (?,?,?,NULL,'coding',?,?,?,NULL,?,?,?,?,0,?,?,?,NULL)`,
          )
          .run(randomUUID(), goalId, input.nodeId, weighted, `代码评估：${input.filename || input.language}`, input.independenceLevel === 0 ? "ai_generated" : input.independenceLevel >= 3 ? "user_independent" : "user_modified", timestamp, input.sourceCode, evaluation.feedback, Math.max(1, Math.min(5, Math.round(evaluation.confidence * 5))), effectiveIndependence(input.independenceLevel, input.hintCount) >= 3 ? 1 : 0, input.independenceLevel, input.hintCount);
      this.audit("learning_code_assessment.created", "code_assessment", id, { goalId, weighted, independenceLevel: input.independenceLevel, hintCount: input.hintCount });
    })();
    if (input.nodeId) this.updateMastery(input.nodeId, `Code Assessment ${id} 产生代码证据`);
    const persisted = this.codeAssessmentByRequest(input.clientRequestId);
    if (!persisted) throw new Error("CODE_ASSESSMENT_PERSIST_FAILED");
    return Object.assign(persisted, { duplicate: false as const });
  }

  linkCodeEvidence(id: string, evidenceItemId: string, candidateId: string | null) {
    this.db.prepare("UPDATE code_assessments SET evidence_item_id=?,candidate_id=?,updated_at=? WHERE id=?").run(evidenceItemId, candidateId, now(), id);
    return this.db.prepare("SELECT * FROM code_assessments WHERE id=?").get(id) as Record<string, unknown>;
  }

  private codeAssessmentDto(row: Record<string, unknown>): CodeAssessmentDto {
    return Object.assign(mapped(row), {
      followUpQuestions: parseJson<unknown[]>(row.follow_up_questions_json, []),
    });
  }

  snapshot(goalId?: string) {
    if (goalId) this.syncAllResourceIntelligence(goalId);
    const args = goalId ? [goalId] : [];
    const resources = (this.db
      .prepare(
        `SELECT i.*,r.goal_id,r.title,r.source_type,r.source_url,r.status legacy_status,r.status_message,r.error_code
         FROM resource_intelligence i JOIN learning_resources r ON r.id=i.resource_id${goalId ? " WHERE r.goal_id=?" : ""}
         ORDER BY i.updated_at DESC`,
      )
      .all(...args) as Array<Record<string, unknown>>).map((row) => ({
      ...mapped(row),
      chapters: parseJson(row.chapters_json, []),
      concepts: parseJson(row.concepts_json, []),
      prerequisites: parseJson(row.prerequisites_json, []),
      practiceOpportunities: parseJson(row.practice_opportunities_json, []),
      chapterDependencies: parseJson(row.chapter_dependencies_json, []),
      citations: parseJson(row.citations_json, []),
      limitations: parseJson(row.limitations_json, []),
    }));
    const assessmentRows = (goalId
      ? this.db
          .prepare("SELECT id FROM assessments WHERE goal_id=? AND assessment_type!='baseline' ORDER BY created_at DESC")
          .all(goalId)
      : this.db
          .prepare("SELECT id FROM assessments WHERE assessment_type!='baseline' ORDER BY created_at DESC")
          .all()) as Array<{ id: string }>;
    const assessments = assessmentRows.map((item) => this.assessment(item.id));
    const adjustments = (this.db.prepare(`SELECT * FROM curriculum_adjustments${goalId ? " WHERE goal_id=?" : ""} ORDER BY created_at DESC`).all(...args) as Array<Record<string, unknown>>).map((row) => ({ ...mapped(row), evidence: parseJson(row.evidence_json, {}), oldPath: parseJson(row.old_path_json, []), newPath: parseJson(row.new_path_json, []) }));
    const codeAssessments = (this.db.prepare(`SELECT * FROM code_assessments${goalId ? " WHERE goal_id=?" : ""} ORDER BY created_at DESC`).all(...args) as Array<Record<string, unknown>>).map((row) => this.codeAssessmentDto(row));
    const goals = (this.db.prepare(`SELECT * FROM learning_goals${goalId ? " WHERE id=?" : " WHERE user_id='genesis-owner' AND deleted_at IS NULL"} ORDER BY created_at DESC`).all(...args) as Array<Record<string, unknown>>).map(mapped);
    const selectedGoal = goals[0] ?? null;
    const selectedGoalId = goalId ?? String(selectedGoal?.id ?? "");
    const nodes = selectedGoalId
      ? (this.db.prepare("SELECT * FROM knowledge_nodes WHERE goal_id=? ORDER BY position").all(selectedGoalId) as Array<Record<string, unknown>>).map((row) => Object.assign(mapped(row), {
          prerequisites: parseJson(row.prerequisites_json, []),
          nextConcepts: parseJson(row.next_concepts_json, []),
          resourceRefs: parseJson(row.resource_refs_json, []),
          misconceptions: parseJson(row.misconceptions_json, []),
        }))
      : [];
    const reviews = selectedGoalId
      ? (this.db.prepare("SELECT * FROM review_schedule WHERE goal_id=? ORDER BY due_at").all(selectedGoalId) as Array<Record<string, unknown>>).map((row) => ({ ...mapped(row), isDue: new Date(String(row.due_at)).getTime() <= Date.now() }))
      : [];
    const reviewAttempts = selectedGoalId
      ? (this.db.prepare("SELECT a.*,n.title node_title FROM review_attempts a JOIN knowledge_nodes n ON n.id=a.node_id WHERE a.goal_id=? ORDER BY a.created_at DESC LIMIT 100").all(selectedGoalId) as Array<Record<string, unknown>>).map(mapped)
      : [];
    const missions = selectedGoalId
      ? (this.db.prepare("SELECT * FROM daily_learning_missions WHERE goal_id=? ORDER BY mission_date DESC LIMIT 3").all(selectedGoalId) as Array<Record<string, unknown>>).map(mapped)
      : [];
    const estimates = selectedGoalId
      ? (this.db.prepare("SELECT * FROM learning_time_estimates WHERE goal_id=? ORDER BY created_at DESC LIMIT 3").all(selectedGoalId) as Array<Record<string, unknown>>).map((row) => ({ ...mapped(row), basis: parseJson(row.basis_json, {}), uncertainty: parseJson(row.uncertainty_json, []) }))
      : [];
    const weakest = [...nodes].filter((node) => String(node.learningState) !== "locked").sort((a, b) => Number(a.mastery) - Number(b.mastery))[0] ?? null;
    const projectRow = selectedGoalId ? this.db.prepare("SELECT * FROM engineering_projects WHERE goal_id=?").get(selectedGoalId) as Record<string, unknown> | undefined : undefined;
    const project = projectRow
      ? Object.assign(mapped(projectRow), {
          requiredDeliverables: parseJson<unknown[]>(projectRow.required_deliverables_json, []),
        })
      : null;
    const evidenceCount = selectedGoalId ? Number((this.db.prepare("SELECT COUNT(*) count FROM mastery_evidence WHERE goal_id=?").get(selectedGoalId) as { count: number }).count) : 0;
    const masterySnapshots = selectedGoalId
      ? (this.db.prepare("SELECT * FROM mastery_snapshots WHERE goal_id=? ORDER BY created_at DESC LIMIT 100").all(selectedGoalId) as Array<Record<string, unknown>>).map((row) => ({ ...mapped(row), metrics: parseJson(row.metrics_json, {}) }))
      : [];
    const evidenceHandoffs = selectedGoalId
      ? (this.db.prepare(
          `SELECT e.id evidence_item_id,e.source_type,e.source_id,e.verification_status,e.confidence,
                  ev.candidate_id,c.status candidate_status
           FROM evidence_items e
           LEFT JOIN evidence_evaluations ev ON ev.evidence_item_id=e.id
           LEFT JOIN growth_evidence_candidates c ON c.id=ev.candidate_id
           WHERE e.source_type IN ('formal_assessment','code_assessment')
             AND (e.source_id IN (SELECT id FROM assessments WHERE goal_id=?)
               OR e.source_id IN (SELECT id FROM code_assessments WHERE goal_id=?))
           ORDER BY e.created_at DESC`,
        ).all(selectedGoalId, selectedGoalId) as Array<Record<string, unknown>>).map(mapped)
      : [];
    return {
      resources,
      assessments,
      adjustments,
      codeAssessments,
      nodes,
      reviews,
      reviewAttempts,
      estimates,
      masterySnapshots,
      evidenceHandoffs,
      dashboard: {
        goal: selectedGoal,
        whyNow: String(weakest?.whyNow || (weakest ? `“${String(weakest.title)}”是当前已解锁概念中掌握证据最弱的一项。` : "先完成资源解析与基线诊断。")),
        todayMission: missions[0] ?? null,
        weakestConcept: weakest,
        dueReviews: reviews.filter((item) => item.isDue),
        evidenceCount,
        project,
        latestAdjustment: adjustments[0] ?? null,
        latestEstimate: estimates[0] ?? null,
      },
    };
  }
}
