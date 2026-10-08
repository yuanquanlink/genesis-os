import "server-only";
import { z } from "zod";
import {
  researchResultSchema,
  type ResearchOperation,
  type ResearchResult,
  type ResearchSource,
} from "@/lib/domain/research";
import {
  classifyResearchStatus,
  ResearchProviderError,
  safeResearchError,
} from "@/lib/research/providers/errors";
import type {
  CrawlOptions,
  ResearchProvider,
  SearchOptions,
} from "@/lib/research/providers/types";
import { readResearchConfig, warnIfResearchProviderMissing } from "@/lib/research/config";

const providerItemSchema = z.object({
  title: z.string().optional(),
  url: z.string().url(),
  content: z.string().optional(),
  raw_content: z.string().nullable().optional(),
  score: z.number().optional(),
  relevance_score: z.number().optional(),
  published_date: z.string().optional(),
});

const providerResponseSchema = z.object({
  request_id: z.string().optional(),
  id: z.string().optional(),
  status: z.string().optional(),
  answer: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  response: z.string().nullable().optional(),
  results: z.array(providerItemSchema).optional(),
  sources: z.array(providerItemSchema).optional(),
  data: z.array(providerItemSchema).optional(),
});

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type TavilyProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  researchPollIntervalMs?: number;
  researchMaxPolls?: number;
  researchModel?: "mini" | "pro";
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assertRemoteTarget(value: string) {
  const url = new URL(value);
  if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password)
    throw new ResearchProviderError("invalid_request", "Research URL must be a public HTTP(S) URL.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^(fc|fd|fe80):/i.test(host)
  )
    throw new ResearchProviderError("invalid_request", "Private research URLs are not allowed.");
  return url.toString();
}

function dateOrNull(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function sourceTypeFor(url: string) {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("github.com")) return "repository" as const;
  if (host.includes("docs.") || host.includes("documentation")) return "documentation" as const;
  if (host.includes("coursera") || host.includes("edx.org")) return "course" as const;
  return "web" as const;
}

export class TavilyProvider implements ResearchProvider {
  readonly id = "tavily" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly researchPollIntervalMs: number;
  private readonly researchMaxPolls: number;
  private readonly researchModel: "mini" | "pro";
  private readonly fetchImplementation: FetchImplementation;
  private readonly now: () => Date;

  constructor(options: TavilyProviderOptions = {}) {
    const config = options.apiKey !== undefined
      ? readResearchConfig({
          TAVILY_API_KEY: options.apiKey,
          TAVILY_BASE_URL: options.baseUrl,
          RESEARCH_REQUEST_TIMEOUT_MS: options.timeoutMs?.toString(),
          RESEARCH_MAX_RETRIES: options.maxRetries?.toString(),
          RESEARCH_POLL_INTERVAL_MS: options.researchPollIntervalMs?.toString(),
          RESEARCH_MAX_POLLS: options.researchMaxPolls?.toString(),
          TAVILY_RESEARCH_MODEL: options.researchModel,
        })
      : warnIfResearchProviderMissing();
    this.apiKey = options.apiKey ?? config.apiKey;
    this.baseUrl = options.baseUrl ?? config.baseUrl;
    this.timeoutMs = options.timeoutMs ?? config.timeoutMs;
    this.maxRetries = options.maxRetries ?? config.maxRetries;
    this.researchPollIntervalMs = options.researchPollIntervalMs ?? config.researchPollIntervalMs;
    this.researchMaxPolls = options.researchMaxPolls ?? config.researchMaxPolls;
    this.researchModel = options.researchModel ?? config.researchModel;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  isConfigured() {
    return Boolean(this.apiKey.trim());
  }

  private async request(path: string, init: RequestInit) {
    if (!this.isConfigured())
      throw new ResearchProviderError(
        "not_configured",
        "TAVILY_API_KEY is not configured.",
      );
    let lastError: ResearchProviderError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...init.headers,
          },
        });
        if (!response.ok) throw classifyResearchStatus(response.status);
        return providerResponseSchema.parse(await response.json());
      } catch (error) {
        lastError = safeResearchError(error);
        if (!lastError.retryable || attempt >= this.maxRetries) throw lastError;
        await sleep(200 * (attempt + 1));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError ?? new ResearchProviderError("provider_error", "Tavily request failed.");
  }

  private normalize(
    operation: ResearchOperation,
    raw: z.infer<typeof providerResponseSchema>,
    started: number,
  ): ResearchResult {
    const retrievedAt = this.now().toISOString();
    const unique = new Map<string, ResearchSource>();
    for (const item of raw.results ?? raw.sources ?? raw.data ?? []) {
      const summary = (item.content ?? item.raw_content ?? (
        operation === "research"
          ? "Tavily cited this source but did not return a source-specific excerpt."
          : ""
      )).trim();
      if (!summary) continue;
      const source: ResearchSource = {
        source: "tavily",
        title: (item.title || new URL(item.url).hostname).trim().slice(0, 500),
        url: item.url,
        summary: summary.slice(0, 20_000),
        relevanceScore: Math.max(0, Math.min(1, item.score ?? item.relevance_score ?? 0.5)),
        retrievedAt,
        publishedAt: dateOrNull(item.published_date),
        sourceType: sourceTypeFor(item.url),
      };
      const current = unique.get(source.url);
      if (!current || source.relevanceScore > current.relevanceScore)
        unique.set(source.url, source);
    }
    return researchResultSchema.parse({
      provider: "tavily",
      operation,
      requestId: raw.request_id ?? raw.id ?? null,
      answer: raw.answer ?? raw.content ?? raw.response ?? null,
      sources: [...unique.values()].sort((a, b) => b.relevanceScore - a.relevanceScore),
      latencyMs: Math.max(0, Date.now() - started),
      createdAt: retrievedAt,
    });
  }

  async search(query: string, options: SearchOptions = {}) {
    const started = Date.now();
    const raw = await this.request("/search", {
      method: "POST",
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        max_results: options.maxResults ?? 8,
        include_answer: true,
        include_raw_content: false,
      }),
    });
    return this.normalize("search", raw, started);
  }

  async extract(url: string) {
    const started = Date.now();
    const raw = await this.request("/extract", {
      method: "POST",
      body: JSON.stringify({ urls: [assertRemoteTarget(url)] }),
    });
    return this.normalize("extract", raw, started);
  }

  async crawl(url: string, options: CrawlOptions = {}) {
    const started = Date.now();
    const raw = await this.request("/crawl", {
      method: "POST",
      body: JSON.stringify({
        url: assertRemoteTarget(url),
        max_depth: 2,
        limit: options.maxResults ?? 10,
        extract_depth: "advanced",
      }),
    });
    return this.normalize("crawl", raw, started);
  }

  async research(topic: string) {
    const started = Date.now();
    let raw = await this.request("/research", {
      method: "POST",
      body: JSON.stringify({ input: topic, model: this.researchModel }),
    });
    const id = raw.request_id ?? raw.id;
    for (let poll = 0; id && raw.status && !["completed", "failed"].includes(raw.status.toLowerCase()); poll += 1) {
      if (poll >= this.researchMaxPolls)
        throw new ResearchProviderError("timeout", "Tavily research did not finish before the polling limit.", true);
      if (this.researchPollIntervalMs) await sleep(this.researchPollIntervalMs);
      raw = await this.request(`/research/${encodeURIComponent(id)}`, { method: "GET" });
    }
    if (raw.status?.toLowerCase() === "failed")
      throw new ResearchProviderError("provider_error", "Tavily research failed.");
    return this.normalize("research", raw, started);
  }
}
