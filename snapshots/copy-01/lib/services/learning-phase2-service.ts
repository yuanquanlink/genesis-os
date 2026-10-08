import { entityIdSchema } from "@/lib/domain/profile";
import {
  codeAssessmentInputSchema,
  formalAssessmentCreateSchema,
  formalAssessmentSubmissionSchema,
} from "@/lib/domain/learning-phase2";
import type { ProfileRepository } from "@/lib/db/repository";
import { LearningRepository } from "@/lib/db/learning-repository";
import { LearningPhase2Repository } from "@/lib/db/learning-phase2-repository";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import { EvidenceService } from "@/lib/services/evidence-service";
import {
  evaluateCodeAssessment,
  evaluateFormalAssessment,
  generateFormalAssessment,
  type AssessmentAIMeta,
} from "@/lib/ai/assessment-engine";
import {
  CODE_ASSESSMENT_PROMPT_VERSION,
  FORMAL_ASSESSMENT_EVALUATOR_PROMPT_VERSION,
  FORMAL_ASSESSMENT_PROMPT_VERSION,
} from "@/lib/ai/prompt-versions";

export class LearningPhase2Service {
  private readonly learning: LearningRepository;
  private readonly phase2: LearningPhase2Repository;
  private readonly evidence: EvidenceRepository;

  constructor(private readonly repository: ProfileRepository) {
    this.learning = new LearningRepository(repository.db);
    this.phase2 = new LearningPhase2Repository(repository);
    this.evidence = new EvidenceRepository(repository);
  }

  snapshot(goalId?: string | null) {
    if (goalId) entityIdSchema.parse(goalId);
    return this.phase2.snapshot(goalId || undefined);
  }

  syncResource(resourceId: string) {
    entityIdSchema.parse(resourceId);
    return this.phase2.syncResourceIntelligence(resourceId);
  }

  async createAssessment(goalId: string, raw: unknown) {
    entityIdSchema.parse(goalId);
    const request = formalAssessmentCreateSchema.parse(raw);
    const existing = this.phase2.assessmentByRequest(request.clientRequestId);
    if (existing) return Object.assign(existing, { duplicate: true as const });
    const goal = this.learning.goal(goalId);
    const node = this.phase2.activeNode(goalId, request.nodeId);
    if (!node) throw new Error("ASSESSMENT_NODE_REQUIRED");
    const generated = await generateFormalAssessment({
      goal,
      node,
      sources: this.phase2.sourcesForGoal(goalId),
      repository: this.repository,
    });
    this.logAi("formal_assessment", FORMAL_ASSESSMENT_PROMPT_VERSION, generated.meta);
    return this.phase2.createAssessment(
      goalId,
      { ...request, nodeId: String(node.id) },
      generated.assessment,
      generated.meta,
    );
  }

  async submitAssessment(assessmentId: string, raw: unknown) {
    entityIdSchema.parse(assessmentId);
    const submission = formalAssessmentSubmissionSchema.parse(raw);
    const assessment = this.phase2.assessment(assessmentId, true);
    if (String(assessment.status) === "graded")
      return { ...this.phase2.assessment(assessmentId), duplicate: true };
    const goal = this.learning.goal(String(assessment.goalId));
    const questions = assessment.questions.map((question) => ({
      id: String(question.id),
      type: String(question.type),
      question: String(question.question),
      concept: String(question.concept),
      rubric: Array.isArray(question.rubric) ? question.rubric.map(String) : [],
      expectedAnswer: String(question.expectedAnswer || ""),
      sourceReference: String(question.sourceReference || ""),
    }));
    const evaluated = await evaluateFormalAssessment({
      goal,
      questions,
      submission,
      repository: this.repository,
    });
    this.logAi("formal_assessment_evaluation", FORMAL_ASSESSMENT_EVALUATOR_PROMPT_VERSION, evaluated.meta);
    const saved = this.phase2.saveAssessmentSubmission(assessmentId, submission, evaluated.evaluation);
    if (saved.duplicate) return saved;
    const average = Number(saved.summary.average);
    const evidence = this.evidence.createLearningPhase2Evidence({
      sourceType: "formal_assessment",
      sourceId: assessmentId,
      goalTitle: String(goal.title),
      description: `正式 Assessment 完成：综合得分 ${Math.round(average * 100)}%；原始答案、作答时长、提示次数、独立性和逐题反馈均已保存。`,
      relatedAbility: String(goal.targetAbility || goal.title),
      evidenceType: "learning",
      capturedAt: new Date().toISOString(),
      dataKind: String(goal.dataKind || "user") as "user" | "demo" | "test",
    });
    const candidateId = await this.analyzeEvidence(evidence.id);
    return {
      ...saved,
      evidenceHandoff: {
        evidenceItemId: evidence.id,
        candidateId,
        status: candidateId ? "pending_approval" : "pending_analysis",
        growthGraphUpdated: false,
        approvalRequired: true,
      },
    };
  }

  async submitCodeAssessment(goalId: string, raw: unknown) {
    entityIdSchema.parse(goalId);
    const input = codeAssessmentInputSchema.parse(raw);
    const duplicate = this.phase2.codeAssessmentByRequest(input.clientRequestId);
    if (duplicate) return { ...duplicate, duplicate: true };
    const goal = this.learning.goal(goalId);
    const node = this.phase2.activeNode(goalId, input.nodeId);
    const submission = { ...input, nodeId: node ? String(node.id) : null };
    const evaluated = await evaluateCodeAssessment({ goal, submission, repository: this.repository });
    this.logAi("code_assessment", CODE_ASSESSMENT_PROMPT_VERSION, evaluated.meta);
    const saved = this.phase2.saveCodeAssessment(goalId, submission, evaluated.evaluation, evaluated.meta);
    if (saved.duplicate) return saved;
    const evidence = this.evidence.createLearningPhase2Evidence({
      sourceType: "code_assessment",
      sourceId: String(saved.id),
      goalTitle: String(goal.title),
      description: `代码评估得分 ${Math.round(Number(saved.weightedScore) * 100)}%；覆盖正确性、结构、可读性、异常处理、测试、工程规范和用户解释。独立性 ${input.independenceLevel}/4，提示 ${input.hintCount} 次。`,
      relatedAbility: String(goal.targetAbility || goal.title),
      evidenceType: "project",
      capturedAt: String(saved.createdAt),
      dataKind: String(goal.dataKind || "user") as "user" | "demo" | "test",
    });
    const candidateId = await this.analyzeEvidence(evidence.id);
    this.phase2.linkCodeEvidence(String(saved.id), evidence.id, candidateId);
    return {
      ...this.phase2.codeAssessmentByRequest(input.clientRequestId),
      duplicate: false,
      evidenceHandoff: {
        evidenceItemId: evidence.id,
        candidateId,
        status: candidateId ? "pending_approval" : "pending_analysis",
        growthGraphUpdated: false,
        approvalRequired: true,
      },
    };
  }

  private async analyzeEvidence(evidenceItemId: string) {
    try {
      const snapshot = await new EvidenceService(this.repository).analyze();
      return snapshot.items.find((item) => item.id === evidenceItemId)?.latestEvaluation?.candidateId ?? null;
    } catch (error) {
      console.error("[LearningPhase2] Evidence handoff pending", {
        evidenceItemId,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      return null;
    }
  }

  private logAi(purpose: string, promptVersion: string, meta: AssessmentAIMeta) {
    this.repository.logAi({
      purpose,
      provider: meta.provider,
      taskClass: meta.taskClass,
      requestId: meta.requestId,
      promptVersion,
      model: meta.model,
      mode: meta.mode,
      latencyMs: meta.latencyMs,
      success: meta.providerSucceeded,
      errorCode: meta.fallbackReason,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
    });
  }
}
