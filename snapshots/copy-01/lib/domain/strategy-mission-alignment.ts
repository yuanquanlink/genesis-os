import { z } from "zod";

export const alignmentStateSchema = z.enum(["strongly_aligned", "aligned", "partially_aligned", "unclear", "unrelated", "conflicting"]);
export const alignmentCandidateSchema = z.object({
  strategyId: z.string().uuid(),
  missionId: z.string().uuid().nullable(),
  missionCandidateId: z.string().uuid().nullable(),
  strategyVersionHash: z.string().regex(/^[a-f0-9]{64}$/),
  missionVersionHash: z.string().regex(/^[a-f0-9]{64}$/),
  alignmentState: alignmentStateSchema,
  factors: z.array(z.object({ name: z.string().min(2).max(80), value: z.string().min(1).max(500), status: z.enum(["supported", "missing", "conflicting"]) })).max(16),
  supportingSourceIds: z.array(z.string().min(1).max(120)).max(24),
  conflictingSourceIds: z.array(z.string().min(1).max(120)).max(24),
  limitations: z.array(z.string().min(2).max(500)).min(1).max(8),
  confidence: z.number().min(0).max(0.85),
  status: z.literal("pending"),
  trustClass: z.literal("untrusted"),
  contextEligible: z.literal(false),
});
export const alignmentCreateSchema = z.object({ strategyId: z.string().uuid(), missionId: z.string().uuid().optional(), missionCandidateId: z.string().uuid().optional(), clientRequestId: z.string().uuid() }).superRefine((input, ctx) => {
  if ((input.missionId ? 1 : 0) + (input.missionCandidateId ? 1 : 0) !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["missionId"], message: "exactly_one_mission_source_required" });
});
export type AlignmentCandidate = z.infer<typeof alignmentCandidateSchema>;
