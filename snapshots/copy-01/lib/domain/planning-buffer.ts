import { z } from "zod";

export const planningCandidateCategorySchema = z.enum([
  "idea",
  "wish",
  "unfinished_plan",
  "future_goal",
  "opportunity",
  "other",
]);

export const planningCandidateSourceSchema = z.enum([
  "owner_input",
  "orb",
  "self_input",
  "knowledge",
  "imported",
]);

export const planningCandidateStatusSchema = z.enum([
  "captured",
  "analyzing",
  "candidate_plan_ready",
  "approved",
  "archived",
]);

export const planningCandidateApprovalStateSchema = z.enum(["pending", "approved"]);

export const planningCandidateInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(4).max(5_000),
  category: planningCandidateCategorySchema,
  source: planningCandidateSourceSchema.default("owner_input"),
  clientRequestId: z.string().uuid(),
});

export const planningCandidateTransitionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "archive", "reopen"]),
  clientRequestId: z.string().uuid(),
});

export type PlanningCandidateCategory = z.infer<typeof planningCandidateCategorySchema>;
export type PlanningCandidateSource = z.infer<typeof planningCandidateSourceSchema>;
export type PlanningCandidateStatus = z.infer<typeof planningCandidateStatusSchema>;
export type PlanningCandidateApprovalState = z.infer<typeof planningCandidateApprovalStateSchema>;
export type PlanningCandidateInput = z.infer<typeof planningCandidateInputSchema>;
export type PlanningCandidateTransition = z.infer<typeof planningCandidateTransitionSchema>;

