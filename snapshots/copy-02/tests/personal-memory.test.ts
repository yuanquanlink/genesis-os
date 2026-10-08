import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { rankMemories } from "@/lib/domain/personal-memory";
import { ProfileRepository } from "@/lib/db/repository";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";
import { PersonalMemoryService } from "@/lib/services/personal-memory-service";

describe("Genesis Personal Memory Intelligence", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-personal-memory-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function formalCounts() {
    const count = (table: string) => Number((repository.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
    return { goals: count("learning_goals"), abilities: count("growth_nodes"), evidence: count("evidence_items"), strategies: count("growth_strategies") };
  }

  function addRawKnowledge() {
    const knowledge = new ProactiveCompanionService(repository);
    knowledge.addKnowledge({ type: "project", content: "I want to keep deepening FastAPI backend delivery through tested, documented project work.", source: "weekly project reflection", tags: ["fastapi", "backend"], clientRequestId: randomUUID() });
  }

  it("keeps raw knowledge as a pending candidate until user confirmation, then creates long-term memory without changing formal growth data", async () => {
    addRawKnowledge();
    const service = new PersonalMemoryService(repository);
    const before = formalCounts();
    const first = await service.consolidate(randomUUID());
    expect(first.created).toBeGreaterThan(0);
    const snapshot = service.snapshot();
    const candidate = snapshot.candidates.find((item) => item.status === "pending");
    expect(candidate?.sourceKnowledgeIds.length).toBeGreaterThan(0);
    expect(snapshot.profile).toHaveLength(0);
    expect(formalCounts()).toEqual(before);

    const approved = service.approve(candidate!.id);
    expect(approved.snapshot.profile).toHaveLength(1);
    expect(approved.snapshot.candidates.find((item) => item.id === candidate!.id)?.status).toBe("approved");
    expect(formalCounts()).toEqual(before);
    expect(() => service.approve(candidate!.id)).toThrow("MEMORY_CANDIDATE_NOT_PENDING");
  });

  it("supports rejection and idempotent consolidation requests without auto-confirming memory", async () => {
    addRawKnowledge();
    const service = new PersonalMemoryService(repository);
    const requestId = randomUUID();
    const first = await service.consolidate(requestId);
    const candidate = first.snapshot.candidates.find((item) => item.status === "pending")!;
    const repeat = await service.consolidate(requestId);
    expect(repeat.duplicate).toBe(true);
    const rejected = service.reject(candidate.id, "This note is too temporary for long-term memory.");
    expect(rejected.snapshot.profile).toHaveLength(0);
    expect(rejected.snapshot.candidates.find((item) => item.id === candidate.id)?.status).toBe("rejected");
  });

  it("enforces approval at the database boundary before a candidate can become a profile memory", async () => {
    addRawKnowledge();
    const service = new PersonalMemoryService(repository);
    const created = await service.consolidate(randomUUID());
    const candidate = created.snapshot.candidates.find((item) => item.status === "pending")!;
    expect(() => repository.db.prepare("INSERT INTO user_memory_profile (id,user_id,memory_type,content,content_hash,source_candidate_id,source_knowledge_ids_json,importance,confidence,status,confirmed_at,confirmed_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?,?,?)")
      .run(randomUUID(), "genesis-owner", candidate.memoryType, candidate.content, "test-hash", candidate.id, JSON.stringify(candidate.sourceKnowledgeIds), candidate.importance, candidate.confidence, new Date().toISOString(), "test", new Date().toISOString(), new Date().toISOString()))
      .toThrow("MEMORY_APPROVAL_REQUIRED");
    expect(service.snapshot().profile).toHaveLength(0);
  });

  it("ranks relevance, recency, importance, and confidence, then injects only confirmed memory into the read-only ContextEngine memoryContext", async () => {
    const ranked = rankMemories([
      { id: "old", content: "Algorithms practice", importance: 0.4, confidence: 0.4, occurredAt: "2022-01-01T00:00:00.000Z", sourceKind: "raw_knowledge" },
      { id: "recent", content: "FastAPI backend delivery", importance: 0.9, confidence: 0.9, occurredAt: new Date().toISOString(), sourceKind: "confirmed_memory" },
    ], "FastAPI");
    expect(ranked[0].id).toBe("recent");

    addRawKnowledge();
    const service = new PersonalMemoryService(repository);
    const created = await service.consolidate(randomUUID());
    const candidate = created.snapshot.candidates.find((item) => item.status === "pending")!;
    service.approve(candidate.id);
    const packet = new ContextEngine(repository).buildPacket({ currentPage: "/today-learning", currentTask: "mentor", currentQuestion: "What should I focus on?", currentChapter: null, currentConversation: [] });
    expect(packet.memoryContext.projectDirections).toHaveLength(1);
    expect(packet.memoryContext.projectDirections[0].evidenceIds[0]).toMatch(/^MEM:/);
    expect(packet.memoryContext.rankedMemories).toHaveLength(1);
  });
});
