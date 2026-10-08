import { z } from "zod";

export const projectionTargetSchema = z.enum(["knowledge_approval", "learning_goal_activation", "learning_path_activation", "evidence_candidate_handoff", "profile_proposal", "memory_candidate", "user_review_record"]);
export type ProjectionTarget = z.infer<typeof projectionTargetSchema>;

export const projectionPreviewInputSchema = z.object({
  reviewId: z.string().trim().min(3).max(180),
  targetType: projectionTargetSchema,
  targetId: z.string().trim().min(1).max(120).optional(),
});

export const projectionPreviewSchema = z.object({
  reviewId: z.string(),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetType: projectionTargetSchema,
  targetId: z.string().nullable(),
  targetVersion: z.string(),
  effects: z.array(z.object({ field: z.string(), before: z.unknown(), after: z.unknown() })).max(16),
  nonEffects: z.array(z.string()).max(16),
  effectHash: z.string().regex(/^[a-f0-9]{64}$/),
  reversible: z.boolean(),
  limitations: z.array(z.string()).max(16),
});
export type ProjectionPreview = z.infer<typeof projectionPreviewSchema>;

export const projectionConfirmationSchema = z.object({
  reviewId: z.string().trim().min(3).max(180),
  targetType: projectionTargetSchema,
  targetId: z.string().trim().min(1).max(120).optional(),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  effectHash: z.string().regex(/^[a-f0-9]{64}$/),
  clientRequestId: z.string().uuid(),
});

export const projectionReceiptSchema = z.object({
  id: z.string(),
  reviewId: z.string(),
  eventId: z.string(),
  targetType: projectionTargetSchema,
  targetId: z.string(),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  effectHash: z.string().regex(/^[a-f0-9]{64}$/),
  result: z.enum(["committed", "failed", "revoked", "superseded"]),
  createdAt: z.string().datetime(),
});
export type ProjectionReceipt = z.infer<typeof projectionReceiptSchema>;

export const PROJECTION_NO_AUTOMATIC_MUTATION = "Projection requires a fresh deterministic preview and explicit owner confirmation; no AI or Candidate state can authorize it.";
