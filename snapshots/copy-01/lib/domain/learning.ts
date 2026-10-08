import { z } from "zod";

export const targetLevelSchema = z.enum(["literacy", "working", "proficient", "expert"]);
export const sourceTypeSchema = z.enum(["pdf", "markdown", "text", "epub", "webpage", "video", "playlist", "github", "documentation"]);
export const codeAuthorshipSchema = z.enum(["ai_generated", "user_modified", "user_independent"]);
export const evidenceTypeSchema = z.enum(["immediate_test", "delayed_test", "active_recall", "explanation", "correction", "transfer", "coding", "project"]);
export const learningRequestSchema = z.object({ clientRequestId: z.string().uuid() });

export const learningGoalInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  purpose: z.string().trim().min(10).max(1_500),
  currentBasis: z.string().trim().min(2).max(1_500).default("尚未系统学习，将通过基线诊断确定起点"),
  finalGoal: z.string().trim().min(5).max(1_500).default("完成一个可以独立解释、迁移和验证的工程学习成果"),
  targetAbility: z.string().trim().min(2).max(120).default("软件工程"),
  currentLevel: z.number().int().min(0).max(5).default(1),
  targetLevelScore: z.number().int().min(0).max(5).default(4),
  motivation: z.string().trim().min(5).max(1_500).default("建立可验证、可迁移并能长期复利的能力"),
  targetLevel: targetLevelSchema,
  masteryLevel: z.number().int().min(1).max(6).default(3),
  dailyMinutes: z.number().int().min(10).max(480),
  weeklyDays: z.number().int().min(1).max(7).default(5),
  deadline: z.string().datetime().nullable(),
  engineeringOutcome: z.string().trim().min(10).max(1_000),
  fdeLinked: z.boolean().default(true),
  dataKind: z.enum(["user", "demo", "test"]).default("user"),
}).superRefine((input, context) => {
  if (input.targetLevelScore <= input.currentLevel)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetLevelScore"],
      message: "目标能力等级必须高于当前等级",
    });
});

export const urlResourceInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  goalId: z.string().uuid(),
  url: z.string().url().max(2_000),
  sourceType: z.enum(["webpage", "video", "playlist", "github", "documentation"]),
  title: z.string().trim().min(2).max(200).optional(),
});

export const resourceUploadMetadataSchema = z.object({
  clientRequestId: z.string().uuid(),
  goalId: z.string().uuid(),
  title: z.string().trim().min(2).max(200).optional(),
});

export const diagnosticQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["concept", "explanation", "correction", "transfer", "practice"]),
  prompt: z.string().min(5).max(1_500),
  rubric: z.array(z.string().min(1).max(120)).min(1).max(8),
  concept: z.string().min(1).max(120),
});

export const diagnosticOutputSchema = z.object({
  questions: z.array(diagnosticQuestionSchema).length(5),
  knowledgeNodes: z.array(z.object({
    title: z.string().min(2).max(120),
    description: z.string().min(5).max(500),
    difficulty: z.number().int().min(1).max(5),
    prerequisiteIndexes: z.array(z.number().int().nonnegative()).max(5),
  })).min(3).max(12),
});

export const diagnosticSubmissionSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.string().trim().min(1).max(8_000),
    responseTimeSeconds: z.number().int().min(1).max(14_400).default(60),
    confidence: z.number().int().min(1).max(5).default(3),
  })).length(5),
});

export const sessionAnswerSchema = z.object({
  clientRequestId: z.string().uuid(),
  response: z.string().trim().min(1).max(12_000),
  responseTimeSeconds: z.number().int().min(1).max(14_400).default(60),
  confidence: z.number().int().min(1).max(5).default(3),
  codeAuthorship: codeAuthorshipSchema.optional(),
  artifactUrl: z.string().url().max(2_000).optional(),
});

export const reviewAttemptInputSchema = z.object({
  response: z.string().trim().min(1).max(12_000),
  responseTimeSeconds: z.number().int().min(1).max(14_400).default(60),
  confidence: z.number().int().min(1).max(5).default(3),
  hintCount: z.number().int().min(0).max(50).default(0),
  independenceLevel: z.number().int().min(0).max(4).default(3),
  transferScore: z.number().min(0).max(1).default(0),
  repeatedError: z.boolean().default(false),
  clientRequestId: z.string().uuid(),
});

export const sessionEvaluationSchema = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string().min(2).max(1_200),
  misconception: z.string().max(500).nullable(),
  reteach: z.string().max(1_200).nullable(),
});

export const engineeringOutcomeInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  artifactUrl: z.string().url().max(2_000).nullable(),
  deploymentUrl: z.string().url().max(2_000).nullable(),
  demoNotes: z.string().trim().min(10).max(4_000),
  retrospective: z.string().trim().min(20).max(6_000),
  codeAuthorship: codeAuthorshipSchema,
  status: z.enum(["built", "deployed", "presented", "reviewed"]),
  clientRequestId: z.string().uuid(),
});

export type LearningGoalInput = z.infer<typeof learningGoalInputSchema>;
export type DiagnosticQuestion = z.infer<typeof diagnosticQuestionSchema>;
export type DiagnosticOutput = z.infer<typeof diagnosticOutputSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

const levelMultiplier = { literacy: 0.75, working: 1, proficient: 1.55, expert: 2.35 } as const;

export function estimateLearningTime(input: {
  characters: number;
  targetLevel: keyof typeof levelMultiplier;
  averageDifficulty: number;
  score: number;
  prerequisiteGapCount: number;
  historicalMinutesPerEvidence?: number;
}) {
  const readingMinutes = Math.max(45, input.characters / 700);
  const difficulty = 0.72 + Math.max(1, input.averageDifficulty) * 0.16;
  const gap = 1 + input.prerequisiteGapCount * 0.09;
  const baseline = 1.35 - Math.min(1, Math.max(0, input.score)) * 0.55;
  const history = input.historicalMinutesPerEvidence ? Math.min(1.3, Math.max(0.75, input.historicalMinutesPerEvidence / 35)) : 1;
  const realistic = Math.round(readingMinutes * levelMultiplier[input.targetLevel] * difficulty * gap * baseline * history);
  const confidence = Math.min(0.88, 0.48 + (input.characters > 3_000 ? 0.12 : 0) + (input.score >= 0 ? 0.12 : 0) + (input.historicalMinutesPerEvidence ? 0.12 : 0));
  return {
    optimisticMinutes: Math.max(30, Math.round(realistic * 0.72)),
    realisticMinutes: Math.max(45, realistic),
    conservativeMinutes: Math.max(60, Math.round(realistic * 1.48)),
    confidence,
    prerequisiteMinutes: Math.max(10, Math.round(realistic * Math.min(0.3, input.prerequisiteGapCount * 0.06))),
    theoryMinutes: Math.max(20, Math.round(realistic * 0.24)),
    practiceMinutes: Math.max(20, Math.round(realistic * 0.28)),
    projectMinutes: Math.max(30, Math.round(realistic * 0.34)),
    reviewMinutes: Math.max(15, Math.round(realistic * 0.14)),
  };
}

const weights: Record<EvidenceType, number> = {
  immediate_test: 0.11,
  delayed_test: 0.17,
  active_recall: 0.14,
  explanation: 0.13,
  correction: 0.12,
  transfer: 0.16,
  coding: 0.2,
  project: 0.24,
};

export function calculateMastery(evidence: Array<{ evidenceType: EvidenceType; score: number }>) {
  if (!evidence.length) return { mastery: 0, confidence: 0 };
  let weighted = 0;
  let total = 0;
  const kinds = new Set<EvidenceType>();
  for (const item of evidence) {
    const weight = weights[item.evidenceType];
    weighted += Math.min(1, Math.max(0, item.score)) * weight;
    total += weight;
    kinds.add(item.evidenceType);
  }
  const breadthGate = Math.min(1, kinds.size / 5);
  const mastery = Math.min(0.98, (weighted / total) * (0.62 + breadthGate * 0.38));
  const confidence = Math.min(0.95, 0.18 + evidence.length * 0.07 + kinds.size * 0.08);
  return { mastery, confidence };
}

export function nextReviewInterval(mastery: number, previousDays = 0) {
  if (mastery < 0.45) return 1;
  if (mastery < 0.65) return Math.max(2, previousDays * 2 || 2);
  if (mastery < 0.82) return Math.max(4, previousDays * 2 || 4);
  return Math.min(45, Math.max(7, previousDays * 2 || 7));
}
