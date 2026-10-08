import { z } from "zod";

export const integrityCleanupRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview") }),
  z.object({
    action: z.literal("apply"),
    confirmation: z.literal("REPAIR_NONFORMAL_RECORDS"),
  }),
]);

export type IntegrityIssueKind =
  | "invalid_candidate"
  | "duplicate_candidate"
  | "orphan_candidate_source"
  | "orphan_evidence_source"
  | "formal_reference_warning";

export type IntegrityIssue = {
  id: string;
  kind: IntegrityIssueKind;
  entityType: "strategy_candidate" | "mission_candidate" | "memory_candidate" | "daily_plan_candidate" | "evidence" | "mission" | "strategy" | "memory";
  entityId: string;
  detail: string;
  repairable: boolean;
};

export type IntegritySnapshot = {
  generatedAt: string;
  issues: IntegrityIssue[];
  summary: Record<IntegrityIssueKind, number>;
  pendingCandidates: Array<{ entityType: IntegrityIssue["entityType"]; total: number; olderThanSevenDays: number; oldestCreatedAt: string | null }>;
  safetyNote: string;
};
