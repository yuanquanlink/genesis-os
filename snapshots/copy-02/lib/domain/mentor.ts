import { z } from "zod";
import { contextEvidenceKindSchema } from "@/lib/domain/context";

export const mentorPerspectiveSchema = z.enum([
  "first_principles",
  "engineer",
  "founder",
  "investor",
  "contrarian",
]);

const evidenceIdsSchema = z.array(z.string().trim().min(1).max(80)).max(12);

export const mentorSourceDetailSchema = z.object({
  id: z.string().trim().min(1).max(80),
  source: z.string().trim().min(1).max(2_400),
  evidenceKind: contextEvidenceKindSchema,
  confidence: z.number().min(0).max(1),
  occurredAt: z.string().nullable(),
  resolved: z.boolean(),
});

export const mentorDeepAnalysisSchema = z.object({
  facts: z.array(z.object({
    statement: z.string().trim().min(3).max(700),
    evidenceIds: evidenceIdsSchema,
    evidenceKind: contextEvidenceKindSchema,
  })).max(10),
  evidenceSummary: z.string().trim().min(5).max(1_200),
  patterns: z.array(z.object({
    statement: z.string().trim().min(5).max(800),
    evidenceIds: evidenceIdsSchema,
    confidence: z.number().min(0).max(1),
    boundary: z.string().trim().min(3).max(600),
  })).max(6),
  possibleCauses: z.array(z.object({
    statement: z.string().trim().min(5).max(800),
    evidenceIds: evidenceIdsSchema,
    confidence: z.number().min(0).max(1),
    verification: z.string().trim().min(5).max(700),
  })).max(6),
  counterExplanation: z.string().trim().min(5).max(1_200),
  contradictions: z.array(z.object({
    statement: z.string().trim().min(5).max(800),
    evidenceIds: evidenceIdsSchema,
    verification: z.string().trim().min(5).max(700),
  })).max(5),
  longTermImpact: z.string().trim().min(5).max(1_200),
  strategicChoices: z.array(z.object({
    choice: z.string().trim().min(3).max(500),
    why: z.string().trim().min(5).max(700),
    tradeoff: z.string().trim().min(5).max(700),
    successMetric: z.string().trim().min(5).max(700),
    evidenceIds: evidenceIdsSchema,
  })).min(1).max(4),
  actions: z.array(z.object({
    action: z.string().trim().min(5).max(600),
    deadline: z.string().trim().min(2).max(120),
    deliverable: z.string().trim().min(3).max(500),
    acceptanceEvidence: z.string().trim().min(5).max(600),
    testsHypothesis: z.string().trim().min(5).max(600),
    evidenceIds: evidenceIdsSchema,
  })).length(3),
  perspectives: z.array(z.object({
    lens: mentorPerspectiveSchema,
    interpretation: z.string().trim().min(5).max(900),
    challenge: z.string().trim().min(5).max(700),
    limitation: z.string().trim().min(5).max(600),
    evidenceIds: evidenceIdsSchema,
  })).min(1).max(5),
  sourceRefs: evidenceIdsSchema,
  sourceDetails: z.array(mentorSourceDetailSchema).max(24).default([]),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(3).max(600)).min(1).max(8),
});

export type MentorPerspective = z.infer<typeof mentorPerspectiveSchema>;
export type MentorDeepAnalysis = z.infer<typeof mentorDeepAnalysisSchema>;
export type MentorSourceDetail = z.infer<typeof mentorSourceDetailSchema>;

export type MentorAnalysisRecord = MentorDeepAnalysis & {
  id: string;
  clientRequestId: string;
  question: string;
  contextNote: string;
  requestedPerspectives: MentorPerspective[];
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  upstreamRequestId: string | null;
  fallbackReason: string | null;
  createdAt: string;
};
