import { afterEach, describe, expect, it, vi } from "vitest";
import { TavilyProvider } from "@/lib/research/providers/tavily";

afterEach(() => vi.restoreAllMocks());

describe("Tavily Research Provider", () => {
  it("normalizes, deduplicates and ranks search sources", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      request_id: "tavily-search-1",
      answer: "Use the official documentation as the primary source.",
      results: [
        { title: "FastAPI docs", url: "https://fastapi.tiangolo.com/tutorial/", content: "Official tutorial.", score: 0.98 },
        { title: "Duplicate", url: "https://fastapi.tiangolo.com/tutorial/", content: "Lower-ranked duplicate.", score: 0.4 },
        { title: "Python docs", url: "https://docs.python.org/3/", content: "Language reference.", score: 0.76 },
      ],
    }), { status: 200 }));
    const provider = new TavilyProvider({
      apiKey: "test-key-not-real",
      fetchImplementation,
      now: () => new Date("2026-08-10T01:00:00.000Z"),
      maxRetries: 0,
    });

    const result = await provider.search("FastAPI official learning resources", { maxResults: 5 });

    expect(result).toMatchObject({
      provider: "tavily",
      operation: "search",
      requestId: "tavily-search-1",
      answer: "Use the official documentation as the primary source.",
    });
    expect(result.sources.map((source) => source.url)).toEqual([
      "https://fastapi.tiangolo.com/tutorial/",
      "https://docs.python.org/3/",
    ]);
    expect(result.sources[0]).toMatchObject({
      source: "tavily",
      title: "FastAPI docs",
      relevanceScore: 0.98,
      retrievedAt: "2026-08-10T01:00:00.000Z",
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key-not-real" }),
      }),
    );
  });

  it("supports extract, crawl and asynchronous research endpoints", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ url: "https://example.com/docs", raw_content: "Extracted documentation." }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ title: "Child", url: "https://example.com/docs/child", content: "Crawled child page.", score: 0.8 }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: "research-1", status: "pending" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        request_id: "research-1",
        status: "completed",
        response: "Research synthesis.",
        sources: [{ title: "Primary", url: "https://example.com/primary", score: 0.9 }],
      }), { status: 200 }));
    const provider = new TavilyProvider({
      apiKey: "test-key-not-real",
      fetchImplementation,
      researchPollIntervalMs: 0,
      maxRetries: 0,
    });

    expect((await provider.extract("https://example.com/docs")).operation).toBe("extract");
    expect((await provider.crawl("https://example.com/docs")).sources[0].title).toBe("Child");
    const research = await provider.research("reliable FastAPI learning path");
    expect(research).toMatchObject({
      operation: "research",
      requestId: "research-1",
      answer: "Research synthesis.",
    });
    expect(research.sources[0]).toMatchObject({
      title: "Primary",
      summary: "Tavily cited this source but did not return a source-specific excerpt.",
    });
    expect(fetchImplementation.mock.calls.map((call) => call[0])).toEqual([
      "https://api.tavily.com/extract",
      "https://api.tavily.com/crawl",
      "https://api.tavily.com/research",
      "https://api.tavily.com/research/research-1",
    ]);
    expect(JSON.parse(String(fetchImplementation.mock.calls[2][1]?.body))).toMatchObject({ model: "mini" });
  });

  it("fails explicitly without a key and rejects private target URLs", async () => {
    const unconfigured = new TavilyProvider({ apiKey: "", fetchImplementation: vi.fn() });
    await expect(unconfigured.search("test query")).rejects.toMatchObject({ code: "not_configured" });

    const configured = new TavilyProvider({ apiKey: "test-key-not-real", fetchImplementation: vi.fn() });
    await expect(configured.extract("http://127.0.0.1/private")).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("retries transient failures and returns a safe provider error", async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const provider = new TavilyProvider({
      apiKey: "test-key-not-real",
      fetchImplementation,
      maxRetries: 1,
    });
    await expect(provider.search("retry query")).resolves.toMatchObject({ sources: [] });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("classifies malformed provider JSON as invalid output", async () => {
    const provider = new TavilyProvider({
      apiKey: "test-key-not-real",
      fetchImplementation: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        results: [{ title: "Missing URL", content: "Cannot be traced." }],
      }), { status: 200 })),
      maxRetries: 0,
    });
    await expect(provider.search("malformed response")).rejects.toMatchObject({
      code: "invalid_output",
      retryable: false,
    });
  });
});
