import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AIProviderError, safeProviderError } from "@/lib/ai/providers/errors";
import type {
  AICompletion,
  AIProvider,
  AIRequest,
  AIStreamEvent,
  AITaskClass,
} from "@/lib/ai/providers/types";

const taskModels: Record<AITaskClass, string> = {
  cheap_daily: "gpt-5.6-luna",
  high_reasoning: "gpt-5.6-terra",
  long_context: "gpt-5.6-terra",
  coding: "gpt-5.6-terra",
};

export class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }
  modelFor(taskClass: AITaskClass, requestedModel?: string) {
    return (
      requestedModel ||
      (taskClass === "cheap_daily"
        ? process.env.OPENAI_MODEL_FAST
        : process.env.OPENAI_MODEL_DEEP) ||
      taskModels[taskClass]
    );
  }
  private client() {
    if (!this.isConfigured())
      throw new AIProviderError(
        "not_configured",
        "OPENAI_API_KEY 未配置。",
        false,
      );
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(
        process.env.AI_REQUEST_TIMEOUT_MS ||
          process.env.OPENAI_REQUEST_TIMEOUT_MS ||
          30_000,
      ),
      maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
    });
  }
  async complete<T>(request: AIRequest<T>): Promise<AICompletion<T>> {
    const started = Date.now();
    const model = this.modelFor(request.taskClass, request.model);
    try {
      const system = request.messages
        .filter((item) => item.role === "system")
        .map((item) => item.content)
        .join("\n");
      const input = request.messages
        .filter((item) => item.role !== "system")
        .map((item) => ({ role: item.role, content: item.content }));
      if (request.schema) {
        const response = await this.client().responses.parse({
          model,
          store: false,
          max_output_tokens: request.maxOutputTokens ?? 2_000,
          instructions: system,
          input,
          text: {
            format: zodTextFormat(
              request.schema,
              request.schemaName || "structured_output",
            ),
          },
        });
        if (!response.output_parsed)
          throw new AIProviderError(
            "invalid_output",
            "OpenAI 返回了空结构。",
            false,
          );
        return {
          provider: this.id,
          model,
          mode: "real",
          text: response.output_text,
          parsed: response.output_parsed as T,
          usage: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null,
          },
          latencyMs: Date.now() - started,
          finishReason: null,
          requestId: response.id,
        };
      }
      const response = await this.client().responses.create({
        model,
        store: false,
        max_output_tokens: request.maxOutputTokens ?? 2_000,
        instructions: system,
        input,
      });
      return {
        provider: this.id,
        model,
        mode: "real",
        text: response.output_text,
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
        },
        latencyMs: Date.now() - started,
        finishReason: null,
        requestId: response.id,
      };
    } catch (error) {
      throw safeProviderError(error);
    }
  }
  async *stream(
    request: Omit<AIRequest, "schema" | "schemaName">,
  ): AsyncGenerator<AIStreamEvent> {
    const result = await this.complete(request);
    yield { type: "delta", text: result.text };
    yield {
      type: "done",
      provider: this.id,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
      finishReason: result.finishReason,
      requestId: result.requestId,
    };
  }
}
