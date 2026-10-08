import { z } from "zod";

export const reflectionMentorSignalTypeSchema = z.enum([
  "operating_reflection",
  "verified_evidence",
  "decision_intelligence_candidate",
  "digital_twin_aggregation_candidate",
  "ability_dimension_candidate",
  "knowledge_analysis_candidate",
]);

export const reflectionMentorSignalRefSchema = z.object({
  signalType: reflectionMentorSignalTypeSchema,
  signalId: z.string().uuid(),
});

export const validatedReflectionMentorSignalSchema = reflectionMentorSignalRefSchema.extend({
  signalClass: z.enum(["self_report", "verified", "candidate"]),
  sourceDomain: z.enum(["reflection", "evidence", "decision", "digital_twin", "ability", "knowledge"]),
});

const sourceRefsSchema = z.array(reflectionMentorSignalRefSchema).min(1).max(40);

export const reflectionSignalTypeSchema = z.enum(["strength", "weakness"]);
export const mentorPerspectiveTypeSchema = z.enum([
  "supportive", "challenging", "systems", "first_principles", "counterfactual",
]);

export const createPersonalReflectionMentorSchema = z.object({
  clientRequestId: z.string().uuid(),
  sourceSignals: z.array(reflectionMentorSignalRefSchema).min(3).max(100),
  dailyReflection: z.object({
    reflectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    summaryCandidate: z.string().trim().min(5).max(2_000),
    completedCandidates: z.array(z.string().trim().min(1).max(700)).max(30),
    frictionCandidates: z.array(z.string().trim().min(1).max(700)).max(30),
    nextAdjustmentCandidate: z.string().trim().min(5).max(1_500),
    sourceSignals: sourceRefsSchema,
  }),
  selfReview: z.object({
    doneWellCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    improvementCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    unresolvedQuestions: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    sourceSignals: sourceRefsSchema,
  }),
  strengthWeaknessSignals: z.array(z.object({
    signalType: reflectionSignalTypeSchema,
    observation: z.string().trim().min(5).max(1_000),
    counterEvidenceNeeded: z.string().trim().min(5).max(1_000),
    sourceSignals: sourceRefsSchema,
  })).min(2).max(30),
  mentorPerspectives: z.array(z.object({
    perspectiveType: mentorPerspectiveTypeSchema,
    observationCandidate: z.string().trim().min(5).max(1_500),
    alternativeApproachCandidate: z.string().trim().min(5).max(1_500),
    questionForOwner: z.string().trim().min(5).max(1_000),
    sourceSignals: sourceRefsSchema,
  })).min(1).max(20),
  expertThinkingReferences: z.array(z.object({
    referenceTitle: z.string().trim().min(2).max(300),
    referenceLocator: z.string().trim().max(2_048).nullable(),
    thinkingPattern: z.string().trim().min(5).max(1_500),
    applicabilityQuestion: z.string().trim().min(5).max(1_000),
    sourceSignals: sourceRefsSchema,
  })).min(1).max(20),
  cognitiveElevations: z.array(z.object({
    currentFrameCandidate: z.string().trim().min(5).max(1_500),
    alternativeFrameCandidate: z.string().trim().min(5).max(1_500),
    practiceExperiment: z.string().trim().min(5).max(1_000),
    evidenceNeeded: z.string().trim().min(5).max(1_000),
    sourceSignals: sourceRefsSchema,
  })).min(1).max(20),
});

const validatedRefsSchema = z.array(validatedReflectionMentorSignalSchema).min(1).max(40);

export const dailyReflectionIntelligenceCandidateSchema = z.object({
  reflectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summaryCandidate: z.string().trim().min(5).max(2_000),
  completedCandidates: z.array(z.string().trim().min(1).max(700)).max(30),
  frictionCandidates: z.array(z.string().trim().min(1).max(700)).max(30),
  nextAdjustmentCandidate: z.string().trim().min(5).max(1_500),
  finalDailyJudgement: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const selfReviewCandidateSchema = z.object({
  doneWellCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  improvementCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  unresolvedQuestions: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  finalSelfAssessment: z.null(),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const reflectionStrengthWeaknessSignalCandidateSchema = z.object({
  signalType: reflectionSignalTypeSchema,
  observation: z.string().trim().min(5).max(1_000),
  counterEvidenceNeeded: z.string().trim().min(5).max(1_000),
  stableTraitConclusion: z.literal(false),
  abilityMutationAllowed: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const mentorPerspectiveCandidateSchema = z.object({
  perspectiveType: mentorPerspectiveTypeSchema,
  observationCandidate: z.string().trim().min(5).max(1_500),
  alternativeApproachCandidate: z.string().trim().min(5).max(1_500),
  questionForOwner: z.string().trim().min(5).max(1_000),
  userJudgement: z.literal(false),
  certainty: z.literal("candidate"),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const expertThinkingPatternReferenceCandidateSchema = z.object({
  referenceTitle: z.string().trim().min(2).max(300),
  referenceLocator: z.string().trim().max(2_048).nullable(),
  thinkingPattern: z.string().trim().min(5).max(1_500),
  applicabilityQuestion: z.string().trim().min(5).max(1_000),
  attributionStatus: z.literal("reference_only_not_attributed"),
  claimedExpertIdentity: z.null(),
  claimedExpertDecision: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const cognitiveElevationCandidateSchema = z.object({
  currentFrameCandidate: z.string().trim().min(5).max(1_500),
  alternativeFrameCandidate: z.string().trim().min(5).max(1_500),
  practiceExperiment: z.string().trim().min(5).max(1_000),
  evidenceNeeded: z.string().trim().min(5).max(1_000),
  cognitiveGrowthClaim: z.literal(false),
  masteryClaim: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const personalReflectionMentorIntelligenceCandidateSchema = z.object({
  aggregationState: z.literal("candidate_only"),
  dailyReflectionCandidateId: z.string().uuid(),
  selfReviewCandidateId: z.string().uuid(),
  strengthWeaknessSignalCandidateIds: z.array(z.string().uuid()).min(2).max(30),
  mentorPerspectiveCandidateIds: z.array(z.string().uuid()).min(1).max(20),
  expertThinkingReferenceCandidateIds: z.array(z.string().uuid()).min(1).max(20),
  cognitiveElevationCandidateIds: z.array(z.string().uuid()).min(1).max(20),
  sourceSignals: z.array(validatedReflectionMentorSignalSchema).min(3).max(100),
  finalUserJudgement: z.literal(false),
  finalPersonalityConclusion: z.literal(false),
  profileMutationAllowed: z.literal(false),
  memoryWriteAllowed: z.literal(false),
  abilityGrowthMutationAllowed: z.literal(false),
  evidenceWriteAllowed: z.literal(false),
  masteryMutationAllowed: z.literal(false),
  contextEligible: z.literal(false),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(10),
});

export type ReflectionMentorSignalRef = z.infer<typeof reflectionMentorSignalRefSchema>;
export type ValidatedReflectionMentorSignal = z.infer<typeof validatedReflectionMentorSignalSchema>;
