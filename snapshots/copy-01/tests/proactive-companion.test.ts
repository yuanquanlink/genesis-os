import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { EvidenceService } from "@/lib/services/evidence-service";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";

describe("Genesis Proactive Companion foundation", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-proactive-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function counts() {
    const tableCount = (table: string) => Number((repository.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
    return { goals: tableCount("learning_goals"), abilities: tableCount("growth_nodes"), evidence: tableCount("evidence_items"), strategies: tableCount("growth_strategies") };
  }

  it("stores, searches, deduplicates knowledge, and injects only a bounded KB reference into ContextEngine", () => {
    const service = new ProactiveCompanionService(repository);
    const item = { type: "note" as const, content: "FastAPI dependency injection keeps auth and database concerns testable.", source: "FastAPI practice", tags: ["fastapi", "testing"], clientRequestId: randomUUID() };
    expect(service.addKnowledge(item).duplicate).toBe(false);
    expect(service.addKnowledge({ ...item, clientRequestId: randomUUID() }).duplicate).toBe(true);
    expect(service.knowledgeSnapshot("dependency injection").items).toHaveLength(1);
    // A malformed FTS query is still treated as literal user text and never throws.
    expect(service.knowledgeSnapshot('" OR NEAR').items).toEqual([]);

    const packet = new ContextEngine(repository).buildPacket({ currentPage: "/knowledge", currentTask: "mentor context", currentQuestion: "What should I practice?", currentChapter: null, currentConversation: [] });
    const knowledgeEvent = packet.recentEvents.find((event) => event.evidenceIds.some((id) => id.startsWith("KB:")));
    expect(knowledgeEvent?.value).toContain("FastAPI dependency injection");
    expect(packet.recentEvents).toHaveLength(1);
  });

  it("returns an explicit unavailable state until verified Evidence exists", async () => {
    const service = new ProactiveCompanionService(repository);
    const before = counts();
    const result = await service.generate({ action: "generate", clientRequestId: randomUUID() });
    expect(result.unavailable).toContain("已批准证据");
    expect(service.snapshot().insights).toHaveLength(0);
    expect(counts()).toEqual(before);
  });

  it("creates one evidence-linked pending insight per week without changing formal data", async () => {
    const evidence = new EvidenceService(repository);
    evidence.createManual({ action: "create", evidenceType: "project", source: "local FastAPI verification", description: "Implemented a tested FastAPI endpoint with request validation and persisted the test result.", relatedAbility: "Backend engineering", capturedAt: new Date().toISOString(), dataKind: "user", clientRequestId: randomUUID() });
    await evidence.analyze();
    const before = counts();

    const service = new ProactiveCompanionService(repository);
    const first = await service.generate({ action: "generate", clientRequestId: randomUUID() });
    expect(first.duplicate).toBe(false);
    const insight = first.snapshot.insights[0];
    expect(insight.status).toBe("pending");
    expect(insight.mode).toBe("demo");
    expect(insight.insight.evidenceIds.length).toBeGreaterThan(0);
    expect(insight.insight.evidenceIds.length).toBeLessThanOrEqual(4);
    const evidenceIds = repository.db.prepare("SELECT id FROM evidence_items WHERE verification_status='verified'").all() as Array<{ id: string }>;
    expect(evidenceIds.map((row) => row.id)).toEqual(expect.arrayContaining(insight.insight.evidenceIds));
    expect(counts()).toEqual(before);

    const second = await service.generate({ action: "generate", clientRequestId: randomUUID() });
    expect(second.duplicate).toBe(true);
    expect(second.snapshot.insights).toHaveLength(1);
  });
});
