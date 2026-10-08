import { z } from "zod";

export const researchOperationSchema = z.enum([
  "search",
  "extract",
  "crawl",
  "research",
]);

export const researchConsumerSchema = z.enum([
  "learning",
  "mastery",
  "knowledge",
]);

const commonRequest = {
  clientRequestId: z.string().uuid(),
  consumers: z.array(researchConsumerSchema).min(1).max(3).default([
    "learning",
    "mastery",
    "knowledge",
  ]),
};

export const researchRequestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("search"),
    query: z.string().trim().min(2).max(1_000),
    maxResults: z.number().int().min(1).max(20).default(8),
    ...commonRequest,
  }),
  z.object({
    operation: z.literal("extract"),
    url: z.string().url().max(2_048),
    ...commonRequest,
  }),
  z.object({
    operation: z.literal("crawl"),
    url: z.string().url().max(2_048),
    maxResults: z.number().int().min(1).max(20).default(10),
    ...commonRequest,
  }),
  z.object({
    operation: z.literal("research"),
    topic: z.string().trim().min(2).max(1_000),
    ...commonRequest,
  }),
]);

export const researchSourceSchema = z.object({
  source: z.literal("tavily"),
  title: z.string().trim().min(1).max(500),
  url: z.string().url().max(2_048),
  summary: z.string().trim().min(1).max(20_000),
  relevanceScore: z.number().min(0).max(1),
  retrievedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable().default(null),
  sourceType: z.enum(["web", "documentation", "article", "repository", "course", "unknown"]).default("web"),
});

export const researchResultSchema = z.object({
  provider: z.literal("tavily"),
  operation: researchOperationSchema,
  requestId: z.string().nullable(),
  answer: z.string().trim().max(20_000).nullable(),
  sources: z.array(researchSourceSchema).max(50),
  latencyMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type ResearchOperation = z.infer<typeof researchOperationSchema>;
export type ResearchConsumer = z.infer<typeof researchConsumerSchema>;
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type ResearchResult = z.infer<typeof researchResultSchema>;
