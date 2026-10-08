import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { ResearchRepository } from "@/lib/db/research-repository";
import { truthReadItemSchema } from "@/lib/domain/knowledge-truth";
import { KnowledgeTruthReadService } from "@/lib/services/knowledge-truth-read-service";
import { PersonalMemoryService } from "@/lib/services/personal-memory-service";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";

describe("Phase 3 Truth Contract and read model", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-truth-read-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("rejects attempts to promote reference data or unsupported capability claims into formal context", () => {
    const base = {
      recordId: randomUUID(),
      userId: "genesis-owner",
      content: "A bounded source record.",
      sourceIds: [randomUUID()],
      confidence: null,
      rankingScore: null,
      occurredAt: new Date().toISOString(),
      limitations: [],
      provenance: {
        sourceId: randomUUID(),
        sourceType: "research_source",
        origin: "https://example.com/source",
        provider: "tavily",
        capturedAt: new Date().toISOString(),
        contentHash: null,
        validationStatus: "untrusted",
      },
    };

    expect(truthReadItemSchema.safeParse({
      ...base,
      truthClass: "reference",
      lifecycleState: "approved",
      approvalState: "satisfied",
      contextEligibility: "formal_context",
    }).success).toBe(false);

    expect(truthReadItemSchema.safeParse({
      ...base,
      truthClass: "demonstrated_capability",
      lifecycleState: "verified",
      approvalState: "satisfied",
      contextEligibility: "formal_context",
    }).success).toBe(false);
  });

  it("separates references, raw Knowledge, Memory Candidates, and approved Memory without writing state", async () => {
    const knowledge = new ProactiveCompanionService(repository);
    knowledge.addKnowledge({
      type: "project",
      content: "Use tested FastAPI delivery as the current project learning record.",
      source: "owner project note",
      tags: ["fastapi"],
      clientRequestId: randomUUID(),
    });
    knowledge.addKnowledge({
      type: "reflection",
      content: "Prefer one bounded implementation loop before expanding scope.",
      source: "owner reflection",
      tags: ["workflow"],
      clientRequestId: randomUUID(),
    });

    const research = new ResearchRepository(repository);
    const run = research.create({
      clientRequestId: randomUUID(),
      operation: "search",
      value: "FastAPI official testing documentation",
      consumers: ["knowledge"],
    });
    research.complete(run.id, {
      provider: "tavily",
      operation: "search",
      requestId: "provider-request",
      answer: null,
      latencyMs: 10,
      createdAt: new Date().toISOString(),
      sources: [{
        source: "tavily",
        title: "FastAPI testing reference",
        url: "https://fastapi.tiangolo.com/tutorial/testing/",
        summary: "External reference summary.",
        relevanceScore: 0.9,
        retrievedAt: new Date().toISOString(),
        publishedAt: null,
        sourceType: "documentation",
      }],
    });

    const memory = new PersonalMemoryService(repository);
    const generated = await memory.consolidate(randomUUID());
    const pending = generated.snapshot.candidates.filter((item) => item.status === "pending");
    memory.approve(pending[0].id);
    memory.reject(pending[1].id, "Keep this as a temporary reflection only.");

    const countsBefore = {
      research: repository.db.prepare("SELECT count(*) count FROM research_sources").get(),
      knowledge: repository.db.prepare("SELECT count(*) count FROM knowledge_items").get(),
      candidates: repository.db.prepare("SELECT count(*) count FROM memory_candidates").get(),
      memories: repository.db.prepare("SELECT count(*) count FROM user_memory_profile").get(),
      audit: repository.db.prepare("SELECT count(*) count FROM audit_logs").get(),
    };
    const model = new KnowledgeTruthReadService(repository).snapshot();
    const countsAfter = {
      research: repository.db.prepare("SELECT count(*) count FROM research_sources").get(),
      knowledge: repository.db.prepare("SELECT count(*) count FROM knowledge_items").get(),
      candidates: repository.db.prepare("SELECT count(*) count FROM memory_candidates").get(),
      memories: repository.db.prepare("SELECT count(*) count FROM user_memory_profile").get(),
      audit: repository.db.prepare("SELECT count(*) count FROM audit_logs").get(),
    };

    expect(countsAfter).toEqual(countsBefore);
    expect(model.references).toHaveLength(1);
    expect(model.references[0]).toMatchObject({ truthClass: "reference", contextEligibility: "reference_context", confidence: null, rankingScore: 0.9 });
    expect(model.userRecords).toHaveLength(2);
    expect(model.userRecords.every((item) => item.contextEligibility === "untrusted_context")).toBe(true);
    expect(model.candidates).toHaveLength(2);
    expect(model.candidates.every((item) => item.contextEligibility === "excluded")).toBe(true);
    expect(model.confirmedPersonalFacts).toHaveLength(1);
    expect(model.confirmedPersonalFacts[0]).toMatchObject({ truthClass: "confirmed_personal_fact", approvalState: "satisfied", contextEligibility: "formal_context" });
    expect(model.contextIndex.formalRecordIds).toEqual([model.confirmedPersonalFacts[0].recordId]);
    expect(model.contextIndex.excludedCandidateIds).toEqual(expect.arrayContaining(model.candidates.map((item) => item.candidateId)));
    expect(model.demonstratedCapabilities).toEqual([]);
  });

  it("keeps malformed pending candidates visible for review but excluded from every context class", () => {
    const timestamp = new Date().toISOString();
    repository.db.prepare(`
      INSERT INTO memory_candidates (
        id,user_id,generation_request_id,dedupe_key,candidate_json,
        source_knowledge_ids_json,importance,confidence,provider,model,
        model_mode,prompt_version,status,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)
    `).run(
      randomUUID(), "genesis-owner", randomUUID(), randomUUID(), "{}", "not-json",
      0.4, 0.4, "demo", "local", "demo", "test", timestamp,
    );

    const model = new KnowledgeTruthReadService(repository).snapshot();
    expect(model.candidates).toHaveLength(1);
    expect(model.candidates[0]).toMatchObject({ status: "pending", valid: false, contextEligibility: "excluded" });
    expect(model.candidates[0].validationIssues.length).toBeGreaterThan(0);
    expect(model.contextIndex.formalRecordIds).toEqual([]);
  });
});
