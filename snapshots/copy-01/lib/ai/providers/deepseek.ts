import "server-only";
import { fetch as providerFetch, ProxyAgent } from "undici";
import { z } from "zod";
import {
  AIProviderError,
  classifyProviderStatus,
  safeProviderError,
} from "@/lib/ai/providers/errors";
import type {
  AICompletion,
  AIProvider,
  AIRequest,
  AIStreamEvent,
  AITaskClass,
  AIUsage,
} from "@/lib/ai/providers/types";

const completionSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string().nullable().optional() }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .nullable()
    .optional(),
});

const streamChunkSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        delta: z.object({ content: z.string().nullable().optional() }),
      }),
    )
    .default([]),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .nullable()
    .optional(),
});

const taskModels: Record<AITaskClass, string> = {
  cheap_daily: "deepseek-v4-flash",
  high_reasoning: "deepseek-v4-pro",
  long_context: "deepseek-v4-pro",
  coding: "deepseek-v4-pro",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const proxyAgents = new Map<string, ProxyAgent>();
function proxyDispatcher() {
  const url = process.env.AI_HTTPS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!url) return undefined;
  let agent = proxyAgents.get(url);
  if (!agent) { agent = new ProxyAgent(url); proxyAgents.set(url, agent); }
  return agent;
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new AIProviderError("timeout", "DeepSeek 流式响应超时。", true),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class DeepSeekProvider implements AIProvider {
  readonly id = "deepseek" as const;
  private readonly baseUrl = (
    process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  ).replace(/\/$/, "");
  private readonly timeoutMs = Number(
    process.env.AI_REQUEST_TIMEOUT_MS || 30_000,
  );
  private readonly maxRetries = Math.max(
    0,
    Math.min(4, Number(process.env.AI_MAX_RETRIES || 2)),
  );

  isConfigured() {
    return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  }

  modelFor(taskClass: AITaskClass, requestedModel?: string) {
    return requestedModel || process.env.DEFAULT_MODEL || taskModels[taskClass];
  }

  private async request(body: Record<string, unknown>) {
    if (!this.isConfigured())
      throw new AIProviderError(
        "not_configured",
        "DEEPSEEK_API_KEY 未配置。",
        false,
      );
    let lastError: AIProviderError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const url = `${this.baseUrl}/chat/completions`;
        const init = {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        } as const;
        const dispatcher = proxyDispatcher();
        const response = dispatcher
          ? await providerFetch(url, { ...init, dispatcher })
          : await fetch(url, init);
        if (!response.ok) throw classifyProviderStatus(response.status);
        return response;
      } catch (error) {
        lastError = safeProviderError(error);
        if (!lastError.retryable || attempt >= this.maxRetries) throw lastError;
        await sleep(250 * (attempt + 1) ** 2);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw (
      lastError ??
      new AIProviderError("provider_error", "DeepSeek 调用失败。", false)
    );
  }

  async complete<T>(request: AIRequest<T>): Promise<AICompletion<T>> {
    const started = Date.now();
    const model = this.modelFor(request.taskClass, request.model);
    const messages = [...request.messages];
    if (request.schema)
      messages.unshift({
        role: "system",
        content:
          "必须只返回一个符合任务 Schema 的 JSON 对象，不要使用 Markdown 代码块。",
      });
    try {
      const response = await this.request({
        model,
        messages,
        stream: false,
        max_tokens: request.maxOutputTokens ?? 2_000,
        temperature: request.temperature ?? 0.2,
        ...(request.reasoningMode
          ? {
              thinking: {
                type:
                  request.reasoningMode === "deep" ? "enabled" : "disabled",
              },
            }
          : {}),
        ...(request.schema ? { response_format: { type: "json_object" } } : {}),
      });
      const raw = completionSchema.parse(await response.json());
      const text = raw.choices[0].message.content ?? "";
      if (!text)
        throw new AIProviderError(
          "invalid_output",
          "DeepSeek 返回了空内容。",
          false,
        );
      let parsed: T | undefined;
      if (request.schema) {
        try {
          const decoded = JSON.parse(text) as unknown;
          parsed = request.schema.parse(decoded);
        } catch (error) {
          let shape = "non_object";
          try {
            const decoded = JSON.parse(text) as unknown;
            if (decoded && typeof decoded === "object" && !Array.isArray(decoded))
              shape = `object_keys=${Object.keys(decoded).slice(0, 20).join(",")}`;
            else if (Array.isArray(decoded)) shape = "array";
          } catch {
            shape = "invalid_json";
          }
          const issues =
            error instanceof z.ZodError
              ? error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  code: issue.code,
                  message: issue.message,
                }))
              : [{ path: "json", code: "parse_error", message: "Invalid JSON" }];
          console.error(
            `[DeepSeekAdapter] structured output rejected module=${request.module} schema=${request.schemaName || "unnamed"} shape=${shape} issues=${JSON.stringify(issues)}`,
          );
          throw new AIProviderError(
            "invalid_output",
            "DeepSeek JSON 未通过业务 Schema 验证。",
            false,
          );
        }
      }
      return {
        provider: this.id,
        model: raw.model || model,
        mode: "real",
        text,
        parsed,
        usage: {
          inputTokens: raw.usage?.prompt_tokens ?? null,
          outputTokens: raw.usage?.completion_tokens ?? null,
        },
        latencyMs: Date.now() - started,
        finishReason: raw.choices[0].finish_reason ?? null,
        requestId: raw.id ?? null,
      };
    } catch (error) {
      throw safeProviderError(error);
    }
  }

  async *stream(
    request: Omit<AIRequest, "schema" | "schemaName">,
  ): AsyncGenerator<AIStreamEvent> {
    const started = Date.now();
    const model = this.modelFor(request.taskClass, request.model);
    const response = await this.request({
      model,
      messages: request.messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: request.maxOutputTokens ?? 2_000,
      temperature: request.temperature ?? 0.35,
      ...(request.reasoningMode
        ? {
            thinking: {
              type:
                request.reasoningMode === "deep" ? "enabled" : "disabled",
            },
          }
        : {}),
    });
    if (!response.body)
      throw new AIProviderError(
        "provider_error",
        "DeepSeek 流式响应没有正文。",
        false,
      );
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage: AIUsage = { inputTokens: null, outputTokens: null };
    let finishReason: string | null = null;
    let requestId: string | null = null;
    let resolvedModel = model;
    while (true) {
      const { done, value } = await readWithTimeout(reader, this.timeoutMs);
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        const parsedChunk = streamChunkSchema.safeParse(JSON.parse(data));
        if (!parsedChunk.success) {
          console.error("[DeepSeekAdapter] invalid SSE chunk", parsedChunk.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })));
          throw new AIProviderError("invalid_output", "DeepSeek 流式分片未通过 Provider Schema 验证。", false);
        }
        const chunk = parsedChunk.data;
        requestId = chunk.id ?? requestId;
        resolvedModel = chunk.model ?? resolvedModel;
        if (chunk.usage)
          usage = {
            inputTokens: chunk.usage.prompt_tokens ?? null,
            outputTokens: chunk.usage.completion_tokens ?? null,
          };
        for (const choice of chunk.choices) {
          finishReason = choice.finish_reason ?? finishReason;
          if (choice.delta.content)
            yield { type: "delta", text: choice.delta.content };
        }
      }
      if (done) break;
    }
    yield {
      type: "done",
      provider: this.id,
      model: resolvedModel,
      usage,
      latencyMs: Date.now() - started,
      finishReason,
      requestId,
    };
  }
}
