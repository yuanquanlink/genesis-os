import { z } from "zod";

export const knowledgeIngestionStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "partial",
  "failed",
  "retry_pending",
]);

export const queueKnowledgeIngestionSchema = z.object({
  clientRequestId: z.string().uuid(),
  sourceId: z.string().uuid(),
  artifactId: z.string().uuid().nullable().default(null),
  maxAttempts: z.number().int().min(1).max(10).default(3),
  processingMetadata: z.record(z.string(), z.unknown()).default({}),
});

export const startKnowledgeIngestionSchema = z.object({
  runId: z.string().uuid(),
  processor: z.object({
    name: z.string().trim().min(1).max(120),
    version: z.string().trim().min(1).max(120),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const finishKnowledgeIngestionSchema = z.object({
  runId: z.string().uuid(),
  outcome: z.enum(["completed", "partial"]),
  contentReference: z.string().trim().min(1).max(4_096),
  contentHash: z.string().trim().min(1).max(256).nullable().default(null),
  processingMetadata: z.record(z.string(), z.unknown()).default({}),
});

export const failKnowledgeIngestionSchema = z.object({
  runId: z.string().uuid(),
  errorCode: z.string().trim().min(1).max(80),
  errorMessage: z.string().trim().min(1).max(500),
  processingMetadata: z.record(z.string(), z.unknown()).default({}),
});

const sourceIdsSchema = z.array(z.string().uuid()).min(1).max(100);

export const knowledgeAnalysisOutputSchema = z.object({
  difficulty: z.object({
    level: z.enum(["foundational", "intermediate", "advanced", "expert"]),
    score: z.number().int().min(1).max(5),
    rationale: z.string().trim().min(1).max(1_500),
    sourceIds: sourceIdsSchema,
  }),
  prerequisites: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    rationale: z.string().trim().min(1).max(1_000),
    sourceIds: sourceIdsSchema,
  })).max(20),
  concepts: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    summary: z.string().trim().min(1).max(2_000),
    sourceIds: sourceIdsSchema,
  })).min(1).max(50),
  relationships: z.array(z.object({
    from: z.string().trim().min(1).max(300),
    to: z.string().trim().min(1).max(300),
    type: z.enum(["supports", "contradicts", "cites", "supersedes", "derived_from"]),
    rationale: z.string().trim().min(1).max(1_000),
    sourceIds: sourceIdsSchema,
  })).max(50),
  learningValue: z.object({
    score: z.number().min(0).max(1),
    rationale: z.string().trim().min(1).max(1_500),
    possibleUses: z.array(z.string().trim().min(1).max(500)).max(12),
    sourceIds: sourceIdsSchema,
  }),
  learningGoal: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(2_000),
    sourceIds: sourceIdsSchema,
  }),
  estimatedLearningTime: z.object({
    hours: z.number().positive().max(10_000),
    rangeHours: z.tuple([z.number().nonnegative(), z.number().positive()]),
    assumptions: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
    sourceIds: sourceIdsSchema,
  }).refine((value) => value.rangeHours[0] <= value.hours && value.hours <= value.rangeHours[1], {
    message: "Estimated hours must be inside the proposed range.",
    path: ["rangeHours"],
  }),
  learningPath: z.object({
    steps: z.array(z.object({
      title: z.string().trim().min(1).max(300),
      outcome: z.string().trim().min(1).max(800),
      sourceIds: sourceIdsSchema,
    })).min(1).max(20),
    sourceIds: sourceIdsSchema,
  }),
  requiredPrerequisites: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    reason: z.string().trim().min(1).max(1_000),
    sourceIds: sourceIdsSchema,
  })).max(20),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
});

export const generateKnowledgeAnalysisSchema = z.object({
  clientRequestId: z.string().uuid(),
  sourceId: z.string().uuid(),
  artifactId: z.string().uuid().nullable().default(null),
  unitIds: z.array(z.string().uuid()).max(100).default([]),
  request: z.string().trim().min(1).max(2_000).default("Analyze this knowledge source for learning."),
});

export const knowledgeLearningCandidateTypeSchema = z.enum([
  "learning_goal",
  "estimated_learning_time",
  "learning_path",
  "prerequisite",
]);

export type KnowledgeAnalysisOutput = z.infer<typeof knowledgeAnalysisOutputSchema>;
export type KnowledgeLearningCandidateType = z.infer<typeof knowledgeLearningCandidateTypeSchema>;
