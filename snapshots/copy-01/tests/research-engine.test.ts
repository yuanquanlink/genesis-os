import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { ResearchRepository } from "@/lib/db/research-repository";
import type { ResearchResult } from "@/lib/domain/research";
import { ResearchProviderError } from "@/lib/research/providers/errors";
import type { ResearchProvider } from "@/lib/research/providers/types";
import { ResearchEngine } from "@/lib/services/research-engine";

const fixedResult: ResearchResult = {
  provider: "tavily",
  operation: "search",
  requestId: "provider-request-1",
  answer: "Prefer official documentation and validate with a project.",
  sources: [{
    source: "tavily",
    title: "FastAPI Official Tutorial",
    url: "https://fastapi.tiangolo.com/tutorial/",
    summary: "The official tutorial covers the supported framework workflow.",
    sourceType: "documentation",
    relevanceScore: 0.97,
    retrievedAt: "2026-08-10T02:00:00.000Z",
    publishedAt: null,
  }],
  latencyMs: 42,
  createdAt: "2026-08-10T02:00:00.000Z",
};

describe("Research Engine integration", () => {
  let directory: string;
  let profile: ProfileRepository;
  let repository: ResearchRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-research-"));
    profile = new ProfileRepository(path.join(directory, "research.db"));
    repository = new ResearchRepository(profile);
  });

  afterEach(() => {
    profile.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("persists traceable sources and exposes reference-only consumer packets", async () => {
    const provider: ResearchProvider = {
      id: "tavily",
      isConfigured: () => true,
      search: vi.fn().mockResolvedValue(fixedResult),
      extract: vi.fn(),
      crawl: vi.fn(),
      research: vi.fn(),
    };
    const engine = new ResearchEngine(repository, provider);
    const formalCountsBefore = profile.db.prepare(
      "SELECT (SELECT count(*) FROM evidence_items) evidence_count,(SELECT count(*) FROM growth_nodes) growth_count,(SELECT count(*) FROM mastery_certifications) mastery_count,(SELECT count(*) FROM knowledge_items) knowledge_count",
    ).get();

    const result = await engine.execute({
      operation: "search",
      clientRequestId: "7a90baad-b984-40ef-a45f-02dcdbfdd917",
      query: "FastAPI official learning resources",
      maxResults: 5,
      consumers: ["learning", "mastery", "knowledge"],
    });

    expect(result.run).toMatchObject({
      status: "completed",
      providerRequestId: "provider-request-1",
      answer: "Prefer official documentation and validate with a project.",
    });
    expect(result.run.sources[0]).toMatchObject({
      source: "tavily",
      title: "FastAPI Official Tutorial",
      relevanceScore: 0.97,
    });
    expect(result.packets).toHaveLength(3);
    expect(result.packets.every((packet) => packet.status === "reference_only")).toBe(true);
    expect(profile.db.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 1 });
    expect(profile.db.prepare("SELECT count(*) count FROM research_sources").get()).toEqual({ count: 1 });
    expect(profile.db.prepare(
      "SELECT (SELECT count(*) FROM evidence_items) evidence_count,(SELECT count(*) FROM growth_nodes) growth_count,(SELECT count(*) FROM mastery_certifications) mastery_count,(SELECT count(*) FROM knowledge_items) knowledge_count",
    ).get()).toEqual(formalCountsBefore);
  });

  it("is idempotent and does not call the provider twice", async () => {
    const search = vi.fn().mockResolvedValue(fixedResult);
    const provider = {
      id: "tavily", isConfigured: () => true, search,
      extract: vi.fn(), crawl: vi.fn(), research: vi.fn(),
    } as ResearchProvider;
    const engine = new ResearchEngine(repository, provider);
    const request = {
      operation: "search",
      clientRequestId: "6e2e6353-8d3f-41d4-9db8-c8b8eb8eb8f0",
      query: "FastAPI sources",
      consumers: ["learning"],
    };
    await engine.execute(request);
    const duplicate = await engine.execute(request);
    expect(duplicate.duplicate).toBe(true);
    expect(search).toHaveBeenCalledOnce();
  });

  it("persists an honest failure without fabricating sources or formal data", async () => {
    const provider = {
      id: "tavily", isConfigured: () => true,
      search: vi.fn().mockRejectedValue(new ResearchProviderError("timeout", "timeout", true)),
      extract: vi.fn(), crawl: vi.fn(), research: vi.fn(),
    } as ResearchProvider;
    const engine = new ResearchEngine(repository, provider);
    await expect(engine.execute({
      operation: "search",
      clientRequestId: "b80a39bf-f113-4c39-a799-4d709e1c76bc",
      query: "unavailable research",
      consumers: ["mastery"],
    })).rejects.toMatchObject({ code: "timeout" });
    const snapshot = engine.snapshot();
    expect(snapshot.runs[0]).toMatchObject({ status: "failed", errorCode: "timeout", sources: [] });
    expect(profile.db.prepare("SELECT count(*) count FROM evidence_items").get()).toEqual({ count: 0 });
  });
});
