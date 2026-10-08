import { z } from "zod";

export const challengeStatusSchema = z.enum([
  "draft", "active", "submitted", "verifying", "defense", "completed", "needs_work", "archived",
]);
export const verificationStatusSchema = z.enum(["pass", "partial", "fail", "blocked", "timeout"]);

const textList = z.array(z.string().trim().min(2).max(500)).min(1).max(30);

export const projectChallengeCreateSchema = z.object({
  clientRequestId: z.string().uuid(),
  challengeTitle: z.string().trim().min(5).max(180),
  targetAbilities: textList.max(12),
  requirements: textList,
  acceptanceCriteria: textList,
  difficulty: z.number().int().min(1).max(5),
  deadline: z.string().datetime().nullable().default(null),
  maxAiAssistance: z.number().int().min(0).max(100).default(3),
  requiredTests: textList.max(20),
  requiredDocs: textList.max(20),
  deploymentRequirement: z.string().trim().min(2).max(500),
  allowNetwork: z.boolean().default(false),
});

export const localSubmissionSchema = z.object({
  clientRequestId: z.string().uuid(),
  sourceType: z.enum(["local_path", "git_url", "github_url"]),
  localPath: z.string().trim().min(1).max(1_000).nullable().default(null),
  sourceUrl: z.string().url().max(2_000).nullable().default(null),
  aiAssistanceCount: z.number().int().min(0).max(1_000).default(0),
  userModificationCount: z.number().int().min(0).max(10_000).default(0),
  selfReportedIndependence: z.number().int().min(0).max(4).default(0),
}).superRefine((value, context) => {
  if (value.sourceType === "local_path" && !value.localPath)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["localPath"], message: "本地项目路径不能为空" });
  if (value.sourceType !== "local_path" && !value.sourceUrl)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceUrl"], message: "Git 仓库地址不能为空" });
});

export const projectVerificationRequestSchema = z.object({ clientRequestId: z.string().uuid() });
export const defenseCreateSchema = z.object({ clientRequestId: z.string().uuid() });
export const defenseSubmitSchema = z.object({
  clientRequestId: z.string().uuid(),
  answers: z.array(z.object({
    questionKey: z.string().trim().min(1).max(80),
    answer: z.string().trim().min(10).max(8_000),
    answerDurationSeconds: z.number().int().min(1).max(28_800),
    confidence: z.number().int().min(1).max(5),
  })).min(4).max(8),
});

export const machineCriterionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(2).max(240),
  status: z.enum(["pass", "partial", "fail"]),
  evidence: z.array(z.string().trim().min(1).max(800)).max(20),
});

export const codeReviewSchema = z.object({
  summary: z.string().trim().min(5).max(1_500),
  strengths: z.array(z.string().trim().min(2).max(600)).max(10),
  weaknesses: z.array(z.string().trim().min(2).max(600)).max(10),
  failedCriteria: z.array(z.string().trim().min(1).max(300)).max(20),
  improvementPlan: z.array(z.string().trim().min(2).max(600)).min(1).max(12),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8),
});

export const defenseQuestionSetSchema = z.object({
  questions: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    question: z.string().trim().min(8).max(800),
    focus: z.string().trim().min(2).max(200),
    expectedSignals: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
  })).length(6),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8),
});

export const defenseEvaluationSchema = z.object({
  items: z.array(z.object({
    questionKey: z.string().trim().min(1).max(80),
    score: z.number().min(0).max(1),
    feedback: z.string().trim().min(2).max(1_000),
    misconception: z.string().trim().min(2).max(600).nullable(),
  })).length(6),
  overallScore: z.number().min(0).max(1),
  designExplanationScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8),
});

export type MachineCriterion = z.infer<typeof machineCriterionSchema>;

export function verificationVerdict(criteria: MachineCriterion[]) {
  const pass = criteria.filter((item) => item.status === "pass").length;
  const fail = criteria.filter((item) => item.status === "fail").length;
  const score = criteria.length ? criteria.reduce((sum, item) => sum + (item.status === "pass" ? 1 : item.status === "partial" ? 0.5 : 0), 0) / criteria.length : 0;
  return { status: (fail === 0 && pass === criteria.length ? "pass" : score >= 0.55 ? "partial" : "fail") as "pass" | "partial" | "fail", score };
}

export function calculateProjectIndependence(input: {
  tutorHintCount: number;
  aiAssistanceCount: number;
  maxAiAssistance: number;
  userModificationCount: number;
  initialQuality: number;
  repairScore: number;
  designExplanationScore: number;
  defenseScore: number;
  selfReportedIndependence: number;
}) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const hintSignal = clamp(1 - (input.tutorHintCount + input.aiAssistanceCount) / 20);
  const modificationSignal = clamp(input.userModificationCount / 5);
  const selfReport = clamp(input.selfReportedIndependence / 4);
  const excessAssistance = Math.max(0, input.aiAssistanceCount - input.maxAiAssistance);
  const penalty = Math.min(0.28, excessAssistance * 0.035);
  const score = clamp(
    input.initialQuality * 0.2 +
    input.repairScore * 0.12 +
    input.designExplanationScore * 0.2 +
    input.defenseScore * 0.23 +
    hintSignal * 0.13 +
    modificationSignal * 0.07 +
    selfReport * 0.05 - penalty,
  );
  return {
    score,
    rationale: {
      initialQuality: clamp(input.initialQuality),
      repairScore: clamp(input.repairScore),
      designExplanation: clamp(input.designExplanationScore),
      defense: clamp(input.defenseScore),
      hintSignal,
      modificationSignal,
      selfReport,
      excessAssistance,
      assistancePenalty: penalty,
    },
  };
}
