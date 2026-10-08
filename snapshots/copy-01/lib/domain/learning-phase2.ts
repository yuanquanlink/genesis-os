import { z } from "zod";

export const independenceLevelSchema = z.number().int().min(0).max(4);

export const assessmentQuestionTypeSchema = z.enum([
  "concept_explanation",
  "choice",
  "true_false",
  "correction",
  "transfer",
  "code_task",
  "mini_project",
  "delayed_recall",
]);

const requiredQuestionTypes = [
  "concept_explanation",
  "choice",
  "correction",
  "transfer",
  "code_task",
  "mini_project",
  "delayed_recall",
] as const;

export const formalAssessmentQuestionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  type: assessmentQuestionTypeSchema,
  question: z.string().trim().min(8).max(2_000),
  concept: z.string().trim().min(1).max(160),
  difficulty: z.number().int().min(1).max(5),
  expectedSkill: z.string().trim().min(2).max(240),
  rubric: z.array(z.string().trim().min(1).max(240)).min(1).max(10),
  options: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
  expectedAnswer: z.string().trim().min(1).max(2_000),
  sourceRef: z.string().trim().min(1).max(300),
});

export const formalAssessmentOutputSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    rationale: z.string().trim().min(8).max(800),
    questions: z.array(formalAssessmentQuestionSchema).min(7).max(9),
    confidence: z.number().min(0).max(1),
    limitations: z.array(z.string().trim().min(2).max(500)).max(8),
  })
  .superRefine((value, context) => {
    const types = new Set(value.questions.map((item) => item.type));
    for (const type of requiredQuestionTypes) {
      if (!types.has(type))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions"],
          message: `Assessment 缺少题型 ${type}`,
        });
    }
  });

export const formalAssessmentCreateSchema = z.object({
  clientRequestId: z.string().uuid(),
  nodeId: z.string().uuid().nullable().default(null),
  missionId: z.string().uuid().nullable().default(null),
  assessmentType: z.enum(["immediate", "delayed", "review", "project"]).default("immediate"),
});

export const formalAssessmentSubmissionSchema = z.object({
  clientRequestId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        userAnswer: z.string().trim().min(1).max(20_000),
        answerDurationSeconds: z.number().int().min(1).max(28_800),
        confidence: z.number().int().min(1).max(5),
        hintCount: z.number().int().min(0).max(50).default(0),
        independenceLevel: independenceLevelSchema,
      }),
    )
    .min(7)
    .max(9),
});

export const assessmentEvaluationSchema = z.object({
  items: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        rawScore: z.number().min(0).max(1),
        correctness: z.enum(["incorrect", "partial", "correct"]),
        reasoningQuality: z.number().min(0).max(1),
        feedback: z.string().trim().min(2).max(1_200),
        misconception: z.string().trim().min(2).max(600).nullable(),
      }),
    )
    .min(7)
    .max(9),
  overallFeedback: z.string().trim().min(5).max(1_500),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8),
});

export const codeAssessmentInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  nodeId: z.string().uuid().nullable().default(null),
  language: z.string().trim().min(1).max(40),
  filename: z.string().trim().min(1).max(160).nullable().default(null),
  sourceCode: z.string().min(10).max(250_000),
  userExplanation: z.string().trim().min(10).max(6_000),
  changedConditionAnswer: z.string().trim().min(10).max(4_000),
  failureAnalysis: z.string().trim().min(10).max(4_000),
  hintCount: z.number().int().min(0).max(50).default(0),
  independenceLevel: independenceLevelSchema,
});

export const codeAssessmentEvaluationSchema = z.object({
  correctness: z.number().min(0).max(1),
  structure: z.number().min(0).max(1),
  readability: z.number().min(0).max(1),
  errorHandling: z.number().min(0).max(1),
  testing: z.number().min(0).max(1),
  engineering: z.number().min(0).max(1),
  understanding: z.number().min(0).max(1),
  feedback: z.string().trim().min(5).max(2_000),
  followUpQuestions: z.array(z.string().trim().min(5).max(500)).length(3),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8),
});

export type AssessmentQuestionType = z.infer<typeof assessmentQuestionTypeSchema>;
export type FormalAssessmentOutput = z.infer<typeof formalAssessmentOutputSchema>;
export type FormalAssessmentSubmission = z.infer<typeof formalAssessmentSubmissionSchema>;
export type AssessmentEvaluation = z.infer<typeof assessmentEvaluationSchema>;
export type CodeAssessmentInput = z.infer<typeof codeAssessmentInputSchema>;
export type CodeAssessmentEvaluation = z.infer<typeof codeAssessmentEvaluationSchema>;

export const independenceLabels = [
  "AI 完全生成",
  "大量依赖 AI 提示",
  "AI 提供方向，用户完成主要部分",
  "用户基本独立完成",
  "用户完全独立完成并能解释",
] as const;

const independenceWeights = [0.15, 0.35, 0.6, 0.82, 1] as const;

export function effectiveIndependence(level: number, hintCount: number) {
  return Math.max(0, Math.min(4, Math.round(level) - Math.min(2, Math.floor(Math.max(0, hintCount) / 2))));
}

export function independenceWeightedScore(
  rawScore: number,
  level: number,
  hintCount: number,
  practical: boolean,
) {
  const effective = effectiveIndependence(level, hintCount);
  const factor = independenceWeights[effective];
  const base = Math.min(1, Math.max(0, rawScore));
  return Math.min(1, base * (practical ? factor : 0.72 + factor * 0.28));
}

export type MasteryMetrics = {
  immediateCorrectness: number;
  delayedCorrectness: number;
  explanation: number;
  correction: number;
  transfer: number;
  practice: number;
  engineeringIndependence: number;
};

export function calculatePhase2Mastery(metrics: MasteryMetrics) {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const normalized = Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, clamp(value)]),
  ) as MasteryMetrics;
  const mastery =
    normalized.immediateCorrectness * 0.16 +
    normalized.delayedCorrectness * 0.18 +
    normalized.explanation * 0.14 +
    normalized.correction * 0.12 +
    normalized.transfer * 0.16 +
    normalized.practice * 0.12 +
    normalized.engineeringIndependence * 0.12;
  const breadth = Object.values(normalized).filter((value) => value > 0).length / 7;
  return {
    mastery: Math.min(0.98, mastery * (0.72 + breadth * 0.28)),
    confidence: Math.min(0.95, 0.2 + breadth * 0.45 + Math.min(0.3, mastery * 0.3)),
    metrics: normalized,
  };
}

export type ReviewSignals = {
  score: number;
  responseTimeSeconds: number;
  expectedSeconds: number;
  confidence: number;
  hintCount: number;
  independenceLevel: number;
  repeatedError: boolean;
  transferScore: number;
  previousIntervalDays: number;
};

export function scheduleNextReview(signals: ReviewSignals) {
  const correctness = Math.min(1, Math.max(0, signals.score));
  const speed = Math.min(1, Math.max(0.35, signals.expectedSeconds / Math.max(1, signals.responseTimeSeconds)));
  const calibration = 1 - Math.min(0.45, Math.abs(signals.confidence / 5 - correctness));
  const independence = independenceWeights[effectiveIndependence(signals.independenceLevel, signals.hintCount)];
  const errorPenalty = signals.repeatedError ? 0.55 : 1;
  const quality =
    (correctness * 0.36 +
      speed * 0.12 +
      calibration * 0.1 +
      independence * 0.2 +
      Math.min(1, Math.max(0, signals.transferScore)) * 0.22) *
    errorPenalty;
  let intervalDays = 1;
  if (quality >= 0.86) intervalDays = Math.max(7, signals.previousIntervalDays * 2 || 7);
  else if (quality >= 0.72) intervalDays = Math.max(4, Math.round(signals.previousIntervalDays * 1.7) || 4);
  else if (quality >= 0.55) intervalDays = Math.max(2, signals.previousIntervalDays || 2);
  intervalDays = Math.min(60, intervalDays);
  return {
    intervalDays,
    quality,
    stability: Math.max(0.5, intervalDays * (0.7 + quality * 0.6)),
    difficultyFactor: Math.max(0.6, Math.min(1.8, 1.4 - quality * 0.65 + (signals.repeatedError ? 0.25 : 0))),
    reason: `正确率 ${Math.round(correctness * 100)}%，迁移 ${Math.round(signals.transferScore * 100)}%，独立性 ${effectiveIndependence(signals.independenceLevel, signals.hintCount)}/4，提示 ${signals.hintCount} 次${signals.repeatedError ? "，存在重复错误" : ""}`,
  };
}

export type AdaptiveSignals = {
  score: number;
  delayedScore: number;
  transferScore: number;
  practiceScore: number;
  independenceLevel: number;
  prerequisiteGap: boolean;
};

export function decideCurriculumAdjustment(signals: AdaptiveSignals) {
  if (signals.prerequisiteGap || signals.score < 0.38)
    return { action: "remediate_prerequisite" as const, reason: "前置知识证据不足，先补依赖再继续当前概念。" };
  if (signals.score < 0.52)
    return { action: "lower_difficulty" as const, reason: "当前题目正确率过低，降低难度并补充反例与纠错。" };
  if (signals.delayedScore > 0 && signals.delayedScore < 0.62)
    return { action: "schedule_review" as const, reason: "延迟回忆明显低于即时表现，需要先安排复习。" };
  if (signals.practiceScore < 0.7 || signals.independenceLevel < 3)
    return { action: "increase_practice" as const, reason: "解释表现尚可，但实践或独立性证据不足。" };
  if (signals.score >= 0.84 && signals.transferScore >= 0.78 && signals.independenceLevel >= 3)
    return { action: "advance_phase" as const, reason: "即时、迁移与独立实践均达到阶段推进门槛。" };
  return { action: "continue" as const, reason: "证据支持继续当前概念，但尚不足以提前进入下一阶段。" };
}

export function recalibrateEstimate(input: {
  previousRealisticMinutes: number;
  plannedMinutes: number;
  actualMinutes: number;
  assessmentScore: number;
  prerequisiteGapCount: number;
  delayedScore: number;
  projectComplexity: number;
  dailyMinutes: number;
}) {
  const pace = input.actualMinutes > 0 && input.plannedMinutes > 0
    ? Math.min(1.8, Math.max(0.65, input.actualMinutes / input.plannedMinutes))
    : 1;
  const scoreFactor = 1.28 - Math.min(1, Math.max(0, input.assessmentScore)) * 0.42;
  const retentionFactor = input.delayedScore > 0 ? 1.2 - input.delayedScore * 0.2 : 1.08;
  const gapFactor = 1 + Math.min(0.4, input.prerequisiteGapCount * 0.08);
  const projectFactor = 0.9 + Math.min(5, Math.max(1, input.projectComplexity)) * 0.08;
  const realistic = Math.max(30, Math.round(input.previousRealisticMinutes * pace * scoreFactor * retentionFactor * gapFactor * projectFactor));
  const realisticMin = Math.max(20, Math.round(realistic * 0.88));
  const realisticMax = Math.max(realisticMin + 15, Math.round(realistic * 1.2));
  const conservative = Math.max(realisticMax, Math.round(realistic * 1.55));
  const optimistic = Math.max(15, Math.round(realistic * 0.7));
  const days = Math.max(1, Math.ceil(realistic / Math.max(10, input.dailyMinutes)));
  return {
    optimisticMinutes: optimistic,
    realisticMinutes: realistic,
    realisticMinMinutes: realisticMin,
    realisticMaxMinutes: realisticMax,
    conservativeMinutes: conservative,
    confidence: Math.min(0.9, 0.55 + (input.actualMinutes > 0 ? 0.12 : 0) + (input.delayedScore > 0 ? 0.12 : 0)),
    estimatedFinishDate: new Date(Date.now() + days * 86_400_000).toISOString(),
    reason: `根据真实投入速度、Assessment ${Math.round(input.assessmentScore * 100)}%、前置缺口 ${input.prerequisiteGapCount} 个、延迟表现 ${Math.round(input.delayedScore * 100)}% 和工程复杂度重新估计。`,
  };
}
