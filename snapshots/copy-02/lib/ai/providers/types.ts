import type { z } from "zod";

export type AIProviderId =
  "deepseek" | "openai" | "moonshot" | "gemini" | "anthropic";
export type AITaskClass =
  "high_reasoning" | "long_context" | "cheap_daily" | "coding";
export type AIMode = "demo" | "real";
export type AIReasoningMode = "standard" | "deep";

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIRequest<T = unknown> = {
  module: string;
  taskClass: AITaskClass;
  messages: AIMessage[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** Provider-neutral reasoning preference. Adapters map it to native options. */
  reasoningMode?: AIReasoningMode;
  schema?: z.ZodType<T>;
  schemaName?: string;
};

export type AIUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export type AICompletion<T = unknown> = {
  provider: AIProviderId;
  model: string;
  mode: "real";
  text: string;
  parsed?: T;
  usage: AIUsage;
  latencyMs: number;
  finishReason: string | null;
  requestId: string | null;
};

export type AIStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      provider: AIProviderId;
      model: string;
      usage: AIUsage;
      latencyMs: number;
      finishReason: string | null;
      requestId: string | null;
    };

export interface AIProvider {
  readonly id: AIProviderId;
  isConfigured(): boolean;
  modelFor(taskClass: AITaskClass, requestedModel?: string): string;
  complete<T>(request: AIRequest<T>): Promise<AICompletion<T>>;
  stream(
    request: Omit<AIRequest, "schema" | "schemaName">,
  ): AsyncGenerator<AIStreamEvent>;
}
