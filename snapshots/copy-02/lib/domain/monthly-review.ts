import { z } from "zod";

const cited = z.object({ evidenceIds: z.array(z.string().min(1).max(100)).min(1).max(12) });
const abilityDeltaSchema = cited.extend({ ability: z.string().min(1).max(120), beforeLevel: z.number().int().min(0).max(5), currentLevel: z.number().int().min(0).max(5), explanation: z.string().min(1).max(700) });
const projectProgressSchema = cited.extend({ project: z.string().min(1).max(160), status: z.string().min(1).max(100), progress: z.string().min(1).max(700), nextVerification: z.string().min(1).max(400) });
const recommendationSchema = cited.extend({ action: z.string().min(1).max(400), whyNow: z.string().min(1).max(700), successMetric: z.string().min(1).max(400), risk: z.string().min(1).max(400) });

export const monthlyReviewSchema = z.object({
  monthlyGoal: cited.extend({ goal: z.string().min(1).max(500), source: z.string().min(1).max(300) }),
  completionSummary: cited.extend({ summary: z.string().min(1).max(900), completedItems: z.number().int().nonnegative(), incompleteReason: z.string().min(1).max(500) }),
  abilityDelta: z.array(abilityDeltaSchema).min(1).max(8),
  projectProgress: z.array(projectProgressSchema).min(1).max(8),
  learningInvestment: cited.extend({ summary: z.string().min(1).max(900), missionCompletionRate: z.number().min(0).max(1), missionCount: z.number().int().nonnegative(), sessionCount: z.number().int().nonnegative() }),
  strategyExecution: cited.extend({ summary: z.string().min(1).max(900), executionRate: z.number().min(0).max(1) }),
  largestProblem: cited.extend({ problem: z.string().min(1).max(500), reasoning: z.string().min(1).max(800) }),
  growthRisks: z.array(cited.extend({ risk: z.string().min(1).max(500), mitigation: z.string().min(1).max(500) })).min(1).max(6),
  nextMonthRecommendations: z.array(recommendationSchema).min(1).max(5),
  limitations: z.array(z.string().min(1).max(400)).min(1).max(6),
  confidence: z.number().min(0).max(1),
});

export const monthlyReviewActionSchema = z.object({ action: z.literal("generate"), clientRequestId: z.string().uuid() });
export type MonthlyReview = z.infer<typeof monthlyReviewSchema>;
