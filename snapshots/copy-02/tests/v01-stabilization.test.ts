import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import { ProfileRepository } from "@/lib/db/repository";
import { DataPortabilityService } from "@/lib/services/data-portability-service";
import { ProfileService } from "@/lib/services/profile-service";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";
import { UsageService } from "@/lib/services/usage-service";

describe("Genesis OS v0.1 stabilization", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-v01-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "source.db"));
  });
  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  it("derives read-only usage metrics from persisted input and redacted AI usage logs", async () => {
    await new ProfileService(repository).submitEntry({ content: "Completed a reviewed Python endpoint and recorded a passing validation test.", category: "project", tags: ["project"], importance: 4, occurredAt: new Date().toISOString(), allowAi: false, clientRequestId: crypto.randomUUID(), dataKind: "user" });
    new EvidenceRepository(repository).syncSources();
    repository.logAi({ purpose: "ai_mentor", provider: "demo", model: "deterministic", mode: "demo", inputTokens: 12, outputTokens: 18, latencyMs: 25, success: false, errorCode: "network" });
    const snapshot = new UsageService(repository).snapshot();
    expect(snapshot.metrics.todayInputs).toBe(1);
    expect(snapshot.metrics.evidenceTotal).toBeGreaterThanOrEqual(1);
    expect(snapshot.metrics.mentorCallsLast7Days).toBe(1);
    expect(snapshot.ai.failedCalls).toBe(1);
    expect(snapshot.ai.providers).toContainEqual(expect.objectContaining({ provider: "demo", calls: expect.any(Number), failures: 1 }));
    expect(snapshot.beta).toEqual(expect.objectContaining({ dailyLoopStreak: expect.any(Number), memoryConfirmationRate: null, mentorActiveDaysLast7: 1 }));
    expect(JSON.stringify(snapshot)).not.toContain("DEEPSEEK_API_KEY");
  });

  it("exports all durable sections and merges a backup without overwriting or duplicating records", async () => {
    await new ProfileService(repository).submitEntry({ content: "Saved a project progress record with its test outcome for durable evidence.", category: "project", tags: ["project"], importance: 4, occurredAt: new Date().toISOString(), allowAi: false, clientRequestId: crypto.randomUUID(), dataKind: "user" });
    new EvidenceRepository(repository).syncSources();
    const service = new DataPortabilityService(repository);
    const backup = service.exportJson();
    const report = service.exportMarkdown();
    expect(backup.format).toBe("genesis-os-backup");
    expect(backup.tables.self_entries).toHaveLength(1);
    expect(backup.tables.evidence_items.length).toBeGreaterThanOrEqual(1);
    expect(backup.tables.growth_nodes).toBeDefined();
    expect(backup.tables.learning_goals).toBeDefined();
    expect(backup.tables.growth_strategies).toBeDefined();
    expect(report).toContain("## Digital Life");
    expect(report).toContain("## Growth Graph");
    expect(report).toContain("## Evidence");
    expect(report).toContain("## Learning History");
    expect(report).toContain("## Strategies");
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      const restoreService = new DataPortabilityService(restored);
      expect(restoreService.preview(backup).records).toBeGreaterThan(0);
      const first = restoreService.import(backup);
      expect(first.inserted).toBeGreaterThan(0);
      expect(restored.db.prepare("SELECT count(*) count FROM self_entries").get()).toEqual({ count: 1 });
      expect(restored.db.prepare("SELECT count(*) count FROM evidence_items").get()).toMatchObject({ count: expect.any(Number) });
      const second = restoreService.import(backup);
      expect(second.inserted).toBe(1);
      expect(restored.db.prepare("SELECT count(*) count FROM self_entries").get()).toEqual({ count: 1 });
      expect(restored.db.prepare("SELECT count(*) count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
    } finally { restored.close(); }
  });

  it("exports knowledge records instead of FTS shadow tables and rebuilds searchable data after import", () => {
    const knowledge = new ProactiveCompanionService(repository);
    knowledge.addKnowledge({ type: "note", content: "SQLite FTS5 keeps a local personal knowledge base searchable.", source: "local note", tags: ["sqlite"], clientRequestId: crypto.randomUUID() });
    const backup = new DataPortabilityService(repository).exportJson();
    expect(backup.tables.knowledge_items).toHaveLength(1);
    expect(Object.keys(backup.tables).some((table) => table.startsWith("knowledge_items_fts"))).toBe(false);

    const restored = new ProfileRepository(path.join(directory, "knowledge-restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      expect(new ProactiveCompanionService(restored).knowledgeSnapshot("FTS5").items).toHaveLength(1);
    } finally {
      restored.close();
    }
  });
});
