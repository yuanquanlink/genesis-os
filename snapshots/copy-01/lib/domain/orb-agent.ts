import { z } from "zod";

export const agentToolNameSchema = z.enum([
  "get_today_status",
  "get_daily_plan",
  "create_task_candidate",
  "review_candidate",
  "summarize_context",
  "generate_learning_plan",
]);

export const agentPermissionScopeSchema = z.enum([
  "approved_context:read",
  "daily_operation:read",
  "agent_candidate:create",
  "candidate:review_preview",
  "learning_candidate:create",
]);

export const agentIntentSchema = z.enum([
  "read_today_status",
  "read_growth_status",
  "summarize_approved_context",
  "create_daily_plan_candidate",
  "create_learning_plan_candidate",
  "review_existing_candidate",
  "unknown_safe_readonly",
]);

export const agentTargetModuleSchema = z.enum([
  "today",
  "daily_plan",
  "mission",
  "growth",
  "knowledge",
  "memory",
  "learning",
  "review",
  "context",
  "strategy",
  "none",
]);

export const agentRiskLevelSchema = z.enum(["low", "medium", "high"]);
export const agentCandidateStatusSchema = z.enum(["pending", "owner_confirmed", "projected", "executed", "rejected"]);

export const agentActionPlanStepSchema = z.object({
  order: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  toolName: agentToolNameSchema,
  requiresOwnerConfirmation: z.boolean(),
});

export const agentActionCandidateSchema = z.object({
  id: z.string().uuid(),
  commandText: z.string().trim().min(2).max(2_000),
  intent: agentIntentSchema,
  targetModule: agentTargetModuleSchema,
  expectedChange: z.string().trim().min(2).max(1_200),
  riskLevel: agentRiskLevelSchema,
  requiredPermission: agentPermissionScopeSchema,
  toolName: agentToolNameSchema,
  plan: z.array(agentActionPlanStepSchema).min(1).max(8),
  status: agentCandidateStatusSchema,
  contextEligible: z.literal(false),
  formalMutationAllowed: z.literal(false),
  ownerAuthorizationId: z.string().nullable(),
  projectionReceiptId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const agentToolAuditSchema = z.object({
  id: z.string().uuid(),
  toolName: agentToolNameSchema,
  permissionScope: agentPermissionScopeSchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  status: z.enum(["success", "failed"]),
  errorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const getTodayStatusInputSchema = z.object({
  currentPath: z.string().trim().max(180).default("/"),
});

export const getTodayStatusOutputSchema = z.object({
  date: z.string(),
  activeMission: z.object({ id: z.string(), title: z.string(), priority: z.string() }).nullable(),
  approvedPlan: z.object({ id: z.string(), title: z.string(), completedBlocks: z.number(), totalBlocks: z.number() }).nullable(),
  missingInputs: z.array(z.string()),
  sourceRefs: z.array(z.string()),
  boundary: z.literal("approved_daily_operation_readonly"),
});

export const getDailyPlanInputSchema = z.object({
  date: z.string().optional(),
});

export const getDailyPlanOutputSchema = z.object({
  exists: z.boolean(),
  planId: z.string().nullable(),
  title: z.string().nullable(),
  blocks: z.array(z.object({
    blockId: z.string(),
    title: z.string(),
    estimatedMinutes: z.number(),
    completionStatus: z.string(),
  })),
  boundary: z.literal("approved_daily_plan_readonly"),
});

export const createTaskCandidateInputSchema = z.object({
  commandText: z.string().trim().min(2).max(2_000),
  targetModule: agentTargetModuleSchema,
  expectedChange: z.string().trim().min(2).max(1_200),
  riskLevel: agentRiskLevelSchema,
  requiredPermission: agentPermissionScopeSchema,
  plan: z.array(agentActionPlanStepSchema).min(1).max(8),
  clientRequestId: z.string().uuid().optional(),
});

export const createTaskCandidateOutputSchema = z.object({
  candidate: agentActionCandidateSchema,
  boundary: z.literal("candidate_created_no_formal_mutation"),
});

export const reviewCandidateInputSchema = z.object({
  candidateId: z.string().uuid().optional(),
  status: z.enum(["pending", "owner_confirmed", "projected", "executed", "rejected"]).optional(),
});

export const reviewCandidateOutputSchema = z.object({
  candidates: z.array(agentActionCandidateSchema),
  boundary: z.literal("review_preview_only"),
});

export const summarizeContextInputSchema = z.object({
  currentPath: z.string().trim().max(180).default("/"),
});

export const summarizeContextOutputSchema = z.object({
  approvedProjectionCount: z.number().int().nonnegative(),
  sourceRefs: z.array(z.string()),
  summary: z.string(),
  boundary: z.literal("approved_context_summary_readonly"),
});

export const generateLearningPlanInputSchema = z.object({
  commandText: z.string().trim().min(2).max(2_000),
  availableMinutes: z.number().int().positive().max(720).optional(),
  topic: z.string().trim().min(1).max(200).optional(),
  clientRequestId: z.string().uuid().optional(),
});

export const generateLearningPlanOutputSchema = z.object({
  candidate: agentActionCandidateSchema,
  stages: z.array(z.object({
    title: z.string(),
    durationMinutes: z.number().int().positive(),
    ownerConfirmationRequired: z.literal(true),
  })),
  boundary: z.literal("learning_plan_candidate_only"),
});

export const orbAgentResultSchema = z.object({
  mode: z.literal("controlled_agent"),
  command: z.string().trim().min(2).max(2_000),
  intent: z.object({
    id: agentIntentSchema,
    label: z.string(),
    confidence: z.number().min(0).max(1),
    targetModule: agentTargetModuleSchema,
  }),
  plan: z.array(agentActionPlanStepSchema).min(1).max(8),
  tools: z.array(agentToolAuditSchema).max(12),
  actionCandidate: agentActionCandidateSchema.nullable(),
  execution: z.object({
    status: z.enum(["read_only_completed", "candidate_created", "needs_owner_confirmation", "unsupported_safe_fallback"]),
    message: z.string(),
    ownerConfirmationRequired: z.boolean(),
    projectionRequired: z.boolean(),
  }),
  boundaries: z.array(z.string()),
});

export type AgentToolName = z.infer<typeof agentToolNameSchema>;
export type AgentPermissionScope = z.infer<typeof agentPermissionScopeSchema>;
export type AgentActionCandidate = z.infer<typeof agentActionCandidateSchema>;
export type AgentToolAudit = z.infer<typeof agentToolAuditSchema>;
export type OrbAgentResult = z.infer<typeof orbAgentResultSchema>;
