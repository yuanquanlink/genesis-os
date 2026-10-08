import { z } from "zod";

export const knowledgeObjectTypeSchema = z.enum([
  "source",
  "artifact",
  "unit",
  "relation",
  "collection",
  "collection_member",
]);

export const knowledgeCreatorSchema = z.enum(["user", "ai", "system"]);
export const knowledgeApprovalStatusSchema = z.enum(["not_required", "pending", "approved", "rejected"]);
export const knowledgeValidationStatusSchema = z.enum(["unvalidated", "valid", "partial", "invalid", "needs_review"]);

export const knowledgeSourceTypeSchema = z.enum([
  "uploaded_file",
  "book",
  "pdf",
  "course",
  "video",
  "url",
  "github_repository",
  "paper",
  "user_note",
]);

export const knowledgeOwnershipSchema = z.enum([
  "user_owned",
  "licensed",
  "public_reference",
  "unknown",
]);

export const knowledgeArtifactTypeSchema = z.enum([
  "parsed_content_reference",
  "raw_file_reference",
  "metadata",
  "manifest",
]);

export const knowledgeExtractionStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "partial",
  "failed",
  "not_required",
]);

export const knowledgeUnitTypeSchema = z.enum(["section", "concept", "claim", "note", "code_region"]);
export const knowledgeRelationTypeSchema = z.enum(["supports", "contradicts", "cites", "supersedes", "derived_from"]);
export const knowledgeCollectionTypeSchema = z.enum(["learning_goal", "book", "course", "project", "business_case"]);

const baseCreationSchema = z.object({
  clientRequestId: z.string().uuid(),
  createdBy: knowledgeCreatorSchema.default("user"),
  validationStatus: knowledgeValidationStatusSchema.default("unvalidated"),
});

export const createKnowledgeSourceSchema = baseCreationSchema.extend({
  title: z.string().trim().min(1).max(500),
  sourceType: knowledgeSourceTypeSchema,
  ownership: knowledgeOwnershipSchema,
  originalLocator: z.string().trim().max(2_048).nullable().default(null),
  legacyKnowledgeItemId: z.string().uuid().nullable().default(null),
  researchSourceId: z.string().uuid().nullable().default(null),
  provenance: z.object({
    sourceIds: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
    capturedAt: z.string().datetime(),
    notes: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  }),
}).superRefine((input, context) => {
  if (["url", "github_repository", "video"].includes(input.sourceType) && !input.originalLocator) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["originalLocator"], message: "This source type requires an original locator." });
  }
  if (input.sourceType === "user_note" && input.ownership !== "user_owned") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ownership"], message: "User notes must remain user-owned." });
  }
});

export const createKnowledgeArtifactSchema = baseCreationSchema.extend({
  sourceId: z.string().uuid(),
  artifactType: knowledgeArtifactTypeSchema,
  contentReference: z.string().trim().max(4_096).nullable().default(null),
  extractionStatus: knowledgeExtractionStatusSchema,
  parser: z.object({
    name: z.string().trim().min(1).max(120).nullable().default(null),
    version: z.string().trim().min(1).max(120).nullable().default(null),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  contentHash: z.string().trim().max(256).nullable().default(null),
  extractedAt: z.string().datetime().nullable().default(null),
}).superRefine((input, context) => {
  if (["completed", "partial"].includes(input.extractionStatus) && !input.contentReference) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["contentReference"], message: "Completed or partial extraction requires a content reference." });
  }
  if (input.extractionStatus === "completed" && (!input.parser.name || !input.parser.version)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["parser"], message: "Completed extraction requires parser name and version." });
  }
});

export const createKnowledgeUnitSchema = baseCreationSchema.extend({
  sourceId: z.string().uuid(),
  artifactId: z.string().uuid().nullable().default(null),
  parentUnitId: z.string().uuid().nullable().default(null),
  unitType: knowledgeUnitTypeSchema,
  title: z.string().trim().max(500).nullable().default(null),
  content: z.string().trim().min(1).max(20_000),
  originalLocator: z.string().trim().max(2_048).nullable().default(null),
  ordinal: z.number().int().nonnegative().max(1_000_000).default(0),
});

export const createKnowledgeRelationSchema = baseCreationSchema.extend({
  fromUnitId: z.string().uuid(),
  toUnitId: z.string().uuid(),
  relationType: knowledgeRelationTypeSchema,
  rationale: z.string().trim().max(2_000).nullable().default(null),
  sourceIds: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
}).refine((input) => input.fromUnitId !== input.toUnitId, {
  message: "A Knowledge Relation cannot target the same unit.",
  path: ["toUnitId"],
});

export const createKnowledgeCollectionSchema = baseCreationSchema.extend({
  collectionType: knowledgeCollectionTypeSchema,
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(4_000).default(""),
  linkedEntityId: z.string().trim().max(300).nullable().default(null),
});

export const addKnowledgeCollectionMemberSchema = baseCreationSchema.extend({
  collectionId: z.string().uuid(),
  memberType: z.enum(["source", "artifact", "unit"]),
  memberId: z.string().uuid(),
  position: z.number().int().nonnegative().max(1_000_000).default(0),
});

export const decideKnowledgeCandidateSchema = z.object({
  objectId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(2).max(1_000),
});

export type KnowledgeObjectType = z.infer<typeof knowledgeObjectTypeSchema>;
export type KnowledgeCreator = z.infer<typeof knowledgeCreatorSchema>;
export type KnowledgeApprovalStatus = z.infer<typeof knowledgeApprovalStatusSchema>;
export type CreateKnowledgeSource = z.infer<typeof createKnowledgeSourceSchema>;
export type CreateKnowledgeArtifact = z.infer<typeof createKnowledgeArtifactSchema>;
export type CreateKnowledgeUnit = z.infer<typeof createKnowledgeUnitSchema>;
export type CreateKnowledgeRelation = z.infer<typeof createKnowledgeRelationSchema>;
export type CreateKnowledgeCollection = z.infer<typeof createKnowledgeCollectionSchema>;
export type AddKnowledgeCollectionMember = z.infer<typeof addKnowledgeCollectionMemberSchema>;
