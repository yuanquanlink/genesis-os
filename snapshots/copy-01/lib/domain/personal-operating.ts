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
  briefVersion: z.enum(["v1", "v2"]).default("v1"),
  todayDirection: z.string().min(3).max(600).nullable().default(null),
  strategicAlignment: z.string().min(3).max(800).nullable().default(null),
  learningFocus: z.string().min(3).max(800).nullable().default(null),
  priorityActions: z.array(z.string().min(3).max(600)).max(4).default([]),
  risks: z.array(z.string().min(3).max(600)).max(6).default([]),
  cognitivePrompt: z.string().min(3).max(600).nullable().default(null),
  intelligenceAvailable: z.boolean().default(false),
  contextProjectionIds: z.array(z.string().uuid()).max(24).default([]),
});

export const dailyPlanBlockTypeSchema = z.enum([
  "learning",
  "review",
  "project",
  "mission",
  "reflection",
  "research",
  "administrative",
  "buffer",
]);

export const dailyPlanBlockSchema = z.object({
  blockId: z.string().min(1).max(120).optional(),
  blockType: dailyPlanBlockTypeSchema.default("mission"),
  title: z.string().min(4).max(400),
  minutes: z.number().int().min(5).max(360),
  verification: z.string().min(5).max(500),
  reason: z.string().min(3).max(700).default("Preserve a bounded, inspectable daily action."),
  linkedGoalId: z.string().max(180).nullable().default(null),
  linkedStrategyId: z.string().max(180).nullable().default(null),
  linkedMissionId: z.string().max(180).nullable().default(null),
  linkedLearningGoalId: z.string().max(180).nullable().default(null),
  evidenceExpectation: z.string().min(3).max(700).nullable().default(null),
  masteryRelationship: z.string().min(3).max(700).nullable().default(null),
  priority: z.enum(["critical", "high", "normal", "low"]).default("normal"),
  dependencies: z.array(z.string().min(1).max(240)).max(12).default([]),
  sourceContextIds: z.array(z.string().min(1).max(180)).max(24).default([]),
});

export const dailyTimeBudgetSchema = z.object({
  availableMinutes: z.number().int().min(10).max(720),
  plannedMinutes: z.number().int().min(5).max(720),
  bufferMinutes: z.number().int().min(0).max(720),
  targetUtilization: z.number().min(0.5).max(0.95),
  weeklyMaximumMinutes: z.number().int().min(60).max(10_080),
  source: z.enum(["owner_pilot", "owner_configured"]),
});

export const dailyPlanSchema = z.object({
  title: z.string().min(5).max(300),
  actions: z.array(dailyPlanBlockSchema).min(1).max(6),
  totalMinutes: z.number().int().min(10).max(720),
  rationale: z.string().min(8).max(800),
  risk: z.string().min(5).max(500),
  sourceRefs: z.array(z.string().min(2).max(120)).min(1).max(24),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().min(4).max(400)).min(1).max(4),
  planVersion: z.enum(["v1", "v2"]).default("v1"),
  timeBudget: dailyTimeBudgetSchema.nullable().default(null),
});

export const dailyFollowUpCandidateTypeSchema = z.enum([
  "reflection_review",
  "learning_adaptation",
  "decision_review",
  "evidence_preparation",
  "digital_twin_signal",
  "strategy_alignment_observation",
]);

export const dailyFollowUpCandidateSchema = z.object({
  candidateType: dailyFollowUpCandidateTypeSchema,
  summary: z.string().min(3).max(1_500),
  suggestedNextStep: z.string().min(3).max(1_000),
  sourceRefs: z.array(z.string().min(2).max(180)).min(1).max(24),
  confidence: z.number().min(0).max(0.65),
  candidateOnly: z.literal(true),
  limitations: z.array(z.string().min(3).max(600)).min(1).max(6),
});

export const dailyFollowUpBundleSchema = z.object({
  candidates: z.array(dailyFollowUpCandidateSchema).length(6).superRefine((items, context) => {
    const expected = new Set(dailyFollowUpCandidateTypeSchema.options);
    for (const item of items) expected.delete(item.candidateType);
    if (expected.size > 0) context.addIssue({ code: "custom", message: `Missing candidate types: ${[...expected].join(",")}` });
  }),
});

export const personalOperatingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate_brief"), clientRequestId: z.string().uuid() }),
  z.object({ action: z.literal("generate_plan"), energy: z.number().int().min(1).max(5), clientRequestId: z.string().uuid() }),
  z.object({ action: z.literal("approve_plan"), candidateId: z.string().uuid() }),
  z.object({ action: z.literal("reject_plan"), candidateId: z.string().uuid(), reason: z.string().min(2).max(500) }),
  z.object({ action: z.literal("defer_plan"), candidateId: z.string().uuid(), reason: z.string().min(2).max(500), revisitAt: z.string().datetime().nullable().optional(), clientRequestId: z.string().uuid() }),
  z.object({ action: z.literal("request_plan_revision"), candidateId: z.string().uuid(), reason: z.string().min(2).max(500), clientRequestId: z.string().uuid() }),
  z.object({
    action: z.literal("record_block_completion"),
    planId: z.string().uuid(),
    blockId: z.string().min(1).max(120),
    completed: z.boolean(),
    actualMinutes: z.number().int().min(0).max(720).nullable().optional(),
    note: z.string().max(1_000).optional(),
    clientRequestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("submit_reflection"),
    actualHappened: z.string().min(3).max(2_000).optional(),
    completed: z.string().min(5).max(2_000),
    unfinishedReason: z.string().min(3).max(1_000),
    newProblems: z.string().min(3).max(1_000),
    harderThanExpected: z.string().min(3).max(1_000).optional(),
    learned: z.string().min(3).max(1_500).optional(),
    decision: z.string().min(3).max(1_500).optional(),
    tomorrowAdjustment: z.string().min(3).max(1_000),
    actualLearningMinutes: z.number().int().min(0).max(720).optional(),
    clientRequestId: z.string().uuid(),
  }),
]);

export type OperatingBrief = z.infer<typeof operatingBriefSchema>;
export type DailyPlan = z.infer<typeof dailyPlanSchema>;
export type DailyPlanBlock = z.infer<typeof dailyPlanBlockSchema>;
export type DailyFollowUpBundle = z.infer<typeof dailyFollowUpBundleSchema>;
