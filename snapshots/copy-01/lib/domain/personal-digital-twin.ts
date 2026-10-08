import { z } from "zod";

export const digitalTwinSignalTypeSchema = z.enum([
  "approved_profile_fact",
  "approved_memory",
  "verified_evidence",
  "formal_ability",
  "memory_candidate",
  "learning_intelligence_candidate",
  "ability_dimension_candidate",
  "growth_trend_candidate",
]);

export const digitalTwinSignalRefSchema = z.object({
  signalType: digitalTwinSignalTypeSchema,
  signalId: z.string().uuid(),
});

export const validatedDigitalTwinSignalSchema = digitalTwinSignalRefSchema.extend({
  signalClass: z.enum(["approved", "candidate"]),
});

export const digitalTwinProfileDimensionTypeSchema = z.enum([
  "learning_preference",
  "cognitive_patterns",
  "working_style",
  "decision_tendencies",
  "interest_evolution",
  "strength_signals",
  "weakness_signals",
]);

export const digitalTwinProfileDimensionLabels = {
  learning_preference: "Learning preference",
  cognitive_patterns: "Cognitive patterns",
  working_style: "Working style",
  decision_tendencies: "Decision tendencies",
  interest_evolution: "Interest evolution",
  strength_signals: "Strength signals",
  weakness_signals: "Weakness signals",
} as const;

const dimensionInputSchema = z.object({
  dimension: digitalTwinProfileDimensionTypeSchema,
  hypothesis: z.string().trim().min(5).max(1_500),
  sourceSignals: z.array(digitalTwinSignalRefSchema).min(1).max(30),
});

const behaviorInputSchema = z.object({
  observation: z.string().trim().min(5).max(1_500),
  observedAt: z.string().datetime().nullable(),
  sourceSignals: z.array(digitalTwinSignalRefSchema).min(1).max(30),
});

const preferenceInputSchema = z.object({
  preferenceArea: z.string().trim().min(2).max(200),
  candidatePreference: z.string().trim().min(5).max(1_500),
  sourceSignals: z.array(digitalTwinSignalRefSchema).min(1).max(30),
});

const decisionPatternInputSchema = z.object({
  context: z.string().trim().min(2).max(500),
  pattern: z.string().trim().min(5).max(1_500),
  counterEvidenceNeeded: z.string().trim().min(5).max(1_000),
  sourceSignals: z.array(digitalTwinSignalRefSchema).min(1).max(30),
});

export const createDigitalTwinCandidateSchema = z.object({
  clientRequestId: z.string().uuid(),
  sourceSignals: z.array(digitalTwinSignalRefSchema).min(1).max(100),
  profileDimensions: z.array(dimensionInputSchema).length(7),
  behaviorObservations: z.array(behaviorInputSchema).min(1).max(30),
  preferenceCandidates: z.array(preferenceInputSchema).min(1).max(30),
  decisionPatternCandidates: z.array(decisionPatternInputSchema).min(1).max(30),
});

export const digitalTwinProfileDimensionCandidateSchema = z.object({
  dimension: digitalTwinProfileDimensionTypeSchema,
  label: z.string().trim().min(2).max(120),
  hypothesis: z.string().trim().min(5).max(1_500),
  truthStatus: z.literal("candidate_hypothesis"),
  finalTruth: z.literal(false),
  sourceSignals: z.array(validatedDigitalTwinSignalSchema).min(1).max(30),
  confidence: z.number().min(0).max(0.5),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const behaviorObservationCandidateSchema = z.object({
  observation: z.string().trim().min(5).max(1_500),
  observedAt: z.string().datetime().nullable(),
  observationStatus: z.literal("unverified_candidate"),
  confirmedBehavior: z.literal(false),
  sourceSignals: z.array(validatedDigitalTwinSignalSchema).min(1).max(30),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const personalPreferenceCandidateSchema = z.object({
  preferenceArea: z.string().trim().min(2).max(200),
  candidatePreference: z.string().trim().min(5).max(1_500),
  stability: z.literal("unknown"),
  confirmedPreference: z.literal(false),
  sourceSignals: z.array(validatedDigitalTwinSignalSchema).min(1).max(30),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const decisionPatternCandidateSchema = z.object({
  context: z.string().trim().min(2).max(500),
  pattern: z.string().trim().min(5).max(1_500),
  counterEvidenceNeeded: z.string().trim().min(5).max(1_000),
  recurrence: z.literal("unverified"),
  confirmedPattern: z.literal(false),
  sourceSignals: z.array(validatedDigitalTwinSignalSchema).min(1).max(30),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const digitalTwinAggregationCandidateSchema = z.object({
  aggregationState: z.literal("candidate_only"),
  profileDimensionCandidateIds: z.array(z.string().uuid()).length(7),
  behaviorObservationCandidateIds: z.array(z.string().uuid()).min(1).max(30),
  preferenceCandidateIds: z.array(z.string().uuid()).min(1).max(30),
  decisionPatternCandidateIds: z.array(z.string().uuid()).min(1).max(30),
  sourceSignals: z.array(validatedDigitalTwinSignalSchema).min(1).max(100),
  finalPersonalityTruth: z.literal(false),
  profileMutationAllowed: z.literal(false),
  memoryWriteAllowed: z.literal(false),
  abilityGrowthMutationAllowed: z.literal(false),
  masteryMutationAllowed: z.literal(false),
  contextEligible: z.literal(false),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(10),
});

export type DigitalTwinSignalRef = z.infer<typeof digitalTwinSignalRefSchema>;
export type ValidatedDigitalTwinSignal = z.infer<typeof validatedDigitalTwinSignalSchema>;
export type DigitalTwinProfileDimensionCandidate = z.infer<typeof digitalTwinProfileDimensionCandidateSchema>;
