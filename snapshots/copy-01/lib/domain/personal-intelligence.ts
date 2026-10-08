import { z } from "zod";

export const planningPathCandidateSchema = z.object({
  key: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(4).max(500),
  advantages: z.array(z.string().trim().min(2).max(240)).min(1).max(4),
  disadvantages: z.array(z.string().trim().min(2).max(240)).min(1).max(4),
});

export const executableActionSchema = z.object({
  title: z.string().trim().min(2).max(180),
  why: z.string().trim().min(4).max(600),
  durationMinutes: z.number().int().min(5).max(240),
  completionSignal: z.string().trim().min(4).max(400),
});

export const planningDecompositionSchema = z.object({
  goal: z.string().trim().min(2).max(240),
  objective: z.string().trim().min(4).max(600),
  assumptions: z.array(z.string().trim().min(2).max(300)).max(6),
  paths: z.array(planningPathCandidateSchema).min(2).max(4),
  recommendation: z.object({
    pathKey: z.string().trim().min(1).max(40),
    why: z.string().trim().min(4).max(700),
  }),
  firstAction: executableActionSchema,
  limitations: z.array(z.string().trim().min(2).max(320)).min(1).max(6),
  confidence: z.number().min(0).max(1),
  stateBoundary: z.literal("candidate_untrusted_no_formal_mutation"),
});

export const planningDecomposeInputSchema = z.object({
  candidateId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
});

export const advisorDirectionSchema = z.object({
  key: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(120),
  action: z.string().trim().min(2).max(240),
  why: z.string().trim().min(4).max(600),
  advantages: z.array(z.string().trim().min(2).max(240)).min(1).max(4),
  disadvantages: z.array(z.string().trim().min(2).max(240)).min(1).max(4),
  sourceRefs: z.array(z.string().trim().min(1).max(180)).max(12),
});

export const advisorRecommendationSchema = z.object({
  currentState: z.string().trim().min(4).max(900),
  directions: z.array(advisorDirectionSchema).min(2).max(4),
  recommendation: z.object({
    directionKey: z.string().trim().min(1).max(40),
    reason: z.string().trim().min(4).max(700),
    firstAction: executableActionSchema,
  }),
  limitations: z.array(z.string().trim().min(2).max(320)).min(1).max(6),
  confidence: z.number().min(0).max(1),
  stateBoundary: z.literal("candidate_untrusted_no_formal_mutation"),
});

export const advisorRequestSchema = z.object({
  question: z.string().trim().min(2).max(1_000).default("我现在应该做什么？"),
  availableMinutes: z.number().int().min(10).max(720).optional(),
  clientRequestId: z.string().uuid(),
});

export const opportunityCandidateContentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  signal: z.string().trim().min(4).max(700),
  fitReason: z.string().trim().min(4).max(700),
  upside: z.array(z.string().trim().min(2).max(240)).min(1).max(4),
  downside: z.array(z.string().trim().min(2).max(240)).min(1).max(4),
  sourceRefs: z.array(z.string().trim().min(1).max(180)).max(12),
  firstAction: executableActionSchema,
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(2).max(320)).min(1).max(6),
  stateBoundary: z.literal("candidate_untrusted_no_formal_mutation"),
});

export const opportunityGenerateInputSchema = z.object({
  focus: z.string().trim().max(500).default(""),
  clientRequestId: z.string().uuid(),
});

export const personalIntelligenceDecisionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["archive", "reopen"]),
  clientRequestId: z.string().uuid(),
});

export type PlanningDecomposition = z.infer<typeof planningDecompositionSchema>;
export type AdvisorRecommendation = z.infer<typeof advisorRecommendationSchema>;
export type OpportunityCandidateContent = z.infer<typeof opportunityCandidateContentSchema>;
