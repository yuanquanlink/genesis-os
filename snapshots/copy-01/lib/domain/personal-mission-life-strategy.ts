import { z } from "zod";

export const missionLifeStrategySignalTypeSchema = z.enum([
  "reflection_mentor_intelligence_candidate",
  "decision_intelligence_candidate",
  "digital_twin_aggregation_candidate",
  "ability_dimension_candidate",
  "knowledge_analysis_candidate",
]);

export const missionLifeStrategySignalRefSchema = z.object({
  signalType: missionLifeStrategySignalTypeSchema,
  signalId: z.string().uuid(),
});

export const validatedMissionLifeStrategySignalSchema = missionLifeStrategySignalRefSchema.extend({
  signalClass: z.literal("candidate"),
  sourceDomain: z.enum(["reflection", "decision", "digital_twin", "ability", "knowledge"]),
});

const sourceRefsSchema = z.array(missionLifeStrategySignalRefSchema).min(1).max(40);
export const directionHorizonSchema = z.enum(["one_to_three_years", "three_to_five_years", "five_plus_years"]);

export const createPersonalMissionLifeStrategySchema = z.object({
  clientRequestId: z.string().uuid(),
  sourceSignals: z.array(missionLifeStrategySignalRefSchema).min(3).max(100),
  missionCandidate: z.object({
    purposeQuestion: z.string().trim().min(5).max(1_000),
    statementCandidate: z.string().trim().min(5).max(1_500),
    nonGoals: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    reviewConditions: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    sourceSignals: sourceRefsSchema,
  }),
  longTermDirections: z.array(z.object({
    horizon: directionHorizonSchema,
    directionCandidate: z.string().trim().min(5).max(1_500),
    rationaleCandidate: z.string().trim().min(5).max(1_500),
    disconfirmingEvidenceNeeded: z.string().trim().min(5).max(1_000),
    sourceSignals: sourceRefsSchema,
  })).min(1).max(20),
  valueSignals: z.array(z.object({
    valueLabel: z.string().trim().min(2).max(200),
    observationCandidate: z.string().trim().min(5).max(1_000),
    tensionQuestion: z.string().trim().min(5).max(1_000),
    counterEvidenceNeeded: z.string().trim().min(5).max(1_000),
    sourceSignals: sourceRefsSchema,
  })).min(1).max(30),
  strategicGoals: z.array(z.object({
    title: z.string().trim().min(2).max(300),
    intendedOutcomeCandidate: z.string().trim().min(5).max(1_500),
    horizon: directionHorizonSchema,
    successEvidenceNeeded: z.string().trim().min(5).max(1_000),
    tradeoffQuestion: z.string().trim().min(5).max(1_000),
    sourceSignals: sourceRefsSchema,
  })).min(1).max(30),
  lifeStrategyReflection: z.object({
    whyQuestion: z.string().trim().min(5).max(1_000),
    becomingQuestion: z.string().trim().min(5).max(1_000),
    priorityTensions: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    assumptions: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    sourceSignals: sourceRefsSchema,
  }),
  goalAlignments: z.array(z.object({
    opportunity: z.string().trim().min(2).max(1_000),
    strategicGoalTitle: z.string().trim().min(2).max(300),
    supportingCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    conflictingCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    unknowns: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
    sourceSignals: sourceRefsSchema,
  })).min(1).max(30),
});

const validatedRefsSchema = z.array(validatedMissionLifeStrategySignalSchema).min(1).max(40);

export const personalMissionStatementCandidateSchema = z.object({
  purposeQuestion: z.string().trim().min(5).max(1_000),
  statementCandidate: z.string().trim().min(5).max(1_500),
  nonGoals: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  reviewConditions: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  missionStatus: z.literal("candidate_hypothesis"),
  finalMission: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const longTermDirectionCandidateSchema = z.object({
  horizon: directionHorizonSchema,
  directionCandidate: z.string().trim().min(5).max(1_500),
  rationaleCandidate: z.string().trim().min(5).max(1_500),
  disconfirmingEvidenceNeeded: z.string().trim().min(5).max(1_000),
  finalDirection: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const personalValueSignalCandidateSchema = z.object({
  valueLabel: z.string().trim().min(2).max(200),
  observationCandidate: z.string().trim().min(5).max(1_000),
  tensionQuestion: z.string().trim().min(5).max(1_000),
  counterEvidenceNeeded: z.string().trim().min(5).max(1_000),
  stableValueConclusion: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const strategicGoalDirectionCandidateSchema = z.object({
  title: z.string().trim().min(2).max(300),
  intendedOutcomeCandidate: z.string().trim().min(5).max(1_500),
  horizon: directionHorizonSchema,
  successEvidenceNeeded: z.string().trim().min(5).max(1_000),
  tradeoffQuestion: z.string().trim().min(5).max(1_000),
  formalGoalCreated: z.literal(false),
  priorityStatus: z.literal("unranked"),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const lifeStrategyReflectionCandidateSchema = z.object({
  whyQuestion: z.string().trim().min(5).max(1_000),
  becomingQuestion: z.string().trim().min(5).max(1_000),
  priorityTensions: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  assumptions: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  finalIdentityConclusion: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const goalAlignmentAnalysisCandidateSchema = z.object({
  opportunity: z.string().trim().min(2).max(1_000),
  strategicGoalTitle: z.string().trim().min(2).max(300),
  supportingCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  conflictingCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  unknowns: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  alignmentStatus: z.literal("unassessed"),
  recommendation: z.null(),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const personalMissionLifeStrategyIntelligenceCandidateSchema = z.object({
  aggregationState: z.literal("candidate_only"),
  missionCandidateId: z.string().uuid(),
  longTermDirectionCandidateIds: z.array(z.string().uuid()).min(1).max(20),
  valueSignalCandidateIds: z.array(z.string().uuid()).min(1).max(30),
  strategicGoalCandidateIds: z.array(z.string().uuid()).min(1).max(30),
  lifeStrategyReflectionCandidateId: z.string().uuid(),
  goalAlignmentCandidateIds: z.array(z.string().uuid()).min(1).max(30),
  sourceSignals: z.array(validatedMissionLifeStrategySignalSchema).min(3).max(100),
  finalMission: z.literal(false),
  finalIdentityConclusion: z.literal(false),
  formalGoalWriteAllowed: z.literal(false),
  formalMissionWriteAllowed: z.literal(false),
  formalStrategyWriteAllowed: z.literal(false),
  profileMutationAllowed: z.literal(false),
  memoryWriteAllowed: z.literal(false),
  abilityGrowthMutationAllowed: z.literal(false),
  masteryMutationAllowed: z.literal(false),
  contextEligible: z.literal(false),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(10),
});

export type MissionLifeStrategySignalRef = z.infer<typeof missionLifeStrategySignalRefSchema>;
export type ValidatedMissionLifeStrategySignal = z.infer<typeof validatedMissionLifeStrategySignalSchema>;
