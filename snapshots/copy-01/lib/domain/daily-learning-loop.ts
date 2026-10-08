import { z } from "zod";

const sourceRefSchema = z.string().trim().min(2).max(140);

export const eveningReflectionInputSchema = z.object({
  action: z.literal("submit_evening"),
  goalId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  actualMinutes: z.number().int().min(0).max(720),
  completed: z.string().trim().min(5).max(3_000),
  stuck: z.string().trim().max(2_000).default(""),
  biggestGain: z.string().trim().min(3).max(2_000),
  unfinished: z.string().trim().max(2_000).default(""),
  unfinishedReason: z.string().trim().max(2_000).default(""),
  tomorrowAvailableMinutes: z.number().int().min(10).max(720),
  strategyAlignment: z.enum(["aligned", "partial", "off_track"]).default("partial"),
  strategyAdjustment: z.string().trim().max(1_000).default(""),
});

export const dailyLearningLoopActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh_morning"), goalId: z.string().uuid() }),
  eveningReflectionInputSchema,
]);

export const morningBriefSchema = z.object({
  currentGoal: z.string().trim().min(2).max(300),
  currentPhase: z.string().trim().min(2).max(200),
  primaryTask: z.string().trim().min(5).max(800),
  whyToday: z.string().trim().min(5).max(1_000),
  previousGap: z.string().trim().min(2).max(800),
  reviewTasks: z.array(z.string().trim().min(2).max(400)).max(3),
  engineeringTask: z.string().trim().min(2).max(800),
  weakestConcept: z.string().trim().min(2).max(300),
  challengeGap: z.string().trim().min(2).max(800),
  estimateChange: z.string().trim().min(2).max(500),
  largestRisk: z.string().trim().min(2).max(800),
  estimatedMinutes: z.number().int().min(0).max(720),
  sourceRefs: z.array(sourceRefSchema).max(30),
  confidence: z.number().min(0).max(1),
});

export const dailyLearningReportSchema = z.object({
  facts: z.array(z.object({
    statement: z.string().trim().min(3).max(600),
    sourceRef: sourceRefSchema,
  })).min(1).max(12),
  learningQuality: z.string().trim().min(5).max(1_000),
  newEvidence: z.array(z.object({
    evidenceId: z.string().trim().min(2).max(140),
    summary: z.string().trim().min(3).max(600),
  })).max(12),
  abilityChangeCandidates: z.array(z.object({
    candidateId: z.string().trim().min(2).max(140),
    ability: z.string().trim().min(2).max(160),
    reason: z.string().trim().min(3).max(600),
  })).max(10),
  largestProblem: z.string().trim().min(5).max(1_000),
  alternativeExplanation: z.string().trim().min(5).max(1_000),
  fdeRelationship: z.string().trim().min(5).max(1_000),
  keepDoing: z.string().trim().min(3).max(600),
  stopDoing: z.string().trim().min(3).max(600),
  tomorrowFocus: z.string().trim().min(5).max(600),
  tomorrowActions: z.array(z.string().trim().min(5).max(600)).length(3),
  thinkingQuestion: z.string().trim().min(5).max(600),
  sourceRefs: z.array(sourceRefSchema).min(1).max(40),
  confidence: z.number().min(0).max(1),
});

export type EveningReflectionInput = z.infer<typeof eveningReflectionInputSchema>;
export type MorningBrief = z.infer<typeof morningBriefSchema>;
export type DailyLearningReport = z.infer<typeof dailyLearningReportSchema>;

export type DailyBriefRecord = MorningBrief & {
  id: string; goalId: string; briefDate: string; provider: string; model: string;
  modelMode: "demo" | "real"; promptVersion: string; createdAt: string; updatedAt: string;
};
export type EveningReflectionRecord = {
  id: string; goalId: string; reflectionDate: string; clientRequestId: string;
  actualMinutes: number; completedText: string; stuckText: string; biggestGain: string;
  unfinishedText: string; unfinishedReason: string; tomorrowAvailableMinutes: number;
  strategyAlignment: "aligned" | "partial" | "off_track" | "not_assessed";
  strategyAdjustment: string; strategyId: string | null;
  sourceRefs: string[]; timelineEntryId: string | null; createdAt: string; updatedAt: string;
};
export type DailyLearningReportRecord = DailyLearningReport & {
  id: string; goalId: string; reflectionId: string; reportDate: string;
  provider: string; model: string; modelMode: "demo" | "real"; promptVersion: string;
  createdAt: string; updatedAt: string;
};
export type DailyNextPlanRecord = {
  id: string; goalId: string; reportId: string; planDate: string; primaryFocus: string;
  availableMinutes: number; actions: string[]; reviewTaskIds: string[]; challengeIds: string[];
  completionRate: number; rationale: string; sourceRefs: string[]; confidence: number;
  createdAt: string; updatedAt: string;
};
export type DailyLearningLoopSnapshot = {
  briefs: DailyBriefRecord[];
  reflections: EveningReflectionRecord[];
  reports: DailyLearningReportRecord[];
  plans: DailyNextPlanRecord[];
};
