import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIRouter } from "@/lib/ai/router";
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek";

const original = {
  key: process.env.DEEPSEEK_API_KEY,
  provider: process.env.MODEL_PROVIDER,
  model: process.env.DEFAULT_MODEL,
  retries: process.env.AI_MAX_RETRIES,
  timeout: process.env.AI_REQUEST_TIMEOUT_MS,
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries({
    DEEPSEEK_API_KEY: original.key,
    MODEL_PROVIDER: original.provider,
    DEFAULT_MODEL: original.model,
    AI_MAX_RETRIES: original.retries,
    AI_REQUEST_TIMEOUT_MS: original.timeout,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("AI Provider router", () => {
  it("keeps the application in explicit Demo mode without a provider key", () => {
    process.env.DEEPSEEK_API_KEY = "";
    process.env.MODEL_PROVIDER = "deepseek";
    const router = new AIRouter();
    expect(router.selectedProviderId).toBe("deepseek");
    expect(router.mode()).toBe("demo");
  });

  it("switches adapters through configuration without changing business calls", () => {
    process.env.DEEPSEEK_API_KEY = "test-only";
    const deepseek = new AIRouter("deepseek");
    expect(deepseek.mode()).toBe("real");
    expect(() => new AIRouter("moonshot")).toThrow(/服务提供方尚未安装适配器/);
  });

  it("validates DeepSeek structured output with the business Zod schema", async () => {
    process.env.DEEPSEEK_API_KEY = "test-only";
    process.env.DEFAULT_MODEL = "deepseek-v4-flash";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "req-1",
            model: "deepseek-v4-flash",
            choices: [
              {
                finish_reason: "stop",
                message: { content: '{"answer":"通过"}' },
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 3 },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );
    const schema = z.object({ answer: z.literal("通过") });
    const result = await new DeepSeekProvider().complete({
      module: "test",
      taskClass: "cheap_daily",
      messages: [{ role: "user", content: "test" }],
      schema,
      schemaName: "test",
      reasoningMode: "standard",
    });
    expect(result.parsed).toEqual({ answer: "通过" });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(result.requestId).toBe("req-1");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("rejects provider JSON that does not pass the requested business schema", async () => {
    process.env.DEEPSEEK_API_KEY = "test-only";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "req-invalid", model: "deepseek-v4-flash", choices: [{ finish_reason: "stop", message: { content: '{"answer":123}' } }] }), { status: 200 })));
    await expect(new DeepSeekProvider().complete({ module: "test", taskClass: "cheap_daily", messages: [{ role: "user", content: "test" }], schema: z.object({ answer: z.string() }) })).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("retries retryable provider failures and consumes real SSE deltas", async () => {
    process.env.DEEPSEEK_API_KEY = "test-only";
    process.env.DEFAULT_MODEL = "deepseek-v4-flash";
    process.env.AI_MAX_RETRIES = "1";
    const sse =
      'data: {"id":"req-stream","model":"deepseek-v4-flash","choices":[{"finish_reason":null,"delta":{"content":"你"}}]}\n\ndata: {"id":"req-stream","model":"deepseek-v4-flash","choices":[{"finish_reason":"stop","delta":{"content":"好"}}],"usage":{"prompt_tokens":8,"completion_tokens":2}}\n\ndata: [DONE]\n\n';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(sse, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const events = [];
    for await (const part of new DeepSeekProvider().stream({
      module: "test",
      taskClass: "cheap_daily",
      messages: [{ role: "user", content: "test" }],
    }))
      events.push(part);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      events
        .filter((item) => item.type === "delta")
        .map((item) => (item.type === "delta" ? item.text : ""))
        .join(""),
    ).toBe("你好");
    expect(events.at(-1)).toMatchObject({
      type: "done",
      requestId: "req-stream",
      usage: { inputTokens: 8, outputTokens: 2 },
    });
  });

  it("aborts a stalled provider request at the configured timeout without exposing secrets", async () => {
    process.env.DEEPSEEK_API_KEY = "test-only";
    process.env.AI_REQUEST_TIMEOUT_MS = "5";
    process.env.AI_MAX_RETRIES = "0";
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    await expect(new DeepSeekProvider().complete({
      module: "timeout-test", taskClass: "cheap_daily", messages: [{ role: "user", content: "test" }],
    })).rejects.toMatchObject({ code: "timeout" });
  });
});
