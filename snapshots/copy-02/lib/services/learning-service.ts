import { createHash, randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import { LearningRepository } from "@/lib/db/learning-repository";
import { ProfileService } from "@/lib/services/profile-service";
import { generateDiagnostic, evaluateLearningTurn } from "@/lib/ai/learning-engine";
import { describeUploadedResource, parseUploadedResource, parseUrlResource } from "@/lib/services/resource-parser";
import {
  diagnosticOutputSchema,
  diagnosticSubmissionSchema,
  engineeringOutcomeInputSchema,
  learningGoalInputSchema,
  learningRequestSchema,
  resourceUploadMetadataSchema,
  reviewAttemptInputSchema,
  sessionAnswerSchema,
  urlResourceInputSchema,
} from "@/lib/domain/learning";
import { entityIdSchema } from "@/lib/domain/profile";
import { LEARNING_DESIGNER_PROMPT_VERSION, LEARNING_EVALUATOR_PROMPT_VERSION } from "@/lib/ai/prompt-versions";
import { LearningAgentRepository } from "@/lib/db/learning-agent-repository";
import { LearningPhase2Repository } from "@/lib/db/learning-phase2-repository";
import { ProjectChallengeService } from "@/lib/services/project-challenge-service";
import { DailyLearningService } from "@/lib/services/daily-learning-service";

export class LearningService {
  readonly learning: LearningRepository;
  constructor(private readonly profile: ProfileRepository) { this.learning = new LearningRepository(profile.db); }

  snapshot() {
    const base = this.learning.snapshot();
    const daily = new DailyLearningService(this.profile);
    for (const goal of base.goals.slice(0, 20)) daily.ensureMorningBrief(String(goal.id));
    return {
      ...base,
      agent: new LearningAgentRepository(this.profile).snapshot(),
      phase2: new LearningPhase2Repository(this.profile).snapshot(),
      projectChallenges: new ProjectChallengeService(this.profile).snapshot(),
      dailyLoop: daily.snapshot(),
    };
  }

  createGoal(raw: unknown) { return this.learning.createGoal(learningGoalInputSchema.parse(raw)); }

  async addUrlResource(raw: unknown) {
    const input = urlResourceInputSchema.parse(raw);
    this.learning.goal(input.goalId);
    const reserved = this.learning.reserveResource({
      goalId: input.goalId,
      clientRequestId: input.clientRequestId,
      sourceType: input.sourceType,
      title: input.title || new URL(input.url).hostname,
      sourceUrl: input.url,
    });
    if (reserved.duplicate && String(reserved.status) !== "queued") {
      new LearningPhase2Repository(this.profile).syncResourceIntelligence(String(reserved.id));
      return reserved;
    }
    if (reserved.duplicate) return reserved;
    const parsed = await parseUrlResource(input);
    const saved = this.learning.completeReservedResource(String(reserved.id), parsed);
    new LearningPhase2Repository(this.profile).syncResourceIntelligence(String(saved.id));
    return saved;
  }

  async addUploadedResource(form: FormData) {
    const metadata = resourceUploadMetadataSchema.parse({ clientRequestId: form.get("clientRequestId"), goalId: form.get("goalId"), title: form.get("title") || undefined });
    this.learning.goal(metadata.goalId);
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("FILE_REQUIRED");
    const described = describeUploadedResource(file, metadata.title);
    const reserved = this.learning.reserveResource({
      goalId: metadata.goalId,
      clientRequestId: metadata.clientRequestId,
      ...described,
    });
    if (reserved.duplicate && String(reserved.status) !== "queued") {
      new LearningPhase2Repository(this.profile).syncResourceIntelligence(String(reserved.id));
      return reserved;
    }
    if (reserved.duplicate) return reserved;
    const parsed = await parseUploadedResource(file, metadata.title);
    const saved = this.learning.completeReservedResource(String(reserved.id), parsed);
    new LearningPhase2Repository(this.profile).syncResourceIntelligence(String(saved.id));
    return saved;
  }

  async generateBaseline(goalId: string) {
    entityIdSchema.parse(goalId);
    const goal = this.learning.goal(goalId);
    const corpusRecords = this.learning.resourceCorpus(goalId);
    if (!corpusRecords.length) throw new Error("READY_RESOURCE_REQUIRED");
    const corpus = corpusRecords.map((resource) => `\n# ${resource.title}\n${resource.text}`).join("\n");
    const providerIdentity = `${process.env.MODEL_PROVIDER || "demo"}:${process.env.DEFAULT_MODEL || "default"}`;
    const cacheKey = createHash("sha256").update(`baseline:v2:${providerIdentity}:${goalId}:${corpus}`).digest("hex");
    let result = this.learning.cacheGet<Awaited<ReturnType<typeof generateDiagnostic>>>(cacheKey);
    const cacheHit = Boolean(result);
    if (!result) {
      result = await generateDiagnostic({ title: String(goal.title), purpose: String(goal.purpose), targetLevel: String(goal.targetLevel), engineeringOutcome: String(goal.engineeringOutcome), corpus }, this.profile);
      if (result.meta.providerSucceeded)
        this.learning.cacheSet(cacheKey, "learning_baseline", result, result.meta.model);
    }
    diagnosticOutputSchema.parse(result.output);
    if (!cacheHit)
      this.profile.logAi({ purpose: "learning_baseline", provider: result.meta.provider, taskClass: result.meta.taskClass, requestId: result.meta.requestId, promptVersion: LEARNING_DESIGNER_PROMPT_VERSION, model: result.meta.model, mode: result.meta.mode, latencyMs: result.meta.latencyMs, success: result.meta.providerSucceeded, errorCode: result.meta.fallbackReason, inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens });
    return this.learning.createDiagnostic(goalId, result.output, result.meta.mode, result.meta.provider);
  }

  submitBaseline(goalId: string, raw: unknown) {
    entityIdSchema.parse(goalId);
    return this.learning.submitDiagnostic(goalId, diagnosticSubmissionSchema.parse(raw).answers);
  }

  startSession(goalId: string, raw: unknown) {
    entityIdSchema.parse(goalId);
    const request = learningRequestSchema.parse(raw);
    return this.learning.startSession(goalId, request.clientRequestId);
  }

  async answerSession(sessionId: string, raw: unknown) {
    entityIdSchema.parse(sessionId);
    const input = sessionAnswerSchema.parse(raw);
    const duplicate = this.learning.sessionForAnswerRequest(input.clientRequestId);
    if (duplicate) return duplicate;
    const session = this.learning.session(sessionId);
    if (session.status !== "active" || !session.activeStage) return { ...session, duplicate: true };
    const node = this.learning.snapshot().nodes.find((item) => item.id === session.nodeId);
    const result = await evaluateLearningTurn({ stageKey: session.activeStage.key, prompt: session.activeStage.prompt, response: input.response, nodeTitle: String(node?.title || "当前知识点") }, this.profile);
    this.profile.logAi({ purpose: "learning_turn", provider: result.meta.provider, taskClass: result.meta.taskClass, requestId: result.meta.requestId, promptVersion: LEARNING_EVALUATOR_PROMPT_VERSION, model: result.meta.model, mode: result.meta.mode, latencyMs: result.meta.latencyMs, success: result.meta.providerSucceeded, errorCode: result.meta.fallbackReason, inputTokens: result.meta.inputTokens, outputTokens: result.meta.outputTokens });
    const saved = this.learning.answerSession(sessionId, input, result.evaluation);
    if (!saved.duplicate) {
      const independenceLevel = input.codeAuthorship === "ai_generated" ? 0 : input.codeAuthorship === "user_modified" ? 2 : 3;
      const adaptive = new LearningPhase2Repository(this.profile).recordAdaptiveSignal({
        goalId: String(saved.goalId),
        nodeId: String(saved.nodeId),
        triggerType: "learning_result",
        sourceId: sessionId,
        score: result.evaluation.score,
        transferScore: session.activeStage.key === "transfer" ? result.evaluation.score : 0,
        practiceScore: ["micro_practice", "engineering_link"].includes(session.activeStage.key) ? result.evaluation.score : 0,
        independenceLevel,
        prerequisiteGap: Boolean(result.evaluation.misconception && result.evaluation.score < 0.45),
        actualMinutes: Math.ceil(input.responseTimeSeconds / 60),
      });
      return { ...saved, adaptive };
    }
    return saved;
  }

  submitReview(reviewId: string, raw: unknown) {
    entityIdSchema.parse(reviewId);
    const input = reviewAttemptInputSchema.parse(raw);
    const saved = this.learning.submitReview(reviewId, input);
    if (!saved.duplicate) {
      const adaptive = new LearningPhase2Repository(this.profile).recordAdaptiveSignal({
        goalId: String(saved.goalId),
        nodeId: String(saved.nodeId),
        triggerType: "review",
        sourceId: reviewId,
        score: Number(saved.score),
        delayedScore: Number(saved.score),
        transferScore: input.transferScore,
        independenceLevel: Number(saved.effectiveIndependence),
        prerequisiteGap: input.repeatedError,
        actualMinutes: Math.ceil(input.responseTimeSeconds / 60),
      });
      return { ...saved, adaptive };
    }
    return saved;
  }

  async recordOutcome(goalId: string, raw: unknown) {
    entityIdSchema.parse(goalId);
    const input = engineeringOutcomeInputSchema.parse(raw);
    const goal = this.learning.goal(goalId);
    const outcome = this.learning.recordOutcome(goalId, input);
    if (!outcome.duplicate) {
      const authorship = { ai_generated: "主要由 AI 生成，尚需证明用户理解", user_modified: "由 AI 辅助且用户已理解并修改", user_independent: "由用户独立完成" }[input.codeAuthorship];
      await new ProfileService(this.profile).submitEntry({
        content: `完成学习路径“${String(goal.title)}”的工程成果：${input.title}。状态：${input.status}；代码证据：${authorship}。展示说明：${input.demoNotes}\n复盘：${input.retrospective}`,
        category: "project", tags: ["学习引擎", "工程成果", String(goal.title).slice(0, 24)], importance: 5,
        occurredAt: new Date().toISOString(), allowAi: true, clientRequestId: randomUUID(), dataKind: "user",
      });
    }
    return { ...outcome, timelineWritten: !outcome.duplicate, profileCandidateRequiresApproval: true };
  }
}
