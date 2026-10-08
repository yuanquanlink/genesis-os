import { z } from "zod";

export const memoryTypeSchema = z.enum([
  "long_term_goal",
  "stable_preference",
  "learning_pattern",
  "project_direction",
  "confirmed_ability_trait",
]);

export const memoryCandidateSchema = z.object({
  memoryType: memoryTypeSchema,
  content: z.string().min(8).max(600),
  reasoning: z.string().min(12).max(700),
  sourceKnowledgeIds: z.array(z.string().uuid()).min(1).max(8),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export const memoryConsolidationSchema = z.object({
  candidates: z.array(memoryCandidateSchema).min(1).max(5),
  limitations: z.array(z.string().min(4).max(400)).min(1).max(5),
});

export const personalMemoryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("consolidate"), clientRequestId: z.string().uuid() }),
  z.object({ action: z.literal("approve"), candidateId: z.string().uuid() }),
  z.object({ action: z.literal("reject"), candidateId: z.string().uuid(), reason: z.string().min(2).max(500).default("User rejected this memory candidate.") }),
]);

export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;
export type MemoryConsolidation = z.infer<typeof memoryConsolidationSchema>;

export type RankableMemory = {
  id: string;
  content: string;
  importance: number;
  confidence: number;
  occurredAt: string;
  sourceKind: "confirmed_memory" | "raw_knowledge";
};

function relevance(content: string, query: string) {
  const terms = query.toLocaleLowerCase("zh-CN").trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  const normalized = content.toLocaleLowerCase("zh-CN");
  return terms.filter((term) => normalized.includes(term)).length / terms.length;
}

function recency(occurredAt: string) {
  const stamp = Date.parse(occurredAt);
  if (Number.isNaN(stamp)) return 0;
  const days = Math.max(0, (Date.now() - stamp) / 86_400_000);
  return Math.max(0, 1 - days / 730);
}

export function rankMemories(records: RankableMemory[], query = "") {
  return records
    .map((record) => ({
      ...record,
      score: Number((0.45 * relevance(record.content, query) + 0.25 * recency(record.occurredAt) + 0.2 * record.importance + 0.1 * record.confidence).toFixed(4)),
    }))
    .sort((left, right) => right.score - left.score || right.occurredAt.localeCompare(left.occurredAt));
}
