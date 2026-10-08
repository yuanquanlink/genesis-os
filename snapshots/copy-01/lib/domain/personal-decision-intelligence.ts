import { z } from "zod";

export const decisionIntelligenceSignalTypeSchema = z.enum([
  "digital_twin_aggregation_candidate",
  "digital_twin_dimension_candidate",
  "digital_twin_decision_pattern_candidate",
  "ability_dimension_candidate",
  "knowledge_analysis_candidate",
  "knowledge_learning_candidate",
]);

export const decisionIntelligenceSignalRefSchema = z.object({
  signalType: decisionIntelligenceSignalTypeSchema,
  signalId: z.string().uuid(),
});

export const validatedDecisionIntelligenceSignalSchema = decisionIntelligenceSignalRefSchema.extend({
  signalClass: z.literal("candidate"),
  sourceDomain: z.enum(["digital_twin", "ability", "knowledge"]),
});

const sourceRefsSchema = z.array(decisionIntelligenceSignalRefSchema).min(1).max(30);

const decisionHistoryInputSchema = z.object({
  decisionDescription: z.string().trim().min(5).max(1_500),
  occurredAt: z.string().datetime().nullable(),
  optionsConsidered: z.array(z.string().trim().min(1).max(500)).min(2).max(20),
  observedOutcome: z.string().trim().min(1).max(1_500).nullable(),
  sourceSignals: sourceRefsSchema,
});

const decisionContextInputSchema = z.object({
  situation: z.string().trim().min(5).max(2_000),
  constraints: z.array(z.string().trim().min(1).max(500)).max(20),
  uncertainties: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  stakeholders: z.array(z.string().trim().min(1).max(300)).max(20),
  sourceSignals: sourceRefsSchema,
});

export const decisionFactorTypeSchema = z.enum([
  "value", "constraint", "risk", "reward", "opportunity", "preference", "knowledge_gap",
]);

const choiceFactorInputSchema = z.object({
  factorType: decisionFactorTypeSchema,
  factor: z.string().trim().min(3).max(1_000),
  sourceSignals: sourceRefsSchema,
});

const tradeoffInputSchema = z.object({
  riskCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  rewardCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  opportunityCostCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  uncertaintyStatement: z.string().trim().min(5).max(1_500),
  sourceSignals: sourceRefsSchema,
});

const improvementSignalInputSchema = z.object({
  signal: z.string().trim().min(5).max(1_000),
  experiment: z.string().trim().min(5).max(1_000),
  evidenceNeeded: z.string().trim().min(5).max(1_000),
  sourceSignals: sourceRefsSchema,
});

export const createPersonalDecisionIntelligenceSchema = z.object({
  clientRequestId: z.string().uuid(),
  sourceSignals: z.array(decisionIntelligenceSignalRefSchema).min(3).max(100),
  decisionHistory: z.array(decisionHistoryInputSchema).min(1).max(30),
  contextAnalysis: decisionContextInputSchema,
  choiceFactors: z.array(choiceFactorInputSchema).min(1).max(40),
  tradeoffAnalysis: tradeoffInputSchema,
  improvementSignals: z.array(improvementSignalInputSchema).min(1).max(30),
});

const validatedRefsSchema = z.array(validatedDecisionIntelligenceSignalSchema).min(1).max(30);

export const decisionHistoryCandidateSchema = z.object({
  decisionDescription: z.string().trim().min(5).max(1_500),
  occurredAt: z.string().datetime().nullable(),
  optionsConsidered: z.array(z.string().trim().min(1).max(500)).min(2).max(20),
  observedOutcome: z.string().trim().min(1).max(1_500).nullable(),
  outcomeVerified: z.literal(false),
  judgementStatus: z.literal("not_judged"),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const decisionContextAnalysisCandidateSchema = z.object({
  situation: z.string().trim().min(5).max(2_000),
  constraints: z.array(z.string().trim().min(1).max(500)).max(20),
  uncertainties: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  stakeholders: z.array(z.string().trim().min(1).max(300)).max(20),
  analysisStatus: z.literal("candidate_analysis"),
  contextComplete: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const decisionChoiceFactorCandidateSchema = z.object({
  factorType: decisionFactorTypeSchema,
  factor: z.string().trim().min(3).max(1_000),
  influence: z.literal("unassessed"),
  finalWeight: z.null(),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const decisionTradeoffAnalysisCandidateSchema = z.object({
  riskCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  rewardCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  opportunityCostCandidates: z.array(z.string().trim().min(1).max(700)).min(1).max(20),
  uncertaintyStatement: z.string().trim().min(5).max(1_500),
  comparisonConclusion: z.null(),
  finalRecommendationAllowed: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const decisionImprovementSignalCandidateSchema = z.object({
  signal: z.string().trim().min(5).max(1_000),
  experiment: z.string().trim().min(5).max(1_000),
  evidenceNeeded: z.string().trim().min(5).max(1_000),
  improvementStatus: z.literal("candidate_signal"),
  userDeficiencyConclusion: z.literal(false),
  sourceSignals: validatedRefsSchema,
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(8),
});

export const personalDecisionIntelligenceCandidateSchema = z.object({
  aggregationState: z.literal("candidate_only"),
  decisionHistoryCandidateIds: z.array(z.string().uuid()).min(1).max(30),
  contextAnalysisCandidateId: z.string().uuid(),
  choiceFactorCandidateIds: z.array(z.string().uuid()).min(1).max(40),
  tradeoffAnalysisCandidateId: z.string().uuid(),
  improvementSignalCandidateIds: z.array(z.string().uuid()).min(1).max(30),
  sourceSignals: z.array(validatedDecisionIntelligenceSignalSchema).min(3).max(100),
  automaticDecisionJudgement: z.literal(false),
  finalPersonalityConclusion: z.literal(false),
  profileMutationAllowed: z.literal(false),
  memoryWriteAllowed: z.literal(false),
  abilityGrowthMutationAllowed: z.literal(false),
  masteryMutationAllowed: z.literal(false),
  contextEligible: z.literal(false),
  limitations: z.array(z.string().trim().min(1).max(700)).min(1).max(10),
});

export type DecisionIntelligenceSignalRef = z.infer<typeof decisionIntelligenceSignalRefSchema>;
export type ValidatedDecisionIntelligenceSignal = z.infer<typeof validatedDecisionIntelligenceSignalSchema>;
