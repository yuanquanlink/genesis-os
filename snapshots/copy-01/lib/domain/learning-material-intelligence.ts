import { z } from "zod";

export const createLearningMaterialCandidatesSchema = z.object({
  clientRequestId: z.string().uuid(),
  analysisCandidateId: z.string().uuid(),
  targetCapability: z.string().trim().min(2).max(300),
  prerequisiteGap: z.number().min(0).max(1),
  availableMinutesPerWeek: z.number().int().min(30).max(10_080),
});

const sourceIdsSchema = z.array(z.string().uuid()).min(1).max(100);

export const learningMaterialGoalCandidateSchema = z.object({
  targetCapability: z.string().trim().min(2).max(300),
  learningObjective: z.string().trim().min(2).max(2_000),
  prerequisiteList: z.array(z.string().trim().min(1).max(500)).max(30),
  expectedOutcome: z.string().trim().min(2).max(2_000),
  relatedKnowledgeSourceIds: sourceIdsSchema,
});

const durationRangeSchema = z.object({
  low: z.number().positive(),
  expected: z.number().positive(),
  high: z.number().positive(),
}).refine((value) => value.low <= value.expected && value.expected <= value.high, {
  message: "Duration range must be ordered low <= expected <= high.",
});

export const learningMaterialTimeCandidateSchema = z.object({
  estimateKind: z.literal("study_workload_not_mastery"),
  materialComplexity: z.number().int().min(1).max(5),
  knowledgeSize: z.object({
    unitCount: z.number().int().nonnegative(),
    conceptCount: z.number().int().positive(),
    characterCount: z.number().int().nonnegative(),
  }),
  prerequisiteGap: z.number().min(0).max(1),
  availableMinutesPerWeek: z.number().int().min(30).max(10_080),
  estimatedStudyHours: durationRangeSchema,
  estimatedCalendarWeeks: durationRangeSchema,
  assumptions: z.array(z.string().trim().min(1).max(600)).min(1).max(12),
  disclaimer: z.string().trim().min(1).max(800),
  relatedKnowledgeSourceIds: sourceIdsSchema,
});

export const learningMaterialStageTypeSchema = z.enum([
  "foundation",
  "concept",
  "application",
  "project",
  "extension",
]);

const stage = <T extends z.infer<typeof learningMaterialStageTypeSchema>>(stageType: T) => z.object({
  stage: z.literal(stageType),
  title: z.string().trim().min(1).max(300),
  objective: z.string().trim().min(2).max(2_000),
  expectedArtifact: z.string().trim().min(2).max(1_000),
  relatedKnowledgeSourceIds: sourceIdsSchema,
});

export const learningMaterialPathCandidateSchema = z.object({
  stages: z.tuple([
    stage("foundation"),
    stage("concept"),
    stage("application"),
    stage("project"),
    stage("extension"),
  ]),
  relatedKnowledgeSourceIds: sourceIdsSchema,
  limitations: z.array(z.string().trim().min(1).max(600)).min(1).max(12),
});

export type LearningMaterialGoalCandidate = z.infer<typeof learningMaterialGoalCandidateSchema>;
export type LearningMaterialTimeCandidate = z.infer<typeof learningMaterialTimeCandidateSchema>;
export type LearningMaterialPathCandidate = z.infer<typeof learningMaterialPathCandidateSchema>;
