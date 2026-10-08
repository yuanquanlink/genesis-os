import { z } from "zod";
import { manualEvidenceSchema } from "@/lib/domain/evidence";
import { learningMaterialStageTypeSchema } from "@/lib/domain/learning-material-intelligence";

const sourceIdsSchema = z.array(z.string().uuid()).min(1).max(100);

export const abilityDimensionTypeSchema = z.enum([
  "technical_ability",
  "learning_ability",
  "problem_solving",
  "creativity",
  "engineering_ability",
  "communication",
  "business_understanding",
]);

export const abilityDimensionLabels = {
  technical_ability: "Technical ability",
  learning_ability: "Learning ability",
  problem_solving: "Problem solving",
  creativity: "Creativity",
  engineering_ability: "Engineering ability",
  communication: "Communication",
  business_understanding: "Business understanding",
} as const;

const dimensionHypothesisSchema = z.object({
  dimension: abilityDimensionTypeSchema,
  hypothesis: z.string().trim().min(5).max(1_000),
  observationFocus: z.string().trim().min(5).max(1_000),
  relatedStages: z.array(learningMaterialStageTypeSchema).min(1).max(5),
});

export const createAbilityCandidateSetSchema = z.object({
  clientRequestId: z.string().uuid(),
  learningIntelligenceCandidateId: z.string().uuid(),
  dimensions: z.array(dimensionHypothesisSchema).min(1).max(7),
});

export const abilityDimensionCandidateSchema = z.object({
  dimension: abilityDimensionTypeSchema,
  label: z.string().trim().min(2).max(120),
  hypothesis: z.string().trim().min(5).max(1_000),
  observationFocus: z.string().trim().min(5).max(1_000),
  relatedStages: z.array(learningMaterialStageTypeSchema).min(1).max(5),
  assessmentState: z.literal("unassessed_candidate"),
  currentLevel: z.null(),
  proposedLevel: z.null(),
  abilityImpact: z.literal("none"),
  relatedKnowledgeSourceIds: sourceIdsSchema,
  confidence: z.number().min(0).max(0.5),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const growthTrackingCandidateSchema = z.object({
  dimension: abilityDimensionTypeSchema,
  trackingState: z.literal("candidate_not_active"),
  baseline: z.literal("unknown"),
  relatedStages: z.array(learningMaterialStageTypeSchema).min(1).max(5),
  observationFocus: z.string().trim().min(5).max(1_000),
  verifiedEvidenceIds: z.array(z.string()).max(0),
  abilityImpact: z.literal("none"),
  growthImpact: z.literal("none"),
  relatedKnowledgeSourceIds: sourceIdsSchema,
});

export const prepareAbilityEvidenceSchema = z.object({
  clientRequestId: z.string().uuid(),
  abilityDimensionCandidateId: z.string().uuid(),
  learningProgressPreparationId: z.string().uuid(),
});

export const abilityEvidencePreparationSchema = z.object({
  dimension: abilityDimensionTypeSchema,
  learningProgressPreparationId: z.string().uuid(),
  sourceStage: learningMaterialStageTypeSchema,
  sourceProgress: z.object({
    completedWork: z.string().trim().min(5).max(4_000),
    artifactReference: z.string().trim().max(2_048).nullable(),
    observedAt: z.string().datetime(),
    assistanceLevel: z.enum(["independent", "guided", "assisted", "unknown"]),
    notes: z.string().trim().max(2_000),
  }),
  evidenceDraft: manualEvidenceSchema,
  verificationStatus: z.literal("unverified"),
  requiresExplicitEvidenceSubmission: z.literal(true),
  allowsAbilityUpdate: z.literal(false),
  allowsGrowthUpdate: z.literal(false),
  relatedKnowledgeSourceIds: sourceIdsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const generateGrowthTrendSchema = z.object({
  clientRequestId: z.string().uuid(),
  abilityDimensionCandidateId: z.string().uuid(),
});

export const growthTrendCandidateSchema = z.object({
  dimension: abilityDimensionTypeSchema,
  trendDirection: z.literal("unknown"),
  numericDelta: z.null(),
  assessmentState: z.enum(["insufficient_data", "unverified_observations_only"]),
  observedPreparationCount: z.number().int().min(0),
  observationPreparationIds: z.array(z.string().uuid()).max(100),
  verifiedEvidenceIds: z.array(z.string()).max(0),
  abilityImpact: z.literal("none"),
  growthImpact: z.literal("none"),
  relatedKnowledgeSourceIds: sourceIdsSchema,
  confidence: z.number().min(0).max(0.35),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export type AbilityDimensionCandidate = z.infer<typeof abilityDimensionCandidateSchema>;
export type GrowthTrackingCandidate = z.infer<typeof growthTrackingCandidateSchema>;
export type AbilityEvidencePreparation = z.infer<typeof abilityEvidencePreparationSchema>;
export type GrowthTrendCandidate = z.infer<typeof growthTrendCandidateSchema>;
