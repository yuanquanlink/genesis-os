import { z } from "zod";

export const betaValidationCaptureSchema = z.object({
  action: z.literal("capture"),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type BetaValidationCapture = z.infer<typeof betaValidationCaptureSchema>;

const clientRequestId = z.string().uuid();
const validationDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const realValidationFeedbackSchema = z.object({
  contextCorrectness: z.number().int().min(1).max(5),
  morningBriefUsefulness: z.number().int().min(1).max(5),
  dailyPlanRealism: z.number().int().min(1).max(5),
  learningTaskSpecificity: z.number().int().min(1).max(5),
  strategicAlignment: z.number().int().min(1).max(5),
  reflectionDepth: z.number().int().min(1).max(5),
  friction: z.number().int().min(1).max(5),
  trust: z.number().int().min(1).max(5),
  mostValuable: z.string().trim().max(1_000).optional().default(""),
  worstPart: z.string().trim().max(1_000).optional().default(""),
  tomorrowImprovement: z.string().trim().max(1_000).optional().default(""),
  ownerNotes: z.string().trim().max(2_000).optional().default(""),
});

export const validationDefectSchema = z.object({
  severity: z.enum(["P0", "P1", "P2", "P3", "P4"]),
  category: z.enum(["truth_boundary", "data_loss", "daily_loop", "experience", "usability", "polish"]).optional().default("usability"),
  summary: z.string().trim().min(3).max(500),
});

export const realUseCapabilityFacetSchema = z.enum([
  "approved_context_inspection",
  "morning_brief",
  "daily_plan",
  "evening_reflection",
  "daily_close",
]);

export const betaValidationActionSchema = z.discriminatedUnion("action", [
  betaValidationCaptureSchema,
  z.object({ action: z.literal("start_day1"), logDate: validationDate, clientRequestId }),
  z.object({ action: z.literal("refresh_day1"), logDate: validationDate, clientRequestId }),
  z.object({ action: z.literal("record_view"), logDate: validationDate, surface: z.enum(["approved_context", "morning_brief", "daily_close"]), clientRequestId }),
  z.object({
    action: z.literal("record_task_state"), logDate: validationDate,
    state: z.enum(["started", "completed", "partially_completed", "blocked", "deferred"]),
    taskRef: z.string().trim().min(2).max(300).optional(),
    taskType: z.enum(["learning", "review", "project", "mission", "reflection", "research", "administrative", "buffer", "other"]).optional(),
    actualTimeMinutes: z.number().int().min(0).max(720).nullable().optional(),
    artifactRefs: z.array(z.string().trim().min(2).max(500)).max(12).default([]),
    evidenceExpectationRefs: z.array(z.string().trim().min(2).max(500)).max(12).default([]),
    blockerRefs: z.array(z.string().trim().min(2).max(300)).max(12).default([]),
    clientRequestId,
  }),
  z.object({
    action: z.literal("submit_owner_feedback"), logDate: validationDate,
    feedback: realValidationFeedbackSchema,
    defects: z.array(validationDefectSchema).max(30).default([]),
    blockerRefs: z.array(z.string().trim().min(2).max(300)).max(12).default([]),
    clientRequestId,
  }),
  z.object({
    action: z.literal("confirm_real_use"), logDate: validationDate,
    confirmRealUse: z.literal(true),
    capabilities: z.array(realUseCapabilityFacetSchema).min(1).max(5),
    clientRequestId,
  }),
]);

export type BetaValidationAction = z.infer<typeof betaValidationActionSchema>;
