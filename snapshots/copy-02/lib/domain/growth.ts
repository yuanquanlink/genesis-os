import { z } from "zod";

export const growthNodeTypeSchema = z.enum([
  "identity",
  "ability",
  "project",
  "goal",
  "weakness",
]);
export const growthEvidenceSourceSchema = z.enum([
  "profile_fact",
  "self_entry",
  "learning_goal",
  "learning_evidence",
  "engineering_outcome",
  "ai_evaluation",
  "user_input",
  "evidence_item",
]);
export const growthRelationSchema = z.enum([
  "supports",
  "relates_to",
  "requires",
  "contributes_to",
  "exposes",
  "advances",
]);

export const growthEvidenceReferenceSchema = z.object({
  evidenceId: z.string().trim().min(1).max(80),
  excerpt: z.string().trim().min(2).max(800),
  reason: z.string().trim().min(2).max(500),
});

export const growthCandidateSchema = z.object({
  nodeType: growthNodeTypeSchema,
  name: z.string().trim().min(2).max(120),
  proposedLevel: z.number().int().min(0).max(5),
  confidence: z.number().min(0).max(1).transform((value) => Math.min(0.85, value)),
  nextImprovement: z.string().trim().max(500).default(""),
  relatedGoals: z.array(z.string().trim().min(2).max(120)).max(6).default([]),
  evidence: z.array(growthEvidenceReferenceSchema).min(1).max(8),
});

export const growthRecommendationSchema = z.object({
  goal: z.string().trim().min(2).max(180),
  next30Days: z
    .array(
      z.object({
        focus: z.string().trim().min(2).max(180),
        why: z.string().trim().min(2).max(500),
        expectedImprovement: z.string().trim().min(2).max(500),
        evidenceIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
      }),
    )
    .min(1)
    .max(6),
  next90Days: z.object({
    project: z.string().trim().min(2).max(240),
    deliverables: z.array(z.string().trim().min(2).max(300)).min(1).max(8),
    evidenceIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  }),
  nextYear: z.object({
    stage: z.string().trim().min(2).max(300),
    proof: z.array(z.string().trim().min(2).max(300)).min(1).max(8),
    evidenceIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  }),
  confidence: z.number().min(0).max(1).transform((value) => Math.min(0.85, value)),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8).default([]),
});

export const growthAnalysisSchema = z.object({
  candidates: z.array(growthCandidateSchema).max(20),
  recommendation: growthRecommendationSchema,
});

export const growthAnalyzeRequestSchema = z.object({
  action: z.literal("analyze"),
});

export const growthCandidateDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  name: z.string().trim().min(2).max(120).optional(),
  currentLevel: z.number().int().min(0).max(5).optional(),
  nextImprovement: z.string().trim().max(500).optional(),
});

export type GrowthNodeType = z.infer<typeof growthNodeTypeSchema>;
export type GrowthCandidate = z.infer<typeof growthCandidateSchema>;
export type GrowthRecommendation = z.infer<typeof growthRecommendationSchema>;
export type GrowthAnalysis = z.infer<typeof growthAnalysisSchema>;
export type GrowthCandidateDecision = z.infer<typeof growthCandidateDecisionSchema>;
