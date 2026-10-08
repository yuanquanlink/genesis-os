import { z } from "zod";

export const betaFeedbackTypeSchema = z.enum(["issue", "suggestion", "difficulty"]);
export const betaFeedbackStatusSchema = z.enum(["pending", "reviewed", "resolved"]);

export const betaFeedbackInputSchema = z.object({
  feedbackType: betaFeedbackTypeSchema,
  content: z.string().trim().min(8).max(2_000),
  clientRequestId: z.string().uuid(),
});

export type BetaFeedbackInput = z.infer<typeof betaFeedbackInputSchema>;

export const betaFeedbackTransitionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["reviewed", "resolved"]),
});

export type BetaFeedbackTransition = z.infer<typeof betaFeedbackTransitionSchema>;
