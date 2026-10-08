import { z } from "zod";
import { manualEvidenceSchema } from "@/lib/domain/evidence";
import {
  learningMaterialGoalCandidateSchema,
  learningMaterialPathCandidateSchema,
  learningMaterialStageTypeSchema,
  learningMaterialTimeCandidateSchema,
} from "@/lib/domain/learning-material-intelligence";

const sourceIdsSchema = z.array(z.string().uuid()).min(1).max(100);

export const createPersonalLearningIntelligenceSchema = z.object({
  clientRequestId: z.string().uuid(),
  materialCandidateSetId: z.string().uuid(),
});

export const personalLearningIntelligenceCandidateSchema = z.object({
  lineage: z.object({
    materialCandidateSetId: z.string().uuid(),
    analysisCandidateId: z.string().uuid(),
    goalCandidateId: z.string().uuid(),
    timeCandidateId: z.string().uuid(),
    pathCandidateId: z.string().uuid(),
  }),
  goal: learningMaterialGoalCandidateSchema,
  studyWorkload: learningMaterialTimeCandidateSchema,
  adaptivePath: learningMaterialPathCandidateSchema,
  relatedKnowledgeSourceIds: sourceIdsSchema,
  upstreamConfidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(16),
});

export const personalLearningStateCandidateSchema = z.object({
  targetCapability: z.string().trim().min(2).max(300),
  learningObjective: z.string().trim().min(2).max(2_000),
  state: z.literal("candidate_not_started"),
  recommendedStartingStage: z.literal("foundation"),
  prerequisiteReadiness: z.array(z.object({
    prerequisite: z.string().trim().min(1).max(500),
    status: z.literal("unknown"),
  })).max(30),
  availableMinutesPerWeek: z.number().int().min(30).max(10_080),
  estimatedStudyWorkload: z.object({
    hours: learningMaterialTimeCandidateSchema.shape.estimatedStudyHours,
    calendarWeeks: learningMaterialTimeCandidateSchema.shape.estimatedCalendarWeeks,
    estimateKind: z.literal("study_workload_not_mastery"),
  }),
  completedStages: z.array(learningMaterialStageTypeSchema).max(0),
  masteryStatus: z.literal("not_evaluated"),
  abilityImpact: z.literal("none"),
  memoryImpact: z.literal("none"),
  relatedKnowledgeSourceIds: sourceIdsSchema,
});

export const learningRecommendationTypeSchema = z.enum([
  "starting_stage",
  "weekly_capacity",
  "prerequisite_review",
  "progress_evidence_prompt",
]);

export const learningRecommendationCandidateSchema = z.object({
  recommendationType: learningRecommendationTypeSchema,
  title: z.string().trim().min(2).max(300),
  rationale: z.string().trim().min(2).max(1_500),
  suggestedAction: z.string().trim().min(2).max(1_500),
  relatedKnowledgeSourceIds: sourceIdsSchema,
  confidence: z.number().min(0).max(0.65),
  limitations: z.array(z.string().trim().min(1).max(600)).min(1).max(8),
});

export const prepareLearningProgressEvidenceSchema = z.object({
  clientRequestId: z.string().uuid(),
  intelligenceCandidateId: z.string().uuid(),
  stage: learningMaterialStageTypeSchema,
  completedWork: z.string().trim().min(5).max(4_000),
  artifactReference: z.string().trim().max(2_048).nullable().default(null),
  observedAt: z.string().datetime(),
  assistanceLevel: z.enum(["independent", "guided", "assisted", "unknown"]),
  notes: z.string().trim().max(2_000).default(""),
});

export const learningProgressEvidencePreparationSchema = z.object({
  stage: learningMaterialStageTypeSchema,
  rawProgress: z.object({
    completedWork: z.string().trim().min(5).max(4_000),
    artifactReference: z.string().trim().max(2_048).nullable(),
    observedAt: z.string().datetime(),
    assistanceLevel: z.enum(["independent", "guided", "assisted", "unknown"]),
    notes: z.string().trim().max(2_000),
  }),
  evidenceDraft: manualEvidenceSchema,
  verificationStatus: z.literal("unverified"),
  requiresExplicitEvidenceSubmission: z.literal(true),
  relatedKnowledgeSourceIds: sourceIdsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export type PersonalLearningIntelligenceCandidate = z.infer<typeof personalLearningIntelligenceCandidateSchema>;
export type PersonalLearningStateCandidate = z.infer<typeof personalLearningStateCandidateSchema>;
export type LearningRecommendationCandidate = z.infer<typeof learningRecommendationCandidateSchema>;
export type LearningProgressEvidencePreparation = z.infer<typeof learningProgressEvidencePreparationSchema>;
