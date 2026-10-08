import { z } from "zod";

export const truthClassSchema = z.enum([
  "reference",
  "user_record",
  "confirmed_personal_fact",
  "demonstrated_capability",
]);

export const truthLifecycleSchema = z.enum([
  "reference_only",
  "recorded",
  "approved",
  "verified",
  "mastered",
  "archived",
]);

export const truthContextEligibilitySchema = z.enum([
  "reference_context",
  "untrusted_context",
  "formal_context",
  "excluded",
]);

export const truthApprovalStateSchema = z.enum([
  "not_applicable",
  "required",
  "satisfied",
  "rejected",
]);

export const truthSourceTypeSchema = z.enum([
  "research_source",
  "knowledge_item",
  "memory_candidate",
  "approved_memory",
  "evidence",
  "growth_node",
  "mastery_decision",
]);

export const truthProvenanceSchema = z.object({
  sourceId: z.string().trim().min(1).max(300),
  sourceType: truthSourceTypeSchema,
  origin: z.string().trim().max(2_048).nullable(),
  provider: z.string().trim().max(100).nullable(),
  capturedAt: z.string().datetime(),
  contentHash: z.string().trim().max(256).nullable(),
  validationStatus: z.enum(["untrusted", "user_owned", "approved", "verified"]),
});

export const truthReadItemSchema = z.object({
  recordId: z.string().trim().min(1).max(300),
  userId: z.string().trim().min(1).max(300),
  truthClass: truthClassSchema,
  lifecycleState: truthLifecycleSchema,
  approvalState: truthApprovalStateSchema,
  contextEligibility: truthContextEligibilitySchema,
  content: z.string().max(20_000),
  sourceIds: z.array(z.string().trim().min(1).max(300)).min(1).max(100),
  provenance: truthProvenanceSchema,
  confidence: z.number().min(0).max(1).nullable(),
  rankingScore: z.number().min(0).max(1).nullable(),
  occurredAt: z.string().datetime(),
  limitations: z.array(z.string().trim().min(1).max(500)).max(10),
}).superRefine((item, context) => {
  if (item.truthClass === "reference" && (
    item.lifecycleState !== "reference_only" ||
    item.approvalState !== "not_applicable" ||
    item.contextEligibility !== "reference_context"
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Reference data must remain reference-only context." });
  }

  if (item.truthClass === "user_record" && (
    item.lifecycleState !== "recorded" ||
    item.approvalState !== "not_applicable" ||
    item.contextEligibility !== "untrusted_context"
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "User records must remain labeled untrusted context." });
  }

  if (item.truthClass === "confirmed_personal_fact" && (
    item.lifecycleState !== "approved" ||
    item.approvalState !== "satisfied" ||
    item.contextEligibility !== "formal_context" ||
    item.provenance.validationStatus !== "approved"
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Confirmed personal facts require approved provenance." });
  }

  if (item.truthClass === "demonstrated_capability" && (
    !["verified", "mastered"].includes(item.lifecycleState) ||
    item.approvalState !== "satisfied" ||
    item.contextEligibility !== "formal_context" ||
    item.provenance.validationStatus !== "verified"
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Demonstrated capabilities require verified Evidence or Mastery provenance." });
  }
});

export const truthCandidateReadItemSchema = z.object({
  candidateId: z.string().trim().min(1).max(300),
  userId: z.string().trim().min(1).max(300),
  entityType: z.literal("memory"),
  status: z.enum(["pending", "approved", "rejected"]),
  approvalState: truthApprovalStateSchema,
  contextEligibility: z.literal("excluded"),
  content: z.string().max(20_000).nullable(),
  sourceIds: z.array(z.string().trim().min(1).max(300)).max(100),
  confidence: z.number().min(0).max(1).nullable(),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  valid: z.boolean(),
  validationIssues: z.array(z.string().trim().min(1).max(500)).max(20),
});

export const personalKnowledgeTruthReadModelSchema = z.object({
  references: z.array(truthReadItemSchema),
  userRecords: z.array(truthReadItemSchema),
  candidates: z.array(truthCandidateReadItemSchema),
  confirmedPersonalFacts: z.array(truthReadItemSchema),
  demonstratedCapabilities: z.array(truthReadItemSchema),
  contextIndex: z.object({
    referenceRecordIds: z.array(z.string()),
    untrustedRecordIds: z.array(z.string()),
    formalRecordIds: z.array(z.string()),
    excludedCandidateIds: z.array(z.string()),
  }),
  meta: z.object({
    generatedAt: z.string().datetime(),
    contractVersion: z.literal("genesis-truth-v1"),
    readOnly: z.literal(true),
  }),
});

export type TruthReadItem = z.infer<typeof truthReadItemSchema>;
export type TruthCandidateReadItem = z.infer<typeof truthCandidateReadItemSchema>;
export type PersonalKnowledgeTruthReadModel = z.infer<typeof personalKnowledgeTruthReadModelSchema>;
