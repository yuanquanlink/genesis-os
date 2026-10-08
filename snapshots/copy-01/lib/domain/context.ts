import { z } from "zod";
import { approvedContextProjectionSchema, contextPurposeSchema } from "@/lib/domain/approved-context-projection";

export const contextEvidenceKindSchema = z.enum([
  "confirmed_fact",
  "self_report",
  "system_record",
  "working_memory",
]);

export const contextItemSchema = z.object({
  value: z.string().min(1).max(2_400),
  evidenceIds: z.array(z.string().min(1).max(80)).max(12),
  evidenceKind: contextEvidenceKindSchema,
  confidence: z.number().min(0).max(1),
  occurredAt: z.string().nullable().default(null),
});

export const workingMemorySchema = z.object({
  currentPage: z.string().max(160).default("unknown"),
  currentTask: z.string().max(500).default(""),
  currentQuestion: z.string().max(4_000).default(""),
  currentChapter: z.string().max(500).nullable().default(null),
  currentConversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2_000),
      }),
    )
    .max(12)
    .default([]),
});

export const userContextPacketSchema = z.object({
  identity: z.object({
    school: contextItemSchema.nullable(),
    major: contextItemSchema.nullable(),
    stage: contextItemSchema.nullable(),
    careerGoal: contextItemSchema.nullable(),
  }),
  goals: z.array(contextItemSchema).max(12),
  strengths: z.array(contextItemSchema).max(10),
  weaknesses: z.array(contextItemSchema).max(10),
  currentProjects: z.array(contextItemSchema).max(10),
  learningStatus: z.array(contextItemSchema).max(10),
  recentEvents: z.array(contextItemSchema).max(16),
  verifiedEvidence: z.array(contextItemSchema).max(12),
  growthGraph: z.object({
    abilities: z.array(contextItemSchema).max(20),
    projects: z.array(contextItemSchema).max(16),
    goals: z.array(contextItemSchema).max(16),
    weaknesses: z.array(contextItemSchema).max(16),
  }),
  strategicContext: z.object({ currentStrategy: contextItemSchema.nullable(), ninetyDayGoal: contextItemSchema.nullable(), topAbilityGap: contextItemSchema.nullable(), priorityActions: z.array(contextItemSchema).max(3), avoidActions: z.array(contextItemSchema).max(3), decisionHistory: z.array(contextItemSchema).max(3) }),
  monthlyContext: z.object({ latestReview: contextItemSchema.nullable(), monthlyGoal: contextItemSchema.nullable(), topWeakness: contextItemSchema.nullable(), nextMonthFocus: contextItemSchema.nullable(), recentInsight: contextItemSchema.nullable() }),
  memoryContext: z.object({ longTermGoals: z.array(contextItemSchema).max(6), stablePreferences: z.array(contextItemSchema).max(6), learningPatterns: z.array(contextItemSchema).max(6), projectDirections: z.array(contextItemSchema).max(6), confirmedAbilityTraits: z.array(contextItemSchema).max(6), rankedMemories: z.array(contextItemSchema).max(8) }),
  missionContext: z.object({ activeMissions: z.array(contextItemSchema).max(6), dailyTasks: z.array(contextItemSchema).max(8), recentCompletions: z.array(contextItemSchema).max(5) }),
  dailyContext: z.object({ morningBrief: contextItemSchema.nullable(), activePlan: contextItemSchema.nullable(), planActions: z.array(contextItemSchema).max(4), latestReflection: contextItemSchema.nullable() }),
  approvedContext: z.object({
    purpose: contextPurposeSchema,
    items: z.array(approvedContextProjectionSchema).max(24),
  }),
  mentorRules: z.array(z.string().min(2).max(300)).max(12),
  memory: z.object({
    working: workingMemorySchema,
    recent: z.object({
      inputs: z.array(contextItemSchema).max(8),
      projectProgress: z.array(contextItemSchema).max(8),
      learningRecords: z.array(contextItemSchema).max(8),
      failures: z.array(contextItemSchema).max(8),
      completions: z.array(contextItemSchema).max(8),
    }),
    longTerm: z.object({
      approvedProfile: z.array(contextItemSchema).max(16),
      longTermGoals: z.array(contextItemSchema).max(10),
      values: z.array(contextItemSchema).max(10),
      constraints: z.array(contextItemSchema).max(10),
    }),
  }),
  compressedSummaries: z.object({
    longTermProfile: z.string().max(3_000),
    recentState: z.string().max(3_000),
    importantEvidence: z.string().max(3_000),
  }),
  meta: z.object({
    generatedAt: z.string().datetime(),
    contextVersion: z.literal("genesis-context-v1"),
    characterCount: z.number().int().nonnegative(),
    estimatedTokens: z.number().int().nonnegative(),
    compressed: z.boolean(),
  }),
});

export type ContextItem = z.infer<typeof contextItemSchema>;
export type WorkingMemory = z.input<typeof workingMemorySchema>;
export type NormalizedWorkingMemory = z.output<typeof workingMemorySchema>;
export type UserContextPacket = z.infer<typeof userContextPacketSchema>;
