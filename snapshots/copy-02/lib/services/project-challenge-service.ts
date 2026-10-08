import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { ProfileRepository } from "@/lib/db/repository";
import { ProjectChallengeRepository } from "@/lib/db/project-challenge-repository";
import { LearningRepository } from "@/lib/db/learning-repository";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import { EvidenceService } from "@/lib/services/evidence-service";
import {
  calculateProjectIndependence,
  defenseCreateSchema,
  defenseSubmitSchema,
  localSubmissionSchema,
  projectChallengeCreateSchema,
  projectVerificationRequestSchema,
  verificationVerdict,
  type MachineCriterion,
} from "@/lib/domain/project-challenge";
import { entityIdSchema } from "@/lib/domain/profile";
import {
  analyzeRepository,
  ingestLocalPath,
  ingestZip,
  removeSubmissionFiles,
  repositoryContentHash,
} from "@/lib/project-challenge/repository-analyzer";
import { RestrictedLocalRunner, type RunnerResult } from "@/lib/project-challenge/restricted-local-runner";
import { createDefenseQuestions, evaluateDefense, reviewProject, type ProjectAIMeta } from "@/lib/ai/project-challenge";
import {
  PROJECT_CODE_REVIEW_PROMPT_VERSION,
  PROJECT_DEFENSE_EVALUATOR_PROMPT_VERSION,
  PROJECT_DEFENSE_PROMPT_VERSION,
} from "@/lib/ai/prompt-versions";

const zipSubmissionSchema = z.object({
  clientRequestId: z.string().uuid(),
  aiAssistanceCount: z.coerce.number().int().min(0).max(1_000).default(0),
  userModificationCount: z.coerce.number().int().min(0).max(10_000).default(0),
  selfReportedIndependence: z.coerce.number().int().min(0).max(4).default(0),
});

export const FASTAPI_REQUIREMENTS = [
  "至少 4 个真实 API endpoint", "Pydantic 请求/响应模型", "参数校验", "SQLite/PostgreSQL 数据库", "结构化异常处理", "至少一项身份认证", "单元测试", "集成测试", "OpenAPI 文档", "README 与运行步骤", "可本地运行", "至少一个真实 AI Provider 适配器并在测试中隔离外部调用", "项目复盘",
];

export class ProjectChallengeService {
  private readonly challenges: ProjectChallengeRepository;
  private readonly learning: LearningRepository;
  private readonly evidence: EvidenceRepository;
  private readonly runner: RestrictedLocalRunner;

  constructor(private readonly repository: ProfileRepository, runner = new RestrictedLocalRunner()) {
    this.challenges = new ProjectChallengeRepository(repository);
    this.learning = new LearningRepository(repository.db);
    this.evidence = new EvidenceRepository(repository);
    this.runner = runner;
  }

  snapshot(goalId?: string | null) {
    if (goalId) entityIdSchema.parse(goalId);
    return this.challenges.snapshot(goalId || undefined);
  }

  createChallenge(goalId: string, raw: unknown) {
    entityIdSchema.parse(goalId);
    this.learning.goal(goalId);
    return this.challenges.createChallenge(goalId, projectChallengeCreateSchema.parse(raw));
  }

  async submitZip(challengeId: string, form: FormData) {
    entityIdSchema.parse(challengeId);
    this.challenges.challenge(challengeId);
    const parsed = zipSubmissionSchema.parse({
      clientRequestId: form.get("clientRequestId"),
      aiAssistanceCount: form.get("aiAssistanceCount") || 0,
      userModificationCount: form.get("userModificationCount") || 0,
      selfReportedIndependence: form.get("selfReportedIndependence") || 0,
    });
    const existing = this.challenges.submissionByRequest(parsed.clientRequestId);
    if (existing) return { ...existing, duplicate: true };
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) throw new Error("PROJECT_ZIP_REQUIRED");
    if (file.size > 20 * 1024 * 1024) throw new Error("PROJECT_ARCHIVE_TOO_LARGE");
    const id = randomUUID();
    const sourcePath = await ingestZip(id, Buffer.from(await file.arrayBuffer()));
    try {
      const analysis = analyzeRepository(sourcePath);
      const result = this.challenges.saveSubmission({ id, challengeId, clientRequestId: parsed.clientRequestId, sourceType: "zip", originalName: file.name, sourcePath, sourceUrl: null, contentHash: repositoryContentHash(analysis), aiAssistanceCount: parsed.aiAssistanceCount, userModificationCount: parsed.userModificationCount, selfReportedIndependence: parsed.selfReportedIndependence, analysis });
      if (result.duplicate) removeSubmissionFiles(sourcePath);
      return result;
    } catch (error) { removeSubmissionFiles(sourcePath); throw error; }
  }

  async submitRepository(challengeId: string, raw: unknown) {
    entityIdSchema.parse(challengeId);
    this.challenges.challenge(challengeId);
    const input = localSubmissionSchema.parse(raw);
    const existing = this.challenges.submissionByRequest(input.clientRequestId);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    if (input.sourceType !== "local_path") {
      const url = input.sourceUrl!;
      return this.challenges.saveSubmission({ id, challengeId, clientRequestId: input.clientRequestId, sourceType: input.sourceType, originalName: new URL(url).pathname.split("/").filter(Boolean).pop() || "remote-repository", sourcePath: null, sourceUrl: url, contentHash: `url:${url.toLocaleLowerCase("en-US")}`, aiAssistanceCount: input.aiAssistanceCount, userModificationCount: input.userModificationCount, selfReportedIndependence: input.selfReportedIndependence, analysis: null });
    }
    const sourcePath = ingestLocalPath(id, input.localPath!);
    try {
      const analysis = analyzeRepository(sourcePath);
      const result = this.challenges.saveSubmission({ id, challengeId, clientRequestId: input.clientRequestId, sourceType: "local_path", originalName: path.basename(input.localPath!), sourcePath, sourceUrl: null, contentHash: repositoryContentHash(analysis), aiAssistanceCount: input.aiAssistanceCount, userModificationCount: input.userModificationCount, selfReportedIndependence: input.selfReportedIndependence, analysis });
      if (result.duplicate) removeSubmissionFiles(sourcePath);
      return result;
    } catch (error) { removeSubmissionFiles(sourcePath); throw error; }
  }

  async verifySubmission(submissionId: string, raw: unknown) {
    entityIdSchema.parse(submissionId);
    const request = projectVerificationRequestSchema.parse(raw);
    const duplicate = this.challenges.verificationByRequest(request.clientRequestId);
    if (duplicate) return { ...duplicate, duplicate: true };
    const submission = this.challenges.submission(submissionId);
    const challenge = this.challenges.challenge(String(submission.challengeId));
    const analysis = this.challenges.analysis(submissionId);
    if (!submission.sourcePath || !analysis) throw new Error("PROJECT_SOURCE_NOT_AVAILABLE");
    // Older analysis rows do not persist derived signals/module separately; derive them from stored structure and known fields when needed.
    const live = analyzeRepository(String(submission.sourcePath));
    const compile = await this.runner.run(String(submission.sourcePath), { kind: "python_compile" });
    const runs: RunnerResult[] = [compile];
    if (compile.status === "pass") runs.push(await this.runner.run(String(submission.sourcePath), { kind: "python_tests", framework: live.tests.usesPytest ? "pytest" : "unittest" }, { timeoutMs: 15_000 }));
    if (runs.every((item) => item.status === "pass") && live.fastApiModule) runs.push(await this.runner.run(String(submission.sourcePath), { kind: "fastapi_probe", module: live.fastApiModule }, { timeoutMs: 8_000 }));
    const testRun = runs.find((item) => item.action === "python_tests");
    const probe = runs.find((item) => item.action === "fastapi_probe");
    const findings = live.securityFindings;
    const criteria = this.machineCriteria(live, compile, testRun, probe);
    const verdict = verificationVerdict(criteria);
    const runnerStatus = runs.some((item) => item.status === "timeout") ? "timeout" : runs.some((item) => item.status === "blocked") ? "blocked" : verdict.status;
    const machineEvidence = { repository: { fileCount: live.fileCount, manifests: live.manifests, routes: live.apiRoutes, tests: live.tests.files, readme: live.readme, migrations: live.migrations }, runner: runs.map((item) => ({ action: item.action, status: item.status, exitCode: item.exitCode, durationMs: item.durationMs, peakMemoryBytes: item.peakMemoryBytes })) };
    const reviewed = await reviewProject({ repository: this.repository, challenge, analysis: live, criteria, machineEvidence });
    this.logAi("project_code_review", PROJECT_CODE_REVIEW_PROMPT_VERSION, reviewed.meta);
    const saved = this.challenges.saveVerification({
      submissionId, clientRequestId: request.clientRequestId, status: runnerStatus, commands: runs.map((item) => ({ action: item.action, command: item.commandLabel, status: item.status })), machineEvidence, criteria, failedCriteria: criteria.filter((item) => item.status !== "pass").map((item) => item.key), tests: { status: testRun?.status || "not_run", stdout: testRun?.stdout || "", stderr: testRun?.stderr || "" }, securityViolations: findings, resourceLimits: runs.map((item) => item.limits), stdout: runs.map((item) => item.stdout).filter(Boolean).join("\n---\n"), stderr: runs.map((item) => item.stderr).filter(Boolean).join("\n---\n"), exitCode: runs.findLast((item) => item.exitCode !== null)?.exitCode ?? null, durationMs: runs.reduce((sum, item) => sum + item.durationMs, 0), peakMemoryBytes: Math.max(0, ...runs.map((item) => item.peakMemoryBytes || 0)) || null, aiReview: reviewed.review, improvementPlan: reviewed.review.improvementPlan, meta: reviewed.meta,
    });
    return { ...saved, duplicate: false };
  }

  private machineCriteria(analysis: ReturnType<typeof analyzeRepository>, compile: RunnerResult, tests: RunnerResult | undefined, probe: RunnerResult | undefined): MachineCriterion[] {
    const criterion = (key: string, label: string, pass: boolean, evidence: string[], partial = false): MachineCriterion => ({ key, label, status: pass ? "pass" : partial ? "partial" : "fail", evidence });
    const hasHighSecurity = analysis.securityFindings.some((item) => item.severity === "high");
    return [
      criterion("endpoints", "至少 4 个真实 API endpoint", analysis.apiRoutes.length >= 4, [`检测到 ${analysis.apiRoutes.length} 个路由：${analysis.apiRoutes.map((item) => `${item.method} ${item.route}`).join("、") || "无"}`], analysis.apiRoutes.length > 0),
      criterion("pydantic", "Pydantic 请求/响应模型", analysis.signals.pydanticModels, [analysis.signals.pydanticModels ? "检测到 BaseModel/Pydantic" : "未检测到 Pydantic 模型"]),
      criterion("validation", "参数校验", analysis.signals.parameterValidation, [analysis.signals.parameterValidation ? "检测到 Field/validator/Query/Path 校验" : "未检测到可审计参数约束"]),
      criterion("database", "SQLite/PostgreSQL 持久化", analysis.signals.database, [analysis.signals.database ? `检测到数据库实现，迁移文件 ${analysis.migrations.length} 个` : "未检测到数据库实现"]),
      criterion("errors", "结构化异常处理", analysis.errorHandling.length > 0, [`异常处理文件：${analysis.errorHandling.join("、") || "无"}`]),
      criterion("auth", "至少一项身份认证", analysis.signals.authentication, [analysis.signals.authentication ? "检测到认证/授权依赖" : "未检测到认证实现"]),
      criterion("unit_tests", "单元测试真实通过", Boolean(tests && tests.status === "pass" && analysis.tests.hasUnit), [tests ? `测试退出码 ${tests.exitCode}` : "测试未运行", ...analysis.tests.files.slice(0, 6)]),
      criterion("integration_tests", "集成测试覆盖 API", Boolean(tests && tests.status === "pass" && analysis.tests.hasIntegration), [analysis.tests.hasIntegration ? "检测到 TestClient/client API 调用" : "未检测到 API 集成测试"]),
      criterion("openapi", "OpenAPI 可读取", probe?.status === "pass" && analysis.readme.hasOpenApi, [probe?.stdout || "FastAPI Probe 未通过", analysis.readme.hasOpenApi ? "README 包含 OpenAPI/docs" : "README 未说明 OpenAPI"]),
      criterion("readme", "README 包含运行步骤", analysis.readme.present && analysis.readme.hasRunSteps, [analysis.readme.path || "README 缺失", analysis.readme.hasRunSteps ? "包含安装/启动/测试说明" : "缺少运行说明"]),
      criterion("local_run", "项目可本地导入和启动", compile.status === "pass" && probe?.status === "pass", [`语法检查 ${compile.status}`, `服务 Probe ${probe?.status || "not_run"}`], compile.status === "pass"),
      criterion("ai_provider", "真实 AI Provider 适配器", analysis.signals.aiProvider, [analysis.signals.aiProvider ? "检测到 Provider 调用边界；Runner 使用黑洞代理，不发起真实外网请求" : "未检测到 AI Provider 代码"]),
      criterion("reflection", "项目复盘", analysis.readme.hasReflection, [analysis.readme.hasReflection ? "README 包含复盘/取舍" : "未检测到项目复盘"]),
      criterion("deployment", "部署准备", analysis.signals.deployment, [analysis.signals.deployment ? "检测到部署文件或部署说明" : "未检测到部署配置"]),
      criterion("security", "未泄漏密钥且无明显危险配置", !hasHighSecurity, analysis.securityFindings.length ? analysis.securityFindings.map((item) => `${item.file}:${item.line} ${item.code}`).slice(0, 10) : ["静态安全扫描未发现高危项"]),
    ];
  }

  async createDefense(submissionId: string, raw: unknown) {
    entityIdSchema.parse(submissionId);
    const request = defenseCreateSchema.parse(raw);
    const duplicate = this.challenges.defenseByRequest(request.clientRequestId);
    if (duplicate) return { ...duplicate, duplicate: true };
    const submission = this.challenges.submission(submissionId);
    const verification = this.challenges.verificationHistory(submissionId).at(-1);
    if (!verification || ["fail", "blocked", "timeout"].includes(String(verification.status))) throw new Error("PROJECT_VERIFICATION_REQUIRED");
    const challenge = this.challenges.challenge(String(submission.challengeId));
    const generated = await createDefenseQuestions({ repository: this.repository, challenge, analysis: this.challenges.analysis(submissionId), review: verification.aiReview });
    this.logAi("project_defense_questions", PROJECT_DEFENSE_PROMPT_VERSION, generated.meta);
    return this.challenges.createDefense({ challengeId: String(submission.challengeId), submissionId, verificationRunId: String(verification.id), clientRequestId: request.clientRequestId, questions: generated.questionSet.questions, confidence: generated.questionSet.confidence, limitations: generated.questionSet.limitations, meta: generated.meta });
  }

  async submitDefense(defenseId: string, raw: unknown) {
    entityIdSchema.parse(defenseId);
    const input = defenseSubmitSchema.parse(raw);
    const duplicate = this.challenges.defenseByAnswerRequest(input.clientRequestId);
    if (duplicate) return { defense: duplicate, result: this.challenges.result(String(duplicate.submissionId)), duplicate: true };
    const defense = this.challenges.defense(defenseId);
    const questions = defense.questions as Array<{ key: string; question: string; expectedSignals: string[] }>;
    if (new Set(input.answers.map((item) => item.questionKey)).size !== questions.length || questions.some((question) => !input.answers.some((item) => item.questionKey === question.key))) throw new Error("PROJECT_DEFENSE_ANSWER_MISMATCH");
    const evaluated = await evaluateDefense({ repository: this.repository, questions, answers: input.answers.map((item) => ({ questionKey: item.questionKey, answer: item.answer })) });
    this.logAi("project_defense_evaluation", PROJECT_DEFENSE_EVALUATOR_PROMPT_VERSION, evaluated.meta);
    const savedDefense = this.challenges.saveDefenseEvaluation({ defenseId, clientRequestId: input.clientRequestId, answers: input.answers, evaluation: evaluated.evaluation, meta: evaluated.meta });
    const submissionId = String(savedDefense.submissionId);
    const submission = this.challenges.submission(submissionId);
    const challenge = this.challenges.challenge(String(savedDefense.challengeId));
    const history = this.challenges.verificationHistory(submissionId);
    const latest = history.at(-1)!;
    const machineScore = this.criteriaScore(latest.criteria as MachineCriterion[]);
    const initialQuality = history.length ? this.criteriaScore(history[0].criteria as MachineCriterion[]) : machineScore;
    const repairScore = history.length > 1 ? Math.max(0, Math.min(1, 0.5 + machineScore - initialQuality)) : initialQuality;
    const tutorHintCount = this.challenges.tutorHintCount(String(challenge.goalId));
    const independence = calculateProjectIndependence({ tutorHintCount, aiAssistanceCount: Number(submission.aiAssistanceCount), maxAiAssistance: Number(challenge.maxAiAssistance), userModificationCount: Number(submission.userModificationCount), initialQuality, repairScore, designExplanationScore: evaluated.evaluation.designExplanationScore, defenseScore: evaluated.evaluation.overallScore, selfReportedIndependence: Number(submission.selfReportedIndependence) });
    const codeReviewScore = Number((latest.aiReview as Record<string, unknown>).score || machineScore);
    const status = latest.status === "pass" && evaluated.evaluation.overallScore >= 0.7 && independence.score >= 0.6 && codeReviewScore >= 0.65 ? "pass" : machineScore >= 0.55 && evaluated.evaluation.overallScore >= 0.5 ? "partial" : "fail";
    const targetAbilities = challenge.targetAbilities as string[];
    const result = this.challenges.saveFinalResult({ challengeId: String(challenge.id), submissionId, verificationRunId: String(latest.id), defenseSessionId: defenseId, status, machineScore, codeReviewScore, defenseScore: evaluated.evaluation.overallScore, independenceScore: independence.score, independence: { tutorHintCount, initialQuality, repairScore, designExplanationScore: evaluated.evaluation.designExplanationScore, rationale: independence.rationale }, achievedAbilities: status === "pass" ? targetAbilities : [], superficialAbilities: status === "pass" ? [] : targetAbilities, remediation: [...new Set([...(latest.failedCriteria as string[]), ...((latest.improvementPlan as string[]) || [])])].slice(0, 12), nextChallenge: status === "pass" ? ["进入更高难度、带并发与部署观测的工程挑战"] : ["根据失败标准回炉，提交新 revision 并保留修复过程"] });
    const goal = this.learning.goal(String(challenge.goalId));
    const evidence = this.evidence.createLearningPhase2Evidence({ sourceType: "project_challenge", sourceId: String(result.id), goalTitle: String(goal.title), description: `Project Challenge ${status.toUpperCase()}：机器 ${Math.round(machineScore * 100)}%，代码审查 ${Math.round(codeReviewScore * 100)}%，答辩 ${Math.round(evaluated.evaluation.overallScore * 100)}%，独立性 ${Math.round(independence.score * 100)}%。执行边界 local_dev_restricted；原始输出、失败标准和修复计划已保存。`, relatedAbility: String(goal.targetAbility || goal.title), evidenceType: "project", capturedAt: String(result.createdAt), dataKind: String(goal.dataKind || "user") as "user" | "demo" | "test" });
    const candidateId = await this.analyzeEvidence(evidence.id);
    const linked = this.challenges.linkEvidence(submissionId, evidence.id, candidateId);
    return { defense: savedDefense, result: linked, evidenceHandoff: { evidenceItemId: evidence.id, candidateId, status: candidateId ? "pending_approval" : "pending_analysis", growthGraphUpdated: false, approvalRequired: true }, duplicate: false };
  }

  private criteriaScore(criteria: MachineCriterion[]) {
    return verificationVerdict(criteria).score;
  }

  private async analyzeEvidence(evidenceItemId: string) {
    try {
      const snapshot = await new EvidenceService(this.repository).analyze();
      return snapshot.items.find((item) => item.id === evidenceItemId)?.latestEvaluation?.candidateId ?? null;
    } catch (error) {
      console.error("[ProjectChallenge] Evidence handoff pending", { evidenceItemId, error: error instanceof Error ? error.message : "unknown_error" });
      return null;
    }
  }

  private logAi(purpose: string, promptVersion: string, meta: ProjectAIMeta) {
    this.repository.logAi({ purpose, provider: meta.provider, taskClass: purpose === "project_code_review" ? "coding" : "high_reasoning", requestId: meta.requestId, promptVersion, model: meta.model, mode: meta.mode, latencyMs: meta.latencyMs, success: meta.success, errorCode: meta.errorCode, inputTokens: meta.inputTokens, outputTokens: meta.outputTokens });
  }
}
