import { z } from "zod";

export const MASTERY_DECISION_VERSION = "mastery-truth-v1";
export const MASTERY_METADATA_VERSION = "mastery-gate-metadata-v1";
export const MASTERY_AGGREGATE_THRESHOLD = 0.82;

export const masteryGateTypes = [
  "concept",
  "application",
  "transfer",
  "delayed_recall",
  "artifact_project",
  "defense",
  "independence",
  "evidence",
] as const;

export const masteryLifecycleStates = [
  "learning",
  "course_completed",
  "mastery_pending",
  "remediation_required",
  "mastered",
] as const;

export const masteryGateStatusSchema = z.enum([
  "pending",
  "passed",
  "failed",
  "blocked",
  "waiting",
]);
export const masteryGateTypeSchema = z.enum(masteryGateTypes);
export const masteryLifecycleSchema = z.enum(masteryLifecycleStates);

const referenceSchema = z
  .string()
  .trim()
  .min(3)
  .max(240)
  .regex(/^[a-z_]+:[A-Za-z0-9._:-]+$/, "reference must use type:id format");

export const initializeMasterySchema = z
  .object({
    action: z.literal("initialize"),
    goalId: z.string().uuid(),
    pilotSlug: z.enum(["fastapi-backend-engineering-v1", "linear-algebra-ml-core-v1"]),
  })
  .strict();

export const completeCourseSchema = z
  .object({
    action: z.literal("complete_course"),
    goalId: z.string().uuid(),
  })
  .strict();

export const masteryGateAttemptSchema = z
  .object({
    action: z.literal("record_gate_attempt"),
    goalId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
    gateType: masteryGateTypeSchema,
    observedScore: z.number().min(0).max(1),
    evidenceRefs: z.array(referenceSchema).min(1).max(30),
    sourceRefs: z.array(referenceSchema).max(30).default([]),
    notes: z.string().trim().max(2_000).default(""),
  })
  .strict();

export const masteryAssistanceSchema = z
  .object({
    action: z.literal("record_assistance"),
    goalId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
    gateType: masteryGateTypeSchema.optional(),
    phase: z.enum(["learning", "final"]),
    level: z.number().int().min(0).max(5),
    critical: z.boolean().default(false),
    tool: z.string().trim().min(2).max(120),
    detail: z.string().trim().min(2).max(1_000),
  })
  .strict();

export const evaluateMasterySchema = z
  .object({
    action: z.literal("evaluate"),
    goalId: z.string().uuid(),
  })
  .strict();

export const recalibrateMasteryEstimateSchema = z
  .object({
    action: z.literal("recalibrate_estimate"),
    goalId: z.string().uuid(),
  })
  .strict();

export const masteryActionSchema = z.discriminatedUnion("action", [
  initializeMasterySchema,
  completeCourseSchema,
  masteryGateAttemptSchema,
  masteryAssistanceSchema,
  evaluateMasterySchema,
  recalibrateMasteryEstimateSchema,
]);

export type MasteryGateType = z.infer<typeof masteryGateTypeSchema>;
export type MasteryGateStatus = z.infer<typeof masteryGateStatusSchema>;
export type MasteryLifecycle = z.infer<typeof masteryLifecycleSchema>;
export type MasteryAction = z.infer<typeof masteryActionSchema>;

export type MasteryGateEvaluation = {
  gateId: string;
  gateType: MasteryGateType;
  status: MasteryGateStatus;
  required: boolean;
  threshold: number;
  score: number | null;
  weight: number;
  evidenceRefs: string[];
  sourceRefs: string[];
  attemptId: string | null;
  evaluatedAt: string | null;
  evaluatorType: "deterministic";
  failureReason: string | null;
  retryAllowed: boolean;
  nextRetryAt: string | null;
  metadataVersion: string;
};

export type MasteryDecision = {
  overallStatus: "mastery_pending" | "remediation_required" | "mastered";
  aggregateScore: number;
  hardGateSummary: Record<MasteryGateType, MasteryGateStatus>;
  passedGates: MasteryGateType[];
  failedGates: MasteryGateType[];
  missingGates: MasteryGateType[];
  blockedReasons: string[];
  evidenceRefs: string[];
  decisionVersion: string;
  evaluatedAt: string;
};

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The sole certification decision rule. It consumes server-derived gate state;
 * it never consumes a client-supplied mastered flag or an LLM conclusion.
 */
export function evaluateMasteryTruth(input: {
  gates: MasteryGateEvaluation[];
  aggregateThreshold?: number;
  evaluatedAt: string;
  decisionVersion?: string;
}): MasteryDecision {
  const aggregateThreshold = input.aggregateThreshold ?? MASTERY_AGGREGATE_THRESHOLD;
  const suppliedByType = new Map(input.gates.map((gate) => [gate.gateType, gate]));
  const normalized = masteryGateTypes.map((gateType) => suppliedByType.get(gateType) ?? ({
    gateId: `missing-${gateType}`, gateType, status: "pending", required: true, threshold: aggregateThreshold,
    score: null, weight: 1, evidenceRefs: [], sourceRefs: [], attemptId: null, evaluatedAt: null,
    evaluatorType: "deterministic", failureReason: `${gateType} gate has no persisted attempt`, retryAllowed: true,
    nextRetryAt: null, metadataVersion: MASTERY_METADATA_VERSION,
  } satisfies MasteryGateEvaluation));
  const required = normalized.filter((gate) => gate.required);
  const totalWeight = required.reduce((sum, gate) => sum + Math.max(0, gate.weight), 0) || 1;
  const aggregateScore = round(
    required.reduce((sum, gate) => {
      const score = gate.score ?? (gate.status === "passed" ? 1 : 0);
      return sum + Math.max(0, Math.min(1, score)) * Math.max(0, gate.weight);
    }, 0) / totalWeight,
  );
  const passedGates = required.filter((gate) => gate.status === "passed").map((gate) => gate.gateType);
  const failedGates = required.filter((gate) => gate.status === "failed").map((gate) => gate.gateType);
  const missingGates = required
    .filter((gate) => ["pending", "blocked", "waiting"].includes(gate.status))
    .map((gate) => gate.gateType);
  const hardGateSummary = Object.fromEntries(
    masteryGateTypes.map((gateType) => [
      gateType,
      normalized.find((gate) => gate.gateType === gateType)?.status ?? "pending",
    ]),
  ) as Record<MasteryGateType, MasteryGateStatus>;
  const blockedReasons = required
    .filter((gate) => gate.status !== "passed")
    .map((gate) => gate.failureReason || `${gate.gateType} gate is ${gate.status}`);
  if (!missingGates.length && !failedGates.length && aggregateScore < aggregateThreshold)
    blockedReasons.push(`aggregate ${aggregateScore.toFixed(2)} is below ${aggregateThreshold.toFixed(2)}`);

  const overallStatus = failedGates.length || (!missingGates.length && aggregateScore < aggregateThreshold)
    ? "remediation_required"
    : missingGates.length
      ? "mastery_pending"
      : "mastered";

  return {
    overallStatus,
    aggregateScore,
    hardGateSummary,
    passedGates,
    failedGates,
    missingGates,
    blockedReasons,
    evidenceRefs: [...new Set(required.flatMap((gate) => gate.evidenceRefs))],
    decisionVersion: input.decisionVersion ?? MASTERY_DECISION_VERSION,
    evaluatedAt: input.evaluatedAt,
  };
}

export const masteryGateLabels: Record<MasteryGateType, string> = {
  concept: "Concept",
  application: "Application",
  transfer: "Transfer",
  delayed_recall: "Delayed Recall",
  artifact_project: "Artifact / Project",
  defense: "Defense",
  independence: "Independence",
  evidence: "Evidence",
};
