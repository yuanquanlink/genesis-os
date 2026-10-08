import { z } from "zod";
import { orbAgentResultSchema } from "@/lib/domain/orb-agent";

export const orbConversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1_200),
});

export const orbAssistantRequestSchema = z.object({
  message: z.string().trim().min(2, "请输入至少 2 个字").max(2_000),
  currentPath: z.string().trim().max(180).default("/"),
  clientRequestId: z.string().uuid().optional(),
  conversation: z.array(orbConversationTurnSchema).max(8).default([]),
});

export const orbAssistantAnswerSchema = z.object({
  answer: z.string().trim().min(2).max(5_000),
  contextIndicator: z.string().trim().min(2).max(500),
  sourceRefs: z.array(z.string().trim().min(1).max(160)).max(16).default([]),
  suggestedNextActions: z.array(z.string().trim().min(2).max(240)).max(4).default([]),
  limitations: z.array(z.string().trim().min(2).max(300)).min(1).max(6),
  confidence: z.number().min(0).max(1),
  stateBoundary: z.literal("read_only_no_formal_mutation"),
  agent: orbAgentResultSchema.optional(),
});

export const orbAssistantResponseSchema = z.object({
  answer: orbAssistantAnswerSchema,
  meta: z.object({
    provider: z.string(),
    model: z.string(),
    mode: z.enum(["real", "demo"]),
    requestId: z.string().nullable(),
    contextEvidenceCount: z.number().int().nonnegative(),
    approvedProjectionCount: z.number().int().nonnegative(),
    dailySourceRefs: z.array(z.string()).max(16),
    fallbackReason: z.string().nullable(),
  }),
});

export type OrbAssistantRequest = z.infer<typeof orbAssistantRequestSchema>;
export type OrbAssistantAnswer = z.infer<typeof orbAssistantAnswerSchema>;
export type OrbAssistantResponse = z.infer<typeof orbAssistantResponseSchema>;
