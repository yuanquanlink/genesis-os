import { z } from "zod";

export const contextPurposeSchema = z.enum([
  "mentor",
  "learning",
  "strategy",
  "daily_operation",
  "reflection",
  "research",
]);
export type ContextPurpose = z.infer<typeof contextPurposeSchema>;

export const contextProjectionSourceDomainSchema = z.enum([
  "knowledge",
  "memory",
  "goal",
  "strategy",
  "mission",
  "evidence",
  "mastery",
  "daily_plan",
]);
export type ContextProjectionSourceDomain = z.infer<typeof contextProjectionSourceDomainSchema>;

export const contextTrustClassSchema = z.enum([
  "verified_personal_truth",
  "approved_personal_state",
  "approved_reference",
  "verified_evidence",
  "system_derived_deterministic",
]);
export type ContextTrustClass = z.infer<typeof contextTrustClassSchema>;

export const contextFreshnessStateSchema = z.enum([
  "fresh",
  "stale",
  "revoked",
  "superseded",
  "expired",
]);
export type ContextFreshnessState = z.infer<typeof contextFreshnessStateSchema>;

export const contextProjectionPreviewInputSchema = z.object({
  sourceDomain: contextProjectionSourceDomainSchema,
  sourceRecordId: z.string().trim().min(1).max(180),
  purpose: contextPurposeSchema,
  expiresAt: z.string().datetime().nullable().optional(),
});

export const contextProjectionPreviewSchema = z.object({
  sourceDomain: contextProjectionSourceDomainSchema,
  sourceRecordId: z.string(),
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  sourceType: z.string(),
  sourceTruthStatus: z.enum(["approved", "active", "completed", "verified", "mastered"]),
  purpose: contextPurposeSchema,
  trustClass: contextTrustClassSchema,
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  eligible: z.literal(true),
  reasons: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  provenanceRefs: z.array(z.string()),
  limitations: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
});
export type ContextProjectionPreview = z.infer<typeof contextProjectionPreviewSchema>;

export const contextProjectionAuthorizationInputSchema = z.object({
  sourceDomain: contextProjectionSourceDomainSchema,
  sourceRecordId: z.string().trim().min(1).max(180),
  purpose: contextPurposeSchema,
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime().nullable().optional(),
  actor: z.string().trim().min(1).max(120),
  clientRequestId: z.string().uuid(),
});

export const contextProjectionConfirmationInputSchema = z.object({
  authorizationId: z.string().uuid(),
  actor: z.string().trim().min(1).max(120),
  clientRequestId: z.string().uuid(),
});

export const contextProjectionRevocationInputSchema = z.object({
  projectionId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  actor: z.string().trim().min(1).max(120),
  clientRequestId: z.string().uuid(),
});

export const approvedContextControlActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preview"),
    sourceDomain: contextProjectionSourceDomainSchema,
    sourceRecordId: z.string().trim().min(1).max(180),
  }),
  z.object({
    action: z.literal("authorize"),
    sourceDomain: contextProjectionSourceDomainSchema,
    sourceRecordId: z.string().trim().min(1).max(180),
    sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    clientRequestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("confirm"),
    authorizationId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("revoke"),
    projectionId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
    clientRequestId: z.string().uuid(),
  }),
]);

export const approvedContextProjectionSchema = z.object({
  projectionId: z.string().uuid(),
  ownerId: z.string(),
  sourceDomain: contextProjectionSourceDomainSchema,
  sourceRecordId: z.string(),
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  sourceType: z.string(),
  sourceTruthStatus: z.enum(["approved", "active", "completed", "verified", "mastered"]),
  projectionReceiptId: z.string().uuid(),
  projectionVersion: z.number().int().positive(),
  purpose: contextPurposeSchema,
  trustClass: contextTrustClassSchema,
  evidenceRefs: z.array(z.string()).max(24),
  provenanceRefs: z.array(z.string()).max(24),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime(),
  projectedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  supersededBy: z.string().uuid().nullable(),
  freshness: contextFreshnessStateSchema,
  limitations: z.array(z.string()).max(16),
  contextSchemaVersion: z.string(),
  contextPayload: z.record(z.string(), z.unknown()),
});
export type ApprovedContextProjection = z.infer<typeof approvedContextProjectionSchema>;

export const contextEligibilityDecisionSchema = z.object({
  projectionId: z.string().uuid(),
  eligible: z.boolean(),
  reasons: z.array(z.string()),
  sourceVersion: z.string(),
  receiptId: z.string().nullable(),
  trustClass: contextTrustClassSchema,
  purpose: contextPurposeSchema,
  freshness: contextFreshnessStateSchema,
});
export type ContextEligibilityDecision = z.infer<typeof contextEligibilityDecisionSchema>;

export const APPROVED_CONTEXT_SCHEMA_VERSION = "approved-context-v1";
export const APPROVED_CONTEXT_POLICY_VERSION = "approved-context-policy-v1";
export const APPROVED_CONTEXT_NO_CANDIDATES = "Candidate, acknowledgement, authorization, or preview alone never makes data Context-eligible.";
