import { z } from "zod";

export const cognitionModuleIdSchema = z.enum([
  "thinking_model",
  "book_intelligence",
  "business_learning",
  "movie_reflection",
]);

export type CognitionModuleId = z.infer<typeof cognitionModuleIdSchema>;

const sourceRefsSchema = z.array(z.string().trim().min(1).max(100)).max(24);
const sharedContent = {
  title: z.string().trim().min(2).max(240),
  whyNow: z.string().trim().min(5).max(1_000),
  coreMechanism: z.string().trim().min(5).max(1_200),
  intuitiveExample: z.string().trim().min(5).max(1_000),
  boundary: z.string().trim().min(5).max(1_000),
  contextConnection: z.string().trim().min(5).max(1_000),
  practicalApplication: z.string().trim().min(5).max(1_000),
  reflectionQuestion: z.string().trim().min(5).max(600),
  sourceStatus: z.enum(["summary_only", "user_provided", "verified_excerpt"]),
  sourceNote: z.string().trim().min(3).max(700),
  shortQuote: z.string().trim().max(180).nullable(),
  sourceRefs: sourceRefsSchema,
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(3).max(500)).min(1).max(8),
};

export const cognitionContentSchema = z.discriminatedUnion("moduleId", [
  z.object({
    moduleId: z.literal("thinking_model"),
    ...sharedContent,
    details: z.object({
      discipline: z.enum(["mathematics", "physics", "economics", "psychology", "behavioral_science", "systems", "probability", "philosophy", "decision_theory", "business_model"]),
      modelName: z.string().trim().min(2).max(180),
      problemSolved: z.string().trim().min(5).max(700),
      todayQuestion: z.string().trim().min(5).max(600),
    }),
  }),
  z.object({
    moduleId: z.literal("book_intelligence"),
    ...sharedContent,
    details: z.object({
      workTitle: z.string().trim().min(1).max(240),
      author: z.string().trim().min(1).max(180),
      recommendedSection: z.string().trim().min(2).max(300),
      coreIdeas: z.array(z.string().trim().min(3).max(500)).min(1).max(5),
      copyrightNote: z.string().trim().min(5).max(600),
    }),
  }),
  z.object({
    moduleId: z.literal("business_learning"),
    ...sharedContent,
    details: z.object({
      company: z.string().trim().min(1).max(220),
      businessModel: z.string().trim().min(3).max(700),
      weeklyTheme: z.string().trim().min(3).max(300),
      decisionQuestion: z.string().trim().min(5).max(700),
      dimensions: z.object({
        userDemand: z.string().trim().min(3).max(500),
        revenue: z.string().trim().min(3).max(500),
        cost: z.string().trim().min(3).max(500),
        moat: z.string().trim().min(3).max(500),
        technology: z.string().trim().min(3).max(500),
        organization: z.string().trim().min(3).max(500),
        risks: z.string().trim().min(3).max(500),
      }),
    }),
  }),
  z.object({
    moduleId: z.literal("movie_reflection"),
    ...sharedContent,
    details: z.object({
      movieTitle: z.string().trim().min(1).max(240),
      releaseYear: z.number().int().min(1888).max(2100).nullable(),
      preWatchQuestions: z.array(z.string().trim().min(5).max(500)).min(2).max(4),
      misreadingRisk: z.string().trim().min(5).max(700),
    }),
  }),
]);

const sharedAnalysis = {
  coreViewpoint: z.string().trim().min(5).max(1_000),
  implicitAssumptions: z.array(z.string().trim().min(3).max(600)).max(6),
  strengths: z.array(z.string().trim().min(3).max(600)).max(6),
  logicalGaps: z.array(z.string().trim().min(3).max(600)).max(6),
  opposingView: z.string().trim().min(5).max(1_000),
  deepAnalysis: z.string().trim().min(5).max(1_400),
  actions: z.array(z.string().trim().min(5).max(600)).min(1).max(3),
  sourceRefs: sourceRefsSchema,
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(3).max(500)).min(1).max(8),
};

export const cognitionReflectionAnalysisSchema = z.discriminatedUnion("moduleId", [
  z.object({ moduleId: z.literal("thinking_model"), ...sharedAnalysis, moduleAnalysis: z.object({ followUpQuestions: z.array(z.string().trim().min(5).max(500)).min(1).max(4) }) }),
  z.object({ moduleId: z.literal("book_intelligence"), ...sharedAnalysis, moduleAnalysis: z.object({ ideaConnections: z.array(z.string().trim().min(3).max(600)).min(1).max(5), copyrightBoundary: z.string().trim().min(5).max(600) }) }),
  z.object({ moduleId: z.literal("business_learning"), ...sharedAnalysis, moduleAnalysis: z.object({ boardFeedback: z.string().trim().min(5).max(1_000), transferablePrinciples: z.array(z.string().trim().min(3).max(600)).min(1).max(5), decisionRisks: z.array(z.string().trim().min(3).max(600)).min(1).max(5) }) }),
  z.object({ moduleId: z.literal("movie_reflection"), ...sharedAnalysis, moduleAnalysis: z.object({ lifeStageConnection: z.string().trim().min(5).max(1_000), misreadingRisks: z.array(z.string().trim().min(3).max(600)).min(1).max(5) }) }),
]);

export const cognitionActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    moduleId: cognitionModuleIdSchema,
    clientRequestId: z.string().uuid(),
    topic: z.string().trim().max(500).default(""),
  }),
  z.object({
    action: z.literal("reflect"),
    itemId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
    reflection: z.string().trim().min(10).max(6_000),
    decision: z.string().trim().max(3_000).default(""),
  }),
]);

export type CognitionContent = z.infer<typeof cognitionContentSchema>;
export type CognitionReflectionAnalysis = z.infer<typeof cognitionReflectionAnalysisSchema>;
export type CognitionAction = z.infer<typeof cognitionActionSchema>;

export type CognitionItemRecord = {
  id: string;
  moduleId: CognitionModuleId;
  periodKey: string;
  clientRequestId: string;
  content: CognitionContent;
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  fallbackReason: string | null;
  createdAt: string;
};

export type CognitionReflectionRecord = {
  id: string;
  itemId: string;
  moduleId: CognitionModuleId;
  clientRequestId: string;
  rawReflection: string;
  decisionText: string;
  sourceEntryId: string;
  analysis: CognitionReflectionAnalysis | null;
  analysisStatus: "pending" | "ready";
  sourceRefs: string[];
  confidence: number;
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  fallbackReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CognitionSnapshot = {
  items: CognitionItemRecord[];
  reflections: CognitionReflectionRecord[];
};
