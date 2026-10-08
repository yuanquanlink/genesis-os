import { z } from "zod";

export const reviewCandidateTypeSchema = z.enum([
  "knowledge_object",
  "knowledge_analysis",
  "learning_material",
  "personal_learning",
  "personal_ability",
  "digital_twin",
  "decision_intelligence",
  "reflection_mentor",
  "mission_life_strategy",
  "strategy_mission_alignment",
]);
export type ReviewCandidateType = z.infer<typeof reviewCandidateTypeSchema>;

export const reviewDomainSchema = z.enum([
  "knowledge",
  "learning",
  "evidence",
  "ability",
  "profile",
  "decision",
  "reflection",
  "strategy",
  "mission",
]);
export type ReviewDomain = z.infer<typeof reviewDomainSchema>;

export const reviewTargetSchema = z.enum([
  "knowledge_approval",
  "learning_goal_activation",
  "learning_path_activation",
  "evidence_candidate_handoff",
  "profile_proposal",
  "memory_candidate",
  "user_review_record",
  "strategy_candidate_handoff",
  "mission_candidate_handoff",
]);
export type ReviewTarget = z.infer<typeof reviewTargetSchema>;

export const reviewStateSchema = z.enum([
  "pending_review",
  "acknowledged",
  "deferred",
  "rejected",
  "revision_requested",
  "projection_prepared",
  "projection_failed",
  "projected",
  "revoked",
  "superseded",
]);

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const reviewEnvelopeSchema = z.object({
  reviewId: boundedText(180),
  candidateType: reviewCandidateTypeSchema,
  domain: reviewDomainSchema,
  userId: boundedText(120),
  sourceCandidateId: boundedText(120),
  sourceCandidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  status: z.literal("pending"),
  trustClass: z.literal("untrusted"),
  observations: z.array(boundedText(900)).max(8),
  inferences: z.array(boundedText(900)).max(8),
  sourceIds: z.array(boundedText(180)).max(64),
  confidence: z.number().min(0).max(1),
  limitations: z.array(boundedText(900)).max(16),
  allowedTargets: z.array(reviewTargetSchema).max(4),
  reviewState: reviewStateSchema,
  contextEligible: z.literal(false),
  metadata: z.record(z.string(), z.unknown()),
});
export type ReviewEnvelope = z.infer<typeof reviewEnvelopeSchema>;

export const reviewListOptionsSchema = z.object({
  domain: reviewDomainSchema.optional(),
  candidateType: reviewCandidateTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(220).optional(),
});
export type ReviewListOptions = z.infer<typeof reviewListOptionsSchema>;

export const reviewListResultSchema = z.object({
  items: z.array(reviewEnvelopeSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});
export type ReviewListResult = z.infer<typeof reviewListResultSchema>;

export const REVIEW_NO_FORMAL_WRITE_LIMITATION =
  "Read-only review envelope; no approval, projection, ContextEngine, Profile, Memory, Evidence, Ability, Growth, Mastery, Goal, Strategy, or Mission write is performed.";

export const reviewActionSchema = z.enum([
  "acknowledge",
  "defer",
  "reopen",
  "reject",
  "request_revision",
  "authorize_projection",
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export const reviewEventInputSchema = z.object({
  reviewId: boundedText(180),
  action: reviewActionSchema,
  sourceCandidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  clientRequestId: z.string().uuid(),
  reason: z.string().trim().max(900).optional(),
  revisitAt: z.string().datetime().optional(),
  targetType: reviewTargetSchema.optional(),
  targetId: boundedText(120).optional(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).superRefine((input, ctx) => {
  if ((input.action === "reject" || input.action === "request_revision") && !input.reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "reason_required" });
  }
  if (input.action === "defer" && !input.revisitAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["revisitAt"], message: "revisit_at_required" });
  }
  if (input.action === "authorize_projection" && (!input.targetType || !input.previewHash)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetType"], message: "projection_preview_required" });
  }
  if (input.action === "authorize_projection" && input.targetType === "learning_path_activation" && !input.targetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetId"], message: "learning_path_goal_required" });
  }
});
export type ReviewEventInput = z.infer<typeof reviewEventInputSchema>;

export const reviewEventSchema = z.object({
  id: boundedText(120),
  reviewId: boundedText(180),
  userId: boundedText(120),
  action: reviewActionSchema,
  sourceCandidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetType: reviewTargetSchema.nullable(),
  targetId: boundedText(120).nullable(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  reason: z.string().nullable(),
  revisitAt: z.string().datetime().nullable(),
  clientRequestId: z.string().uuid(),
  createdAt: z.string().datetime(),
  duplicate: z.boolean().default(false),
});
export type ReviewEvent = z.infer<typeof reviewEventSchema>;
