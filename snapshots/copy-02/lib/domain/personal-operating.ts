import { z } from "zod";

export const operatingBriefSchema = z.object({
  highestPriority: z.string().min(5).max(600),
  activeMission: z.string().min(3).max(600),
  learningGoal: z.string().min(3).max(600),
  riskReminder: z.string().min(5).max(600),
  strategicFocus: z.string().min(5).max(600),
  sourceRefs: z.array(z.string().min(2).max(120)).min(1).max(24),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().min(4).max(400)).min(1).max(4),
});

export const dailyPlanSchema = z.object({
  title: z.string().min(5).max(300),
  actions: z.array(z.object({ title: z.string().min(4).max(400), minutes: z.number().int().min(10).max(360), verification: z.string().min(5).max(500) })).min(1).max(4),
  totalMinutes: z.number().int().min(10).max(720),
  rationale: z.string().min(8).max(800),
  risk: z.string().min(5).max(500),
  sourceRefs: z.array(z.string().min(2).max(120)).min(1).max(24),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().min(4).max(400)).min(1).max(4),
});

export const personalOperatingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate_brief"), clientRequestId: z.string().uuid() }),
  z.object({ action: z.literal("generate_plan"), energy: z.number().int().min(1).max(5), clientRequestId: z.string().uuid() }),
  z.object({ action: z.literal("approve_plan"), candidateId: z.string().uuid() }),
  z.object({ action: z.literal("reject_plan"), candidateId: z.string().uuid(), reason: z.string().min(2).max(500) }),
  z.object({ action: z.literal("submit_reflection"), completed: z.string().min(5).max(2_000), unfinishedReason: z.string().min(3).max(1_000), newProblems: z.string().min(3).max(1_000), tomorrowAdjustment: z.string().min(3).max(1_000), clientRequestId: z.string().uuid() }),
]);

export type OperatingBrief = z.infer<typeof operatingBriefSchema>;
export type DailyPlan = z.infer<typeof dailyPlanSchema>;
