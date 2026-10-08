import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { DiagnosticOutput, EvidenceType, LearningGoalInput } from "@/lib/domain/learning";
import { calculateMastery, estimateLearningTime, nextReviewInterval } from "@/lib/domain/learning";
import { effectiveIndependence, scheduleNextReview } from "@/lib/domain/learning-phase2";
import type { ParsedResource } from "@/lib/services/resource-parser";

const USER_ID = "genesis-owner";
const timestamp = () => new Date().toISOString();
const parseJson = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

export type LearningStage = { key: string; label: string; prompt: string; evidenceType: EvidenceType | null };

// SQLite rows are converted at the repository boundary; every public write is
// already schema-validated and callers receive stable camelCase DTO fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapped(record: Record<string, unknown>): any {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
}

export class LearningRepository {
  constructor(readonly db: Database.Database) {}

  goal(id: string) {
    const record = this.db.prepare("SELECT * FROM learning_goals WHERE id=? AND user_id=?").get(id, USER_ID) as Record<string, unknown> | undefined;
    if (!record) throw new Error("LEARNING_GOAL_NOT_FOUND");
    return mapped(record);
  }

  activatePath(goalId: string, rationale: string) {
    const goal = this.goal(goalId);
    const existing = this.db.prepare("SELECT * FROM learning_paths WHERE goal_id=?").get(goalId) as Record<string, unknown> | undefined;
    if (!existing) throw new Error("LEARNING_PATH_NOT_FOUND");
    const now = timestamp();
    this.db.prepare("UPDATE learning_paths SET status='active',rationale=?,version=version+1,updated_at=? WHERE goal_id=?").run(rationale, now, goalId);
    this.audit("learning_path.activated", "learning_path", goalId, { status: existing.status, version: existing.version }, { status: "active", version: Number(existing.version) + 1, goalId: goal.id });
    return { id: String(existing.id), goalId, status: "active", version: Number(existing.version) + 1, rationale, updatedAt: now };
  }

  cacheGet<T>(key: string): T | null {
    const record = this.db.prepare("SELECT payload_json FROM ai_cache WHERE cache_key=? AND expires_at>?").get(key, timestamp()) as { payload_json: string } | undefined;
    return record ? parseJson<T | null>(record.payload_json, null) : null;
  }

  cacheSet(key: string, purpose: string, payload: unknown, model: string, ttlMs = 86_400_000) {
    const now = timestamp();
    const expires = new Date(Date.now() + ttlMs).toISOString();
    this.db.prepare("INSERT INTO ai_cache (cache_key,purpose,payload_json,model,expires_at,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json,model=excluded.model,expires_at=excluded.expires_at,created_at=excluded.created_at")
      .run(key, purpose, JSON.stringify(payload), model, expires, now);
  }

  createGoal(input: LearningGoalInput) {
    const existing = this.db.prepare("SELECT * FROM learning_goals WHERE client_request_id=?").get(input.clientRequestId) as Record<string, unknown> | undefined;
    if (existing) return { ...mapped(existing), duplicate: true };
    const sameGoal = this.db.prepare("SELECT * FROM learning_goals WHERE user_id=? AND lower(trim(title))=lower(trim(?)) AND status IN ('active','paused') AND deleted_at IS NULL ORDER BY created_at LIMIT 1").get(USER_ID, input.title) as Record<string, unknown> | undefined;
    if (sameGoal) return { ...mapped(sameGoal), duplicate: true, duplicateReason: "same_goal" };
    const id = randomUUID();
    const now = timestamp();
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO learning_goals (id,user_id,client_request_id,title,purpose,current_basis,final_goal,target_ability,current_level,target_level_score,motivation,target_level,mastery_level,daily_minutes,weekly_days,deadline,engineering_outcome,fde_linked,data_kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)")
        .run(id, USER_ID, input.clientRequestId, input.title, input.purpose, input.currentBasis, input.finalGoal, input.targetAbility, input.currentLevel, input.targetLevelScore, input.motivation, input.targetLevel, input.masteryLevel, input.dailyMinutes, input.weeklyDays, input.deadline, input.engineeringOutcome, input.fdeLinked ? 1 : 0, input.dataKind, now, now);
      this.db.prepare("INSERT INTO engineering_projects (id,goal_id,title,required_deliverables_json,status,created_at,updated_at) VALUES (?,?,?,?, 'planned',?,?)")
        .run(randomUUID(), id, input.engineeringOutcome, JSON.stringify(["真实 API", "参数校验", "数据库存储", "错误处理", "自动化测试", "README", "部署或可运行演示", "项目复盘"]), now, now);
      this.audit("learning_goal.created", "learning_goal", id, null, input);
    })();
    return { id, ...input, status: "active", createdAt: now, updatedAt: now, duplicate: false };
  }

  reserveResource(input: {
    goalId: string;
    clientRequestId: string;
    sourceType: string;
    title: string;
    sourceUrl?: string | null;
    originalFilename?: string | null;
    mimeType?: string | null;
  }) {
    const existing = this.db.prepare("SELECT * FROM learning_resources WHERE client_request_id=?").get(input.clientRequestId) as Record<string, unknown> | undefined;
    if (existing) return { ...mapped(existing), duplicate: true };
    const id = randomUUID();
    const now = timestamp();
    const goal = this.goal(input.goalId);
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO learning_resources (id,goal_id,client_request_id,source_type,title,source_url,original_filename,mime_type,storage_path,content_hash,extracted_text,character_count,status,status_message,error_code,created_at,processed_at,author_source,estimated_minutes,difficulty,core_topics_json,prerequisites_json,key_concepts_json,practice_opportunities_json,sections_count,updated_at,data_kind) VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,0,'queued','原始资料记录已保存，等待解析',NULL,?,NULL,?,NULL,NULL,'[]','[]','[]','[]',0,?,?)")
        .run(id, input.goalId, input.clientRequestId, input.sourceType, input.title, input.sourceUrl ?? null, input.originalFilename ?? null, input.mimeType ?? null, now, input.sourceUrl ?? input.originalFilename ?? null, now, String(goal.dataKind || "user"));
      this.db.prepare("INSERT INTO resource_processing_jobs (id,resource_id,idempotency_key,status,attempt,created_at,updated_at) VALUES (?,?,?,'queued',1,?,?)")
        .run(randomUUID(), id, input.clientRequestId, now, now);
      this.audit("learning_resource.reserved", "learning_resource", id, null, { sourceType: input.sourceType, title: input.title, status: "waiting" });
    })();
    return { id, ...input, status: "queued", statusMessage: "原始资料记录已保存，等待解析", duplicate: false, createdAt: now };
  }

  completeReservedResource(resourceId: string, parsed: ParsedResource) {
    const reserved = this.db.prepare("SELECT * FROM learning_resources WHERE id=?").get(resourceId) as Record<string, unknown> | undefined;
    if (!reserved) throw new Error("LEARNING_RESOURCE_NOT_FOUND");
    const duplicate = parsed.contentHash
      ? this.db.prepare("SELECT * FROM learning_resources WHERE goal_id=? AND content_hash=? AND id<>?").get(reserved.goal_id, parsed.contentHash, resourceId) as Record<string, unknown> | undefined
      : undefined;
    if (duplicate) {
      this.db.transaction(() => {
        this.db.prepare("DELETE FROM resource_processing_jobs WHERE resource_id=?").run(resourceId);
        this.db.prepare("DELETE FROM learning_resources WHERE id=?").run(resourceId);
        this.audit("learning_resource.duplicate_reused", "learning_resource", String(duplicate.id), null, { discardedReservationId: resourceId, contentHash: parsed.contentHash });
      })();
      return { ...mapped(duplicate), duplicate: true };
    }
    const processedAt = timestamp();
    const jobStatus = parsed.status === "ready" ? "succeeded" : "failed";
    this.db.transaction(() => {
      this.db.prepare("UPDATE learning_resources SET source_type=?,title=?,original_filename=?,mime_type=?,storage_path=?,content_hash=?,extracted_text=?,character_count=?,status=?,status_message=?,error_code=?,processed_at=?,author_source=?,estimated_minutes=?,difficulty=?,core_topics_json=?,prerequisites_json=?,key_concepts_json=?,practice_opportunities_json=?,sections_count=?,updated_at=? WHERE id=?")
        .run(parsed.sourceType, parsed.title, parsed.originalFilename, parsed.mimeType, parsed.storagePath, parsed.contentHash, parsed.extractedText, parsed.extractedText?.length ?? 0, parsed.status, parsed.statusMessage, parsed.errorCode, processedAt, parsed.authorSource ?? reserved.author_source, parsed.estimatedMinutes ?? null, parsed.difficulty ?? null, JSON.stringify(parsed.coreTopics ?? []), JSON.stringify(parsed.prerequisites ?? []), JSON.stringify(parsed.keyConcepts ?? []), JSON.stringify(parsed.practiceOpportunities ?? []), parsed.sections?.length ?? 0, processedAt, resourceId);
      this.db.prepare("UPDATE resource_processing_jobs SET status='processing',started_at=?,updated_at=? WHERE resource_id=?").run(processedAt, processedAt, resourceId);
      const sectionInsert = this.db.prepare("INSERT INTO resource_sections (id,resource_id,position,title,locator_type,locator_value,excerpt,character_count,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
      for (const [position, section] of (parsed.sections ?? []).entries())
        sectionInsert.run(randomUUID(), resourceId, position, section.title, section.locatorType, section.locatorValue, section.excerpt, section.excerpt.length, processedAt);
      this.db.prepare("UPDATE resource_processing_jobs SET status=?,error_code=?,error_detail=?,finished_at=?,updated_at=? WHERE resource_id=?")
        .run(jobStatus, parsed.errorCode, parsed.statusMessage, processedAt, processedAt, resourceId);
      this.audit("learning_resource.processed", "learning_resource", resourceId, null, { status: parsed.status, errorCode: parsed.errorCode, characterCount: parsed.extractedText?.length ?? 0, sectionCount: parsed.sections?.length ?? 0 });
    })();
    return { ...mapped(this.db.prepare("SELECT * FROM learning_resources WHERE id=?").get(resourceId) as Record<string, unknown>), duplicate: false };
  }

  createResource(input: { goalId: string; clientRequestId: string; sourceUrl?: string; parsed: ParsedResource }) {
    const existingByRequest = this.db.prepare("SELECT * FROM learning_resources WHERE client_request_id=?").get(input.clientRequestId) as Record<string, unknown> | undefined;
    if (existingByRequest) return { ...mapped(existingByRequest), duplicate: true };
    if (input.parsed.contentHash) {
      const duplicate = this.db.prepare("SELECT * FROM learning_resources WHERE goal_id=? AND content_hash=?").get(input.goalId, input.parsed.contentHash) as Record<string, unknown> | undefined;
      if (duplicate) return { ...mapped(duplicate), duplicate: true };
    }
    const id = randomUUID();
    const now = timestamp();
    const goal = this.goal(input.goalId);
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO learning_resources (id,goal_id,client_request_id,source_type,title,source_url,original_filename,mime_type,storage_path,content_hash,extracted_text,character_count,status,status_message,error_code,created_at,processed_at,author_source,estimated_minutes,difficulty,core_topics_json,prerequisites_json,key_concepts_json,practice_opportunities_json,sections_count,updated_at,data_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, input.goalId, input.clientRequestId, input.parsed.sourceType, input.parsed.title, input.sourceUrl ?? null, input.parsed.originalFilename, input.parsed.mimeType, input.parsed.storagePath, input.parsed.contentHash, input.parsed.extractedText, input.parsed.extractedText?.length ?? 0, input.parsed.status, input.parsed.statusMessage, input.parsed.errorCode, now, now, input.parsed.authorSource ?? input.sourceUrl ?? input.parsed.originalFilename, input.parsed.estimatedMinutes ?? null, input.parsed.difficulty ?? null, JSON.stringify(input.parsed.coreTopics ?? []), JSON.stringify(input.parsed.prerequisites ?? []), JSON.stringify(input.parsed.keyConcepts ?? []), JSON.stringify(input.parsed.practiceOpportunities ?? []), input.parsed.sections?.length ?? 0, now, String(goal.dataKind || "user"));
      const jobStatus = input.parsed.status === "ready" ? "succeeded" : "failed";
      this.db.prepare("INSERT INTO resource_processing_jobs (id,resource_id,idempotency_key,status,attempt,error_code,error_detail,started_at,finished_at,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?,?,?,?)")
        .run(randomUUID(), id, input.clientRequestId, jobStatus, input.parsed.errorCode, input.parsed.statusMessage, now, now, now, now);
      const sectionInsert = this.db.prepare("INSERT INTO resource_sections (id,resource_id,position,title,locator_type,locator_value,excerpt,character_count,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
      for (const [position, section] of (input.parsed.sections ?? []).entries()) sectionInsert.run(randomUUID(), id, position, section.title, section.locatorType, section.locatorValue, section.excerpt, section.excerpt.length, now);
      this.audit("learning_resource.processed", "learning_resource", id, null, { status: input.parsed.status, errorCode: input.parsed.errorCode, characterCount: input.parsed.extractedText?.length ?? 0, sectionCount: input.parsed.sections?.length ?? 0 });
    })();
    return { id, goalId: input.goalId, ...input.parsed, sourceUrl: input.sourceUrl ?? null, characterCount: input.parsed.extractedText?.length ?? 0, createdAt: now, processedAt: now, duplicate: false };
  }

  resourceCorpus(goalId: string) {
    const records = this.db.prepare("SELECT id,title,source_type,extracted_text,character_count FROM learning_resources WHERE goal_id=? AND status='ready' ORDER BY created_at").all(goalId) as Array<Record<string, unknown>>;
    return records.map((record) => ({ id: String(record.id), title: String(record.title), sourceType: String(record.source_type), text: String(record.extracted_text), characterCount: Number(record.character_count) }));
  }

  diagnosticForGoal(goalId: string) {
    const record = this.db.prepare("SELECT * FROM baseline_diagnostics WHERE goal_id=?").get(goalId) as Record<string, unknown> | undefined;
    if (!record) return null;
    return {
      ...mapped(record),
      questions: parseJson(record.questions_json, []), answers: parseJson(record.answers_json, null),
      prerequisiteGaps: parseJson(record.prerequisite_gaps_json, []), uncertainty: parseJson(record.uncertainty_json, []),
    };
  }

  createDiagnostic(goalId: string, output: DiagnosticOutput, mode: "demo" | "real" | "openai", provider = mode === "demo" ? "demo" : "openai") {
    const existing = this.diagnosticForGoal(goalId);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const assessmentId = randomUUID();
    const now = timestamp();
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO baseline_diagnostics (id,goal_id,questions_json,status,model_mode,provider,created_at) VALUES (?,?,?,'ready',?,?,?)")
        .run(id, goalId, JSON.stringify(output.questions), mode, provider, now);
      this.db.prepare("INSERT OR IGNORE INTO learning_paths (id,goal_id,status,rationale,created_at,updated_at) VALUES (?,?,'active','先诊断前置缺口，再按依赖顺序学习；只有掌握证据达到门槛才解锁后续节点。',?,?)").run(randomUUID(), goalId, now, now);
      this.db.prepare("INSERT INTO assessments (id,goal_id,diagnostic_id,assessment_type,status,model_mode,created_at,updated_at) VALUES (?,?,?,'baseline','ready',?,?,?)")
        .run(assessmentId, goalId, id, mode, now, now);
      const firstResource = this.db.prepare("SELECT id FROM learning_resources WHERE goal_id=? AND status='ready' ORDER BY created_at LIMIT 1").get(goalId) as { id: string } | undefined;
      const firstSection = firstResource ? this.db.prepare("SELECT locator_type,locator_value FROM resource_sections WHERE resource_id=? ORDER BY position LIMIT 1").get(firstResource.id) as { locator_type: string; locator_value: string } | undefined : undefined;
      const questionInsert = this.db.prepare("INSERT INTO assessment_questions (id,assessment_id,question_key,question_type,prompt,rubric_json,concept,source_resource_id,source_locator,position) VALUES (?,?,?,?,?,?,?,?,?,?)");
      for (const [position, question] of output.questions.entries()) questionInsert.run(randomUUID(), assessmentId, question.id, question.type, question.prompt, JSON.stringify(question.rubric), question.concept, firstResource?.id ?? null, firstSection ? `${firstSection.locator_type}:${firstSection.locator_value}` : null, position);
      const nodeIds: string[] = [];
      for (const [index, node] of output.knowledgeNodes.entries()) {
        const nodeId = randomUUID(); nodeIds.push(nodeId);
        const initialState = index === 0 ? "ready" : "locked";
        this.db.prepare("INSERT INTO knowledge_nodes (id,goal_id,title,description,position,difficulty,mastery,mastery_confidence,evidence_count,status,created_at,updated_at,canonical_concept,learning_state,resource_refs_json,why_now) VALUES (?,?,?,?,?,?,0,0,0,?,?,?,?,?,?,?)")
          .run(nodeId, goalId, node.title, node.description, index, node.difficulty, initialState, now, now, node.title, initialState, JSON.stringify(firstResource ? [`${firstResource.id}:${firstSection ? `${firstSection.locator_type}:${firstSection.locator_value}` : "resource:全文"}`] : []), index === 0 ? `“${node.title}”是当前路径的第一个可验证前置概念。` : `先掌握前置节点后再学习“${node.title}”，避免跳过依赖造成表面完成。`);
      }
      for (const [index, node] of output.knowledgeNodes.entries()) {
        for (const prerequisiteIndex of node.prerequisiteIndexes) {
          if (prerequisiteIndex < index && nodeIds[prerequisiteIndex]) this.db.prepare("INSERT OR IGNORE INTO knowledge_edges (id,goal_id,prerequisite_node_id,dependent_node_id) VALUES (?,?,?,?)").run(randomUUID(), goalId, nodeIds[prerequisiteIndex], nodeIds[index]);
        }
        const prerequisites = node.prerequisiteIndexes.filter((item) => item < index && output.knowledgeNodes[item]).map((item) => output.knowledgeNodes[item].title);
        const nextConcepts = output.knowledgeNodes.filter((candidate) => candidate.prerequisiteIndexes.includes(index)).map((candidate) => candidate.title);
        this.db.prepare("UPDATE knowledge_nodes SET prerequisites_json=?,next_concepts_json=? WHERE id=?")
          .run(JSON.stringify(prerequisites), JSON.stringify(nextConcepts), nodeIds[index]);
      }
      this.audit("baseline.created", "baseline_diagnostic", id, null, { mode, provider, questionCount: output.questions.length, nodeCount: output.knowledgeNodes.length });
    })();
    return { id, goalId, questions: output.questions, status: "ready", modelMode: mode, provider, createdAt: now, duplicate: false };
  }

  submitDiagnostic(goalId: string, answers: Array<{ questionId: string; answer: string; responseTimeSeconds: number; confidence: number }>) {
    const diagnostic = this.diagnosticForGoal(goalId);
    if (!diagnostic) throw new Error("DIAGNOSTIC_NOT_FOUND");
    if (diagnostic.status === "submitted") return { ...diagnostic, duplicate: true };
    const questions = diagnostic.questions as Array<{ id: string; rubric: string[]; concept: string }>;
    const scores = questions.map((question) => {
      const answer = answers.find((item) => item.questionId === question.id)?.answer.toLocaleLowerCase("zh-CN") ?? "";
      const hits = question.rubric.filter((term) => answer.includes(term.toLocaleLowerCase("zh-CN"))).length;
      const coverage = hits / Math.max(1, question.rubric.length);
      const depth = Math.min(1, answer.length / 220);
      return Math.min(1, coverage * 0.68 + depth * 0.32);
    });
    const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    const gaps = questions.filter((_, index) => scores[index] < 0.55).map((question) => question.concept);
    const goal = this.db.prepare("SELECT * FROM learning_goals WHERE id=?").get(goalId) as Record<string, unknown>;
    const resources = this.resourceCorpus(goalId);
    const nodes = this.db.prepare("SELECT difficulty FROM knowledge_nodes WHERE goal_id=?").all(goalId) as Array<{ difficulty: number }>;
    const averageDifficulty = nodes.reduce((sum, item) => sum + item.difficulty, 0) / Math.max(1, nodes.length);
    const historical = this.db.prepare("SELECT AVG((julianday(completed_at)-julianday(started_at))*1440.0) AS minutes FROM learning_sessions WHERE status='completed'").get() as { minutes: number | null };
    const estimate = estimateLearningTime({ characters: resources.reduce((sum, item) => sum + item.characterCount, 0), targetLevel: String(goal.target_level) as "literacy" | "working" | "proficient" | "expert", averageDifficulty, score, prerequisiteGapCount: gaps.length, historicalMinutesPerEvidence: historical.minutes ?? undefined });
    const uncertainty = [
      resources.length ? "资料的练习密度和概念覆盖可能不均匀" : "尚无可解析资料，估时只能依据目标描述",
      historical.minutes ? "历史学习速度样本较少，个体速度仍可能变化" : "缺少历史完成速度，暂用通用学习速度",
      "工程成果范围和调试难度可能改变总工时",
    ];
    const now = timestamp();
    this.db.transaction(() => {
      this.db.prepare("UPDATE baseline_diagnostics SET answers_json=?,score=?,prerequisite_gaps_json=?,optimistic_minutes=?,realistic_minutes=?,conservative_minutes=?,confidence=?,uncertainty_json=?,status='submitted',submitted_at=? WHERE goal_id=?")
        .run(JSON.stringify(answers), score, JSON.stringify(gaps), estimate.optimisticMinutes, estimate.realisticMinutes, estimate.conservativeMinutes, estimate.confidence, JSON.stringify(uncertainty), now, goalId);
      this.db.prepare("UPDATE knowledge_nodes SET status=CASE WHEN position=0 THEN 'ready' ELSE status END, mastery=?,mastery_confidence=?,updated_at=? WHERE goal_id=? AND position=0")
        .run(score * 0.3, 0.28, now, goalId);
      const assessment = this.db.prepare("SELECT id FROM assessments WHERE diagnostic_id=?").get(diagnostic.id) as { id: string } | undefined;
      if (assessment) {
        const assessmentQuestions = this.db.prepare("SELECT id,question_key,concept FROM assessment_questions WHERE assessment_id=?").all(assessment.id) as Array<{ id: string; question_key: string; concept: string }>;
        const attemptInsert = this.db.prepare("INSERT INTO assessment_attempts (id,assessment_id,question_id,user_answer,response_time_seconds,confidence,score,correctness,error_type,ai_evaluation,evidence_source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
        for (const [index, question] of questions.entries()) {
          const answer = answers.find((item) => item.questionId === question.id);
          const storedQuestion = assessmentQuestions.find((item) => item.question_key === question.id);
          if (!answer || !storedQuestion) continue;
          const itemScore = scores[index];
          attemptInsert.run(randomUUID(), assessment.id, storedQuestion.id, answer.answer, answer.responseTimeSeconds, answer.confidence, itemScore, itemScore >= 0.75 ? "correct" : itemScore >= 0.45 ? "partial" : "incorrect", itemScore < 0.45 ? `对“${storedQuestion.concept}”的解释或迁移证据不足` : null, `规则量表命中与回答深度综合得分 ${Math.round(itemScore * 100)}%`, `baseline:${diagnostic.id}:${question.id}`, now);
        }
        this.db.prepare("UPDATE assessments SET status='graded',updated_at=? WHERE id=?").run(now, assessment.id);
      }
      this.db.prepare("INSERT INTO learning_time_estimates (id,goal_id,diagnostic_id,optimistic_minutes,realistic_minutes,conservative_minutes,prerequisite_minutes,theory_minutes,practice_minutes,project_minutes,review_minutes,confidence,uncertainty_json,calibration_reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(randomUUID(), goalId, diagnostic.id, estimate.optimisticMinutes, estimate.realisticMinutes, estimate.conservativeMinutes, estimate.prerequisiteMinutes, estimate.theoryMinutes, estimate.practiceMinutes, estimate.projectMinutes, estimate.reviewMinutes, estimate.confidence, JSON.stringify(uncertainty), "由资料规模、难度、目标层级、基线表现、前置缺口和历史会话速度共同估算；不是精确承诺。", now);
      this.audit("baseline.submitted", "baseline_diagnostic", String(diagnostic.id), null, { score, gaps, ...estimate });
    })();
    return { ...this.diagnosticForGoal(goalId), duplicate: false };
  }

  private stagesForNode(node: { title: string; description: string }, excerpt: string, delayedReview: boolean): LearningStage[] {
    const context = excerpt.slice(0, 600);
    return [
      { key: "recall", label: "回忆上次内容", evidenceType: "active_recall", prompt: `不查看资料，先写下你对“${node.title}”已经知道的内容、关键步骤和一个疑问。` },
      { key: "prerequisite_check", label: "检查前置知识", evidenceType: "immediate_test", prompt: `列出理解“${node.title}”必须具备的前置概念，并分别给出一句自己的解释。` },
      { key: "why_today", label: "说明今天为何学习", evidenceType: null, prompt: `把“${node.title}”与当前学习目标和最终工程成果连接起来：今天先学它会解除什么阻塞？` },
      { key: "intuition", label: "直觉模型", evidenceType: "explanation", prompt: `先不用正式术语，用一个直觉模型或生活类比解释“${node.title}”，并指出类比会在哪里失效。` },
      { key: "internal_mechanism", label: "内部机制", evidenceType: "explanation", prompt: `阅读经过解析的资料上下文，说明从输入到结果的内部因果机制：\n${context || node.description}` },
      { key: "formal_definition", label: "形式化定义", evidenceType: "explanation", prompt: `给出“${node.title}”的精确定义、成立条件、输入输出和边界。` },
      { key: "worked_example", label: "正例", evidenceType: "immediate_test", prompt: `给“${node.title}”构造一个具体正例，逐步说明输入、过程、输出和验证方法。` },
      { key: "counterexample", label: "反例", evidenceType: "correction", prompt: `构造一个看似符合但实际不符合“${node.title}”的反例，指出误判发生在哪里。` },
      { key: "socratic", label: "苏格拉底追问", evidenceType: "explanation", prompt: `如果“${node.title}”中的一个关键前提不成立，结论会怎样变化？为什么？` },
      { key: "restate", label: "用自己的话复述", evidenceType: "explanation", prompt: `假设你要教给一位刚入门的同学，请不用术语堆砌，完整复述“${node.title}”。` },
      { key: "gap_check", label: "识别理解漏洞", evidenceType: "correction", prompt: `列出你刚才解释中最不确定的两点，并说明要用什么证据验证。` },
      { key: "targeted_reteach", label: "针对性重讲", evidenceType: "correction", prompt: `结合前面的漏洞，把“${node.description}”重讲一遍，并明确因果链，不要只下结论。` },
      { key: "basic_problem", label: "基本题", evidenceType: "immediate_test", prompt: `完成一道只检验“${node.title}”核心定义和基本机制的题，并展示推理步骤。` },
      { key: "correction_problem", label: "纠错题", evidenceType: "correction", prompt: `分析一个关于“${node.title}”的错误方案：定位错误、解释原因并给出可验证修复。` },
      { key: "transfer", label: "迁移题", evidenceType: "transfer", prompt: `把“${node.title}”迁移到资料中没有直接出现的新场景，说明哪些部分可复用、哪些必须改变。` },
      { key: "micro_practice", label: "微型实践", evidenceType: "coding", prompt: `完成一个 15–30 分钟可验证的微型实践；给出代码、操作结果或测试证据，并说明代码主要由谁完成。` },
      { key: "engineering_connection", label: "真实工程连接", evidenceType: "project", prompt: `把本知识点接入最终工程成果：说明模块位置、接口、失败路径、验证方式和部署影响。` },
      { key: "active_summary", label: "主动回忆总结", evidenceType: delayedReview ? "delayed_test" : "active_recall", prompt: delayedReview ? `这是到期复习。不要回看前文，重建“${node.title}”的因果链并完成一个不同于上次的新题。` : `不回看前文，总结 3 个关键点、1 个边界、1 个失败路径。此轮只算即时回忆。` },
      { key: "confidence_report", label: "填写自信度", evidenceType: null, prompt: `给当前理解打 1–5 分，并说明哪条新证据最可能让你改变这个判断。` },
      { key: "mastery_proof", label: "生成掌握证据", evidenceType: "explanation", prompt: `提交一段可以审计的掌握证据：你的原始产出、验证结果、仍存在的限制，以及是否独立完成。` },
      { key: "review_plan", label: "安排下次复习", evidenceType: "active_recall", prompt: `写出下次复习时必须先回答的一个问题，以及你准备怎样验证自己没有只记住表面结论。` },
    ];
  }

  startSession(goalId: string, clientRequestId: string) {
    const existing = this.db.prepare("SELECT id FROM learning_sessions WHERE client_request_id=?").get(clientRequestId) as { id: string } | undefined;
    if (existing) return { ...this.session(existing.id), duplicate: true };
    const diagnostic = this.diagnosticForGoal(goalId);
    if (!diagnostic || diagnostic.status !== "submitted") throw new Error("BASELINE_REQUIRED");
    const node = this.db.prepare("SELECT n.* FROM knowledge_nodes n LEFT JOIN review_schedule r ON r.node_id=n.id WHERE n.goal_id=? AND (n.status IN ('ready','learning') OR (n.status='review' AND r.due_at<=?)) ORDER BY CASE n.status WHEN 'review' THEN 0 WHEN 'learning' THEN 1 ELSE 2 END,n.position LIMIT 1").get(goalId, timestamp()) as Record<string, unknown> | undefined;
    if (!node) throw new Error("NO_LEARNING_NODE_READY");
    const corpus = this.resourceCorpus(goalId);
    const stages = this.stagesForNode({ title: String(node.title), description: String(node.description) }, corpus[0]?.text ?? "", node.status === "review");
    const id = randomUUID(); const now = timestamp();
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO learning_sessions (id,goal_id,node_id,client_request_id,title,stages_json,current_stage,status,started_at) VALUES (?,?,?,?,?,?,0,'active',?)")
        .run(id, goalId, node.id, clientRequestId, `学习会话 · ${String(node.title)}`, JSON.stringify(stages), now);
      const statement = this.db.prepare("INSERT INTO learning_turns (id,session_id,stage_key,prompt,created_at) VALUES (?,?,?,?,?)");
      for (const stage of stages) statement.run(randomUUID(), id, stage.key, stage.prompt, now);
      this.db.prepare("UPDATE knowledge_nodes SET status='learning',updated_at=? WHERE id=?").run(now, node.id);
      this.audit("learning_session.started", "learning_session", id, null, { nodeId: node.id, stages: stages.map((stage) => stage.key) });
    })();
    return { ...this.session(id), duplicate: false };
  }

  session(id: string) {
    const session = this.db.prepare("SELECT * FROM learning_sessions WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!session) throw new Error("SESSION_NOT_FOUND");
    const stages = parseJson<LearningStage[]>(session.stages_json, []);
    const turns = this.db.prepare("SELECT * FROM learning_turns WHERE session_id=? ORDER BY rowid").all(id) as Array<Record<string, unknown>>;
    const mappedTurns = turns.map(mapped);
    const stage = stages[Number(session.current_stage)] ?? null;
    const activeTurn = stage ? mappedTurns.find((turn) => turn.stageKey === stage.key) : null;
    return { ...mapped(session), stages, turns: mappedTurns, activeStage: stage ? { ...stage, prompt: String(activeTurn?.prompt || stage.prompt) } : null };
  }

  sessionForAnswerRequest(clientRequestId: string) {
    const record = this.db.prepare("SELECT session_id FROM learning_turns WHERE idempotency_key=?").get(clientRequestId) as { session_id: string } | undefined;
    return record ? { ...this.session(record.session_id), duplicate: true } : null;
  }

  answerSession(id: string, input: { clientRequestId: string; response: string; responseTimeSeconds: number; confidence: number; codeAuthorship?: string; artifactUrl?: string }, evaluation: { score: number; feedback: string; misconception: string | null; reteach: string | null }) {
    const existingRequest = this.db.prepare("SELECT session_id FROM learning_turns WHERE idempotency_key=?").get(input.clientRequestId) as { session_id: string } | undefined;
    if (existingRequest) return { ...this.session(existingRequest.session_id), duplicate: true };
    const session = this.session(id);
    if (session.status !== "active") return { ...session, duplicate: true };
    const stage = session.activeStage as LearningStage | null;
    if (!stage) throw new Error("SESSION_STAGE_NOT_FOUND");
    const turn = (session.turns as Array<Record<string, unknown>>).find((item) => item.stageKey === stage.key);
    if (turn?.response) return { ...session, duplicate: true };
    const now = timestamp();
    this.db.transaction(() => {
      const feedback = `${evaluation.feedback}${evaluation.misconception ? `\n识别到的漏洞：${evaluation.misconception}` : ""}${evaluation.reteach ? `\n针对性重讲：${evaluation.reteach}` : ""}`;
      this.db.prepare("UPDATE learning_turns SET response=?,feedback=?,score=?,evidence_type=?,response_time_seconds=?,confidence=?,idempotency_key=?,answered_at=? WHERE session_id=? AND stage_key=?")
        .run(input.response, feedback, evaluation.score, stage.evidenceType, input.responseTimeSeconds, input.confidence, input.clientRequestId, now, id, stage.key);
      if (stage.evidenceType) {
        this.db.prepare("INSERT INTO mastery_evidence (id,goal_id,node_id,session_id,evidence_type,score,detail,code_authorship,artifact_url,created_at,user_output,ai_evaluation,confidence,is_delayed,is_independent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(randomUUID(), session.goalId, session.nodeId, id, stage.evidenceType, evaluation.score, evaluation.feedback, input.codeAuthorship ?? null, input.artifactUrl ?? null, now, input.response, feedback, input.confidence, stage.evidenceType === "delayed_test" ? 1 : 0, input.codeAuthorship === "ai_generated" ? 0 : 1);
      }
      this.db.prepare("INSERT INTO session_interactions (id,session_id,turn_id,interaction_type,user_output,ai_feedback,response_time_seconds,confidence,score,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(randomUUID(), id, String(turn?.id), stage.key, input.response, feedback, input.responseTimeSeconds, input.confidence, evaluation.score, now);
      const nextIndex = Number(session.currentStage) + 1;
      const complete = nextIndex >= (session.stages as LearningStage[]).length;
      if (!complete && evaluation.score < 0.55 && evaluation.reteach) {
        const nextStage = (session.stages as LearningStage[])[nextIndex];
        this.db.prepare("UPDATE learning_turns SET prompt=? WHERE session_id=? AND stage_key=?")
          .run(`先处理上一轮暴露的漏洞：${evaluation.reteach}\n\n然后继续：${nextStage.prompt}`, id, nextStage.key);
      }
      this.db.prepare("UPDATE learning_sessions SET current_stage=?,status=?,completed_at=?,summary=? WHERE id=?")
        .run(nextIndex, complete ? "completed" : "active", complete ? now : null, complete ? "已完成回忆、讲解、纠错、迁移、微型实践和工程连接的完整学习会话。" : null, id);
      this.refreshMastery(String(session.nodeId), String(session.goalId), complete);
      if (complete) {
        this.db.prepare("INSERT INTO life_events (id,user_id,event_type,title,summary,source_type,source_id,occurred_at,created_at,data_kind,is_primary) VALUES (?,?,?,?,?,?,?,?,?,'user',1)")
          .run(randomUUID(), USER_ID, "learning_session", "完成深度学习会话", String(session.title), "learning_session", id, now, now);
      }
      this.audit("learning_turn.answered", "learning_session", id, null, { stage: stage.key, score: evaluation.score, complete });
    })();
    return { ...this.session(id), duplicate: false };
  }

  private refreshMastery(nodeId: string, goalId: string, sessionComplete: boolean) {
    const records = this.db.prepare("SELECT evidence_type,score,is_independent FROM mastery_evidence WHERE node_id=? ORDER BY created_at").all(nodeId) as Array<{ evidence_type: EvidenceType; score: number; is_independent: number }>;
    const result = calculateMastery(records.map((item) => ({ evidenceType: item.evidence_type, score: Number(item.score) * (item.is_independent ? 1 : 0.45) })));
    const currentReview = this.db.prepare("SELECT interval_days FROM review_schedule WHERE node_id=?").get(nodeId) as { interval_days: number } | undefined;
    const interval = nextReviewInterval(result.mastery, currentReview?.interval_days ?? 0);
    const due = new Date(Date.now() + interval * 86_400_000).toISOString();
    const status = result.mastery >= 0.82 && records.length >= 5 ? "mastered" : sessionComplete ? "review" : "learning";
    const now = timestamp();
    this.db.prepare("UPDATE knowledge_nodes SET mastery=?,mastery_confidence=?,evidence_count=?,status=?,updated_at=? WHERE id=?")
      .run(result.mastery, result.confidence, records.length, status, now, nodeId);
    this.db.prepare("INSERT INTO mastery_snapshots (id,goal_id,node_id,mastery,confidence,evidence_count,reason,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(randomUUID(), goalId, nodeId, result.mastery, result.confidence, records.length, "由多类型证据、独立完成权重和延迟测试共同计算；点击完成不会直接提高掌握度。", now);
    this.db.prepare("INSERT INTO review_schedule (id,goal_id,node_id,due_at,interval_days,reason,status,updated_at) VALUES (?,?,?,?,?,'基于掌握证据的间隔复习','scheduled',?) ON CONFLICT(node_id) DO UPDATE SET due_at=excluded.due_at,interval_days=excluded.interval_days,reason=excluded.reason,status='scheduled',updated_at=excluded.updated_at")
      .run(randomUUID(), goalId, nodeId, due, interval, now);
    if (sessionComplete && result.mastery >= 0.6) {
      const next = this.db.prepare("SELECT id FROM knowledge_nodes WHERE goal_id=? AND status='locked' ORDER BY position LIMIT 1").get(goalId) as { id: string } | undefined;
      if (next) this.db.prepare("UPDATE knowledge_nodes SET status='ready',updated_at=? WHERE id=?").run(now, next.id);
    }
  }

  submitReview(scheduleId: string, input: { response: string; responseTimeSeconds: number; confidence: number; hintCount: number; independenceLevel: number; transferScore: number; repeatedError: boolean; clientRequestId: string }) {
    const duplicate = this.db.prepare("SELECT * FROM review_attempts WHERE id=?").get(input.clientRequestId) as Record<string, unknown> | undefined;
    if (duplicate) return { ...mapped(duplicate), duplicate: true };
    const schedule = this.db.prepare("SELECT r.*,n.title,n.mastery FROM review_schedule r JOIN knowledge_nodes n ON n.id=r.node_id WHERE r.id=?").get(scheduleId) as Record<string, unknown> | undefined;
    if (!schedule) throw new Error("REVIEW_NOT_FOUND");
    if (new Date(String(schedule.due_at)).getTime() > Date.now()) throw new Error("REVIEW_NOT_DUE");
    const response = input.response.toLocaleLowerCase("zh-CN");
    const depth = Math.min(1, response.length / 260);
    const evidenceSignals = [/因为|所以|导致|because/, /失败|边界|反例|错误/, /测试|验证|证据|assert|test/, /迁移|新场景|应用/].filter((pattern) => pattern.test(response)).length;
    const score = Math.min(0.95, 0.25 + depth * 0.35 + evidenceSignals * 0.1);
    const previousDays = Number(schedule.interval_days);
    const scheduled = scheduleNextReview({
      score,
      responseTimeSeconds: input.responseTimeSeconds,
      expectedSeconds: 180,
      confidence: input.confidence,
      hintCount: input.hintCount,
      independenceLevel: input.independenceLevel,
      repeatedError: input.repeatedError,
      transferScore: input.transferScore,
      previousIntervalDays: previousDays,
    });
    const nextDays = scheduled.intervalDays;
    const dueAt = new Date(Date.now() + nextDays * 86_400_000).toISOString();
    const now = timestamp();
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO review_attempts (id,schedule_id,goal_id,node_id,user_answer,response_time_seconds,confidence,score,previous_interval_days,next_interval_days,created_at,hint_count,independence_level,transfer_score,correctness,repeated_error,next_review_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(input.clientRequestId, scheduleId, schedule.goal_id, schedule.node_id, input.response, input.responseTimeSeconds, input.confidence, score, previousDays, nextDays, now, input.hintCount, input.independenceLevel, input.transferScore, score >= 0.75 ? "correct" : score >= 0.45 ? "partial" : "incorrect", input.repeatedError ? 1 : 0, dueAt);
      this.db.prepare("INSERT INTO mastery_evidence (id,goal_id,node_id,session_id,evidence_type,score,detail,created_at,user_output,ai_evaluation,confidence,is_delayed,is_independent,independence_level,hint_count) VALUES (?,?,?,NULL,'delayed_test',?,?,?,?,?,?,1,1,?,?)")
        .run(randomUUID(), schedule.goal_id, schedule.node_id, score, `到期复习得分 ${Math.round(score * 100)}%`, now, input.response, `间隔算法：${scheduled.reason}`, input.confidence, input.independenceLevel, input.hintCount);
      this.refreshMastery(String(schedule.node_id), String(schedule.goal_id), true);
      this.db.prepare("UPDATE review_schedule SET due_at=?,interval_days=?,status='scheduled',reason=?,updated_at=?,stability=?,difficulty_factor=?,lapse_count=lapse_count+?,last_attempt_at=? WHERE id=?")
        .run(dueAt, nextDays, scheduled.reason, now, scheduled.stability, scheduled.difficultyFactor, input.repeatedError ? 1 : 0, now, scheduleId);
      this.db.prepare("UPDATE knowledge_nodes SET learning_state=?,last_assessed_at=?,next_review_at=?,updated_at=? WHERE id=?")
        .run(score < 0.5 || input.repeatedError ? "weak" : "learning", now, dueAt, now, schedule.node_id);
      this.audit("review.completed", "review_schedule", scheduleId, null, { score, previousDays, nextDays, confidence: input.confidence, hintCount: input.hintCount, independenceLevel: input.independenceLevel, transferScore: input.transferScore, reason: scheduled.reason });
    })();
    return { id: input.clientRequestId, scheduleId, goalId: String(schedule.goal_id), nodeId: String(schedule.node_id), score, transferScore: input.transferScore, effectiveIndependence: effectiveIndependence(input.independenceLevel, input.hintCount), nextIntervalDays: nextDays, dueAt, reason: scheduled.reason, duplicate: false };
  }

  recordOutcome(goalId: string, input: { title: string; artifactUrl: string | null; deploymentUrl: string | null; demoNotes: string; retrospective: string; codeAuthorship: string; status: string; clientRequestId: string }) {
    const existing = this.db.prepare("SELECT * FROM engineering_outcomes WHERE id=?").get(input.clientRequestId) as Record<string, unknown> | undefined;
    if (existing) return { ...mapped(existing), duplicate: true };
    const id = input.clientRequestId;
    const now = timestamp();
    this.db.prepare("INSERT INTO engineering_outcomes (id,goal_id,title,artifact_url,deployment_url,demo_notes,retrospective,code_authorship,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, goalId, input.title, input.artifactUrl, input.deploymentUrl, input.demoNotes, input.retrospective, input.codeAuthorship, input.status, now, now);
    const project = this.db.prepare("SELECT id FROM engineering_projects WHERE goal_id=?").get(goalId) as { id: string } | undefined;
    if (project) {
      this.db.prepare("INSERT INTO engineering_submissions (id,project_id,outcome_id,idempotency_key,repository_url,deployment_url,user_output,independent_changes,test_results,problems,retrospective,authorship,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(randomUUID(), project.id, id, input.clientRequestId, input.artifactUrl, input.deploymentUrl, input.demoNotes, input.codeAuthorship === "user_independent" ? "用户声明独立完成" : "已记录 AI 参与程度，需结合测试和讲解继续验证", input.demoNotes, "由用户在复盘中记录", input.retrospective, input.codeAuthorship, now);
      this.db.prepare("UPDATE engineering_projects SET status=?,updated_at=? WHERE id=?")
        .run(input.status === "reviewed" ? "reviewed" : input.status === "built" ? "verifying" : "delivered", now, project.id);
    }
    const node = this.db.prepare("SELECT id FROM knowledge_nodes WHERE goal_id=? ORDER BY position DESC LIMIT 1").get(goalId) as { id: string } | undefined;
    if (node) {
      this.db.prepare("INSERT INTO mastery_evidence (id,goal_id,node_id,session_id,evidence_type,score,detail,code_authorship,artifact_url,created_at) VALUES (?,?,?,?, 'project',?,?,?,?,?)")
        .run(randomUUID(), goalId, node.id, null, input.status === "deployed" || input.status === "presented" || input.status === "reviewed" ? 0.9 : 0.72, input.demoNotes, input.codeAuthorship, input.deploymentUrl ?? input.artifactUrl, now);
      this.refreshMastery(node.id, goalId, true);
    }
    this.db.prepare("UPDATE learning_goals SET status=?,updated_at=? WHERE id=?").run(input.status === "reviewed" ? "completed" : "active", now, goalId);
    this.audit("engineering_outcome.recorded", "engineering_outcome", id, null, input);
    return { id, goalId, ...input, createdAt: now, updatedAt: now, duplicate: false };
  }

  snapshot() {
    const goals = (this.db.prepare("SELECT * FROM learning_goals WHERE user_id=? AND status!='archived' AND deleted_at IS NULL ORDER BY created_at DESC").all(USER_ID) as Array<Record<string, unknown>>).map(mapped);
    const goalIds = goals.map((goal) => String(goal.id));
    if (!goalIds.length) return { goals, resources: [], diagnostics: [], nodes: [], edges: [], sessions: [], reviews: [], reviewAttempts: [], outcomes: [], evidence: [], timeEstimates: [], learningPaths: [], assessments: [], assessmentAttempts: [], masterySnapshots: [], engineeringProjects: [], engineeringSubmissions: [] };
    const placeholders = goalIds.map(() => "?").join(",");
    const query = (table: string, order = "rowid") => (this.db.prepare(`SELECT * FROM ${table} WHERE goal_id IN (${placeholders}) ORDER BY ${order}`).all(...goalIds) as Array<Record<string, unknown>>).map(mapped);
    const sessionRecords = query("learning_sessions", "started_at DESC").map((item) => ({ ...item, stages: parseJson(item.stagesJson, []) }));
    const resourceRecords = query("learning_resources", "created_at DESC").map((item) => ({
      ...item,
      coreTopics: parseJson(item.coreTopicsJson, []), prerequisites: parseJson(item.prerequisitesJson, []), keyConcepts: parseJson(item.keyConceptsJson, []), practiceOpportunities: parseJson(item.practiceOpportunitiesJson, []),
      sections: (this.db.prepare("SELECT * FROM resource_sections WHERE resource_id=? ORDER BY position").all(item.id) as Array<Record<string, unknown>>).map(mapped),
      processingJobs: (this.db.prepare("SELECT * FROM resource_processing_jobs WHERE resource_id=? ORDER BY created_at DESC").all(item.id) as Array<Record<string, unknown>>).map(mapped),
    }));
    const assessmentRecords = query("assessments", "created_at DESC");
    const assessmentIds = assessmentRecords.map((item) => String(item.id));
    const assessmentAttempts = assessmentIds.flatMap((assessmentId) => (this.db.prepare("SELECT a.* FROM assessment_attempts a WHERE a.assessment_id=? ORDER BY a.created_at").all(assessmentId) as Array<Record<string, unknown>>).map(mapped));
    const projectRecords = query("engineering_projects", "created_at DESC").map((item) => ({ ...item, requiredDeliverables: parseJson(item.requiredDeliverablesJson, []) }));
    const projectIds = projectRecords.map((item) => String(item.id));
    const engineeringSubmissions = projectIds.flatMap((projectId) => (this.db.prepare("SELECT * FROM engineering_submissions WHERE project_id=? ORDER BY created_at DESC").all(projectId) as Array<Record<string, unknown>>).map(mapped));
    return {
      goals,
      resources: resourceRecords,
      diagnostics: query("baseline_diagnostics", "created_at DESC").map((item) => ({ ...item, questions: parseJson(item.questionsJson, []), answers: parseJson(item.answersJson, null), prerequisiteGaps: parseJson(item.prerequisiteGapsJson, []), uncertainty: parseJson(item.uncertaintyJson, []) })),
      nodes: query("knowledge_nodes", "goal_id,position"), edges: query("knowledge_edges"),
      sessions: sessionRecords.map((item) => item.status === "active" ? this.session(String(item.id)) : item),
      reviews: query("review_schedule", "due_at").map((item) => ({ ...item, isDue: new Date(String(item.dueAt)).getTime() <= Date.now() })), reviewAttempts: query("review_attempts", "created_at DESC"), outcomes: query("engineering_outcomes", "created_at DESC"), evidence: query("mastery_evidence", "created_at DESC"),
      timeEstimates: query("learning_time_estimates", "created_at DESC"), learningPaths: query("learning_paths", "created_at DESC"), assessments: assessmentRecords, assessmentAttempts,
      masterySnapshots: query("mastery_snapshots", "created_at DESC"), engineeringProjects: projectRecords, engineeringSubmissions,
    };
  }

  private audit(action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
    this.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(randomUUID(), USER_ID, action, entityType, entityId, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), timestamp());
  }
}
