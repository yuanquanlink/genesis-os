import { z } from "zod";

export const evidenceTypeSchema = z.enum([
  "learning",
  "project",
  "competition",
  "external",
  "self_reflection",
]);

export const evidenceVerificationSchema = z.enum([
  "pending",
  "verified",
  "needs_review",
  "rejected",
]);

export const manualEvidenceSchema = z.object({
  action: z.literal("create"),
  evidenceType: evidenceTypeSchema,
  source: z.string().trim().min(2).max(240),
  description: z.string().trim().min(5).max(2_000),
  relatedAbility: z.string().trim().min(2).max(120),
  capturedAt: z.string().datetime(),
  dataKind: z.enum(["user", "demo", "test"]).default("user"),
  clientRequestId: z.string().uuid(),
});

export const evidenceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("analyze") }),
  z.object({ action: z.literal("daily_report") }),
  manualEvidenceSchema,
]);

export const evidenceEvaluationSchema = z.object({
  evidenceId: z.string().trim().min(1).max(100),
  relatedAbility: z.string().trim().min(2).max(120),
  truthfulness: z.number().int().min(0).max(100),
  difficulty: z.number().int().min(0).max(100),
  independence: z.number().int().min(0).max(100),
  engineeringValue: z.number().int().min(0).max(100),
  longTermValue: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  impact: z.number().min(0).max(1),
  verificationStatus: z.enum(["verified", "needs_review", "rejected"]),
  reasoning: z.string().trim().min(5).max(1_000),
  proposedLevel: z.number().int().min(0).max(5),
  nextImprovement: z.string().trim().min(2).max(500),
});

export const evidenceReportSchema = z.object({
  newEvidenceSummary: z
    .array(
      z.object({
        evidenceId: z.string().trim().min(1).max(100),
        summary: z.string().trim().min(2).max(500),
      }),
    )
    .max(20),
  largestStrength: z.string().trim().min(2).max(800),
  largestWeakness: z.string().trim().min(2).max(800),
  next90Days: z.array(z.string().trim().min(2).max(500)).min(1).max(6),
  limitations: z.array(z.string().trim().min(2).max(500)).max(8),
});

export const evidenceAnalysisSchema = z.object({
  evaluations: z.array(evidenceEvaluationSchema).max(20),
  report: evidenceReportSchema,
});

export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type EvidenceVerification = z.infer<typeof evidenceVerificationSchema>;
export type ManualEvidenceInput = z.infer<typeof manualEvidenceSchema>;
export type EvidenceEvaluation = z.infer<typeof evidenceEvaluationSchema>;
export type EvidenceReport = z.infer<typeof evidenceReportSchema>;
export type EvidenceAnalysis = z.infer<typeof evidenceAnalysisSchema>;
