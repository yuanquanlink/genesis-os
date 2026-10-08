import "server-only";
import type { ResearchRepository, ResearchRunRecord } from "@/lib/db/research-repository";
import {
  researchRequestSchema,
  type ResearchConsumer,
  type ResearchRequest,
} from "@/lib/domain/research";
import { ResearchProviderError, safeResearchError } from "@/lib/research/providers/errors";
import type { ResearchProvider } from "@/lib/research/providers/types";
import { TavilyProvider } from "@/lib/research/providers/tavily";

export type ResearchConsumerPacket = {
  runId: string;
  consumer: ResearchConsumer;
  status: "reference_only";
  sources: ResearchRunRecord["sources"];
  boundary: string;
};

export class ResearchEngine {
  constructor(
    private readonly repository: ResearchRepository,
    private readonly provider: ResearchProvider = new TavilyProvider(),
  ) {}

  snapshot() {
    return {
      provider: this.provider.id,
      configured: this.provider.isConfigured(),
      runs: this.repository.list(),
      formalWriteBoundary:
        "Research sources are references only. Evidence, Knowledge, Ability and Mastery remain confirmation-gated.",
    };
  }

  private packet(run: ResearchRunRecord): ResearchConsumerPacket[] {
    return run.consumers.map((consumer) => ({
      runId: run.id,
      consumer,
      status: "reference_only" as const,
      sources: run.sources,
      boundary:
        "The consumer must validate and explicitly accept these sources before any formal write.",
    }));
  }

  async execute(rawInput: unknown) {
    const input = researchRequestSchema.parse(rawInput) as ResearchRequest;
    const existing = this.repository.byClientRequest(input.clientRequestId);
    if (existing && existing.status !== "running")
      return { run: existing, packets: this.packet(existing), duplicate: true };

    const value = "query" in input ? input.query : "topic" in input ? input.topic : input.url;
    const started = this.repository.create({
      clientRequestId: input.clientRequestId,
      operation: input.operation,
      value,
      consumers: input.consumers,
    });
    if (started.duplicate)
      throw new ResearchProviderError(
        "provider_error",
        "An identical research request is already running.",
      );

    try {
      const result = input.operation === "search"
        ? await this.provider.search(input.query, { maxResults: input.maxResults })
        : input.operation === "extract"
          ? await this.provider.extract(input.url)
          : input.operation === "crawl"
            ? await this.provider.crawl(input.url, { maxResults: input.maxResults })
            : await this.provider.research(input.topic);
      const run = this.repository.complete(started.id, result);
      return { run, packets: this.packet(run), duplicate: false };
    } catch (error) {
      const safe = safeResearchError(error);
      this.repository.fail(started.id, safe.code);
      throw safe;
    }
  }
}
