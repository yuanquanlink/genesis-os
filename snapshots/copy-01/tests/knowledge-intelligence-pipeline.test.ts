import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import type { KnowledgeAnalysisOutput } from "@/lib/domain/knowledge-intelligence";
import { KnowledgeAnalysisService } from "@/lib/services/knowledge-analysis-service";
import { KnowledgeIngestionService } from "@/lib/services/knowledge-ingestion-service";
import { PersonalKnowledgeService } from "@/lib/services/personal-knowledge-service";
import { DataPortabilityService } from "@/lib/services/data-portability-service";

describe("Phase 3 Knowledge Intelligence Pipeline foundation", () => {
  let directory = "";
  let repository: ProfileRepository;
  let knowledge: PersonalKnowledgeService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-knowledge-intelligence-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    knowledge = new PersonalKnowledgeService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function sourceAndArtifact() {
    const capturedAt = new Date().toISOString();
    const sourceId = knowledge.createSource({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      title: "Owner uploaded systems text", sourceType: "uploaded_file", ownership: "user_owned",
      originalLocator: "uploads/systems.txt", legacyKnowledgeItemId: null, researchSourceId: null,
      provenance: { sourceIds: [], capturedAt, notes: ["Uploaded by the owner."] },
    }).objectId;
    const artifactId = knowledge.createArtifact({
      clientRequestId: randomUUID(), createdBy: "system", validationStatus: "unvalidated",
      sourceId, artifactType: "parsed_content_reference", contentReference: null, extractionStatus: "pending",
      parser: { name: null, version: null, metadata: {} }, contentHash: null, extractedAt: null,
    }).objectId;
    return { sourceId, artifactId };
  }

  function addUnit(sourceId: string, artifactId: string) {
    return knowledge.createUnit({
      clientRequestId: randomUUID(), createdBy: "user", validationStatus: "valid",
      sourceId, artifactId, parentUnitId: null, unitType: "concept", title: "Queue ownership",
      content: "A queue needs explicit ownership, retry, and idempotency boundaries.", originalLocator: "line:1", ordinal: 1,
    }).objectId;
  }

  function formalCounts() {
    const count = (table: string) => Number(repository.db.prepare(`SELECT count(*) count FROM ${table}`).pluck().get());
    return {
      goals: count("learning_goals"), missions: count("missions"), memories: count("user_memory_profile"),
      evidence: count("evidence_items"), abilities: count("growth_nodes"), mastery: count("mastery_certifications"),
      strategies: count("growth_strategies"),
    };
  }

  function analysis(sourceId: string, unitId: string): KnowledgeAnalysisOutput {
    return {
      difficulty: { level: "advanced", score: 4, rationale: "Concurrency semantics require careful reasoning.", sourceIds: [sourceId, unitId] },
      prerequisites: [{ name: "Data structures", rationale: "Queues are the core structure.", sourceIds: [unitId] }],
      concepts: [{ name: "Retry boundary", summary: "Retries must preserve idempotency.", sourceIds: [unitId] }],
      relationships: [{ from: "Retry", to: "Idempotency", type: "supports", rationale: "Safe retries depend on stable request identity.", sourceIds: [unitId] }],
      learningValue: { score: 0.8, rationale: "Useful for reliable services.", possibleUses: ["Backend systems"], sourceIds: [sourceId, unitId] },
      learningGoal: { title: "Explain safe queue retries", description: "Produce a design with explicit retry and ownership boundaries.", sourceIds: [unitId] },
      estimatedLearningTime: { hours: 8, rangeHours: [6, 12], assumptions: ["Basic TypeScript is known."], sourceIds: [sourceId] },
      learningPath: { steps: [{ title: "Model state transitions", outcome: "A deterministic state diagram.", sourceIds: [unitId] }], sourceIds: [sourceId, unitId] },
      requiredPrerequisites: [{ title: "Data structures", reason: "Needed to reason about queue behavior.", sourceIds: [unitId] }],
      confidence: 0.72,
      limitations: ["Candidate analysis requires owner review."],
    };
  }

  it("runs an explicit extraction lifecycle with sanitized failure and manual retry recovery", () => {
    const { sourceId, artifactId } = sourceAndArtifact();
    const ingestion = new KnowledgeIngestionService(repository);
    const queued = ingestion.queue({ clientRequestId: randomUUID(), sourceId, artifactId, maxAttempts: 2, processingMetadata: { bytes: 120 } });
    ingestion.start({ runId: queued.runId, processor: { name: "plain-text", version: "1", metadata: { encoding: "utf-8" } } });
    const failure = ingestion.fail({
      runId: queued.runId, errorCode: "parser timeout", errorMessage: "token=private-value parser timed out",
      processingMetadata: { stage: "decode" },
    });

    expect(failure.recoverable).toBe(true);
    expect(ingestion.snapshot()[0]).toMatchObject({
      status: "failed", attemptCount: 1,
      lastError: { code: "PARSER_TIMEOUT", message: "token=[REDACTED] parser timed out" },
    });
    ingestion.requestRetry(queued.runId);
    ingestion.start({ runId: queued.runId, processor: { name: "plain-text", version: "1.1", metadata: { recovery: true } } });
    ingestion.finish({ runId: queued.runId, outcome: "completed", contentReference: "artifact://systems/parsed-v1", contentHash: "hash-v1", processingMetadata: { units: 1 } });

    expect(ingestion.snapshot()[0]).toMatchObject({ status: "completed", attemptCount: 2, lastError: null });
    expect(repository.db.prepare("SELECT extraction_status,content_reference,content_hash FROM knowledge_artifacts WHERE id=?").get(artifactId))
      .toEqual({ extraction_status: "completed", content_reference: "artifact://systems/parsed-v1", content_hash: "hash-v1" });
    expect(() => repository.db.prepare("UPDATE knowledge_ingestion_runs SET status='processing' WHERE id=?").run(queued.runId))
      .toThrow("KNOWLEDGE_INGESTION_INVALID_TRANSITION");
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0037_knowledge_intelligence_pipeline.sql'").get()).toBeTruthy();
  });

  it("persists AI analysis and all four learning outputs as pending untrusted candidates only", async () => {
    const { sourceId, artifactId } = sourceAndArtifact();
    repository.db.prepare("UPDATE knowledge_artifacts SET extraction_status='completed',content_reference='artifact://ready',parser_name='test',parser_version='1',extracted_at=? WHERE id=?")
      .run(new Date().toISOString(), artifactId);
    const unitId = addUnit(sourceId, artifactId);
    const before = formalCounts();
    let capturedMode: unknown = null;
    const fakeContext = {
      isRealConfigured: () => true,
      complete: async <T,>(request: { contextMode?: string }) => {
        capturedMode = request.contextMode;
        return {
          provider: "deepseek" as const, model: "deepseek-chat", mode: "real" as const,
          text: "{}", parsed: analysis(sourceId, unitId) as T,
          usage: { inputTokens: 10, outputTokens: 20 }, latencyMs: 1, finishReason: "stop", requestId: "test",
        };
      },
    };
    const result = await new KnowledgeAnalysisService(repository, fakeContext).generate({
      clientRequestId: randomUUID(), sourceId, artifactId, unitIds: [unitId], request: "Analyze safe queues.",
    });

    expect(capturedMode).toBe("none");
    expect(result.snapshot.analyses[0]).toMatchObject({
      id: result.candidateId, status: "pending", trustClass: "untrusted", provider: "deepseek", modelMode: "real",
    });
    expect(result.snapshot.learningCandidates).toHaveLength(4);
    expect(new Set(result.snapshot.learningCandidates.map((item) => item.type))).toEqual(new Set([
      "learning_goal", "estimated_learning_time", "learning_path", "prerequisite",
    ]));
    expect(result.snapshot.learningCandidates.every((item) => item.status === "pending" && item.trustClass === "untrusted")).toBe(true);
    expect(() => repository.db.prepare("UPDATE knowledge_analysis_candidates SET status='approved' WHERE id=?").run(result.candidateId))
      .toThrow();
    expect(() => repository.db.prepare("UPDATE knowledge_learning_candidates SET status='approved' WHERE analysis_candidate_id=?").run(result.candidateId))
      .toThrow();
    expect(formalCounts()).toEqual(before);
  });

  it("rejects invented source references and never persists the invalid model output", async () => {
    const { sourceId, artifactId } = sourceAndArtifact();
    repository.db.prepare("UPDATE knowledge_artifacts SET extraction_status='completed',content_reference='artifact://ready',parser_name='test',parser_version='1',extracted_at=? WHERE id=?")
      .run(new Date().toISOString(), artifactId);
    const unitId = addUnit(sourceId, artifactId);
    const invalid = analysis(sourceId, unitId);
    invalid.concepts[0].sourceIds = [randomUUID()];
    const service = new KnowledgeAnalysisService(repository, {
      isRealConfigured: () => true,
      complete: async <T,>() => ({
        provider: "deepseek" as const, model: "deepseek-chat", mode: "real" as const, text: "{}", parsed: invalid as T,
        usage: { inputTokens: null, outputTokens: null }, latencyMs: 1, finishReason: "stop", requestId: null,
      }),
    });

    await expect(service.generate({ clientRequestId: randomUUID(), sourceId, artifactId, unitIds: [unitId], request: "Analyze." }))
      .rejects.toThrow("KNOWLEDGE_ANALYSIS_INVALID_SOURCE_REFERENCE");
    expect(service.snapshot().analyses).toHaveLength(0);
    expect(service.snapshot().learningCandidates).toHaveLength(0);
  });

  it("uses an honestly labelled fallback and keeps candidates outside ContextEngine and formal state", async () => {
    const { sourceId } = sourceAndArtifact();
    const packetBefore = JSON.stringify(new ContextEngine(repository).prepare({
      currentPage: "/knowledge", currentTask: "boundary check", currentQuestion: "What is trusted?", currentChapter: null, currentConversation: [],
    }, "full").packet);
    const before = formalCounts();
    const service = new KnowledgeAnalysisService(repository, {
      isRealConfigured: () => true,
      complete: async () => { throw new Error("simulated provider outage"); },
    });
    const result = await service.generate({ clientRequestId: randomUUID(), sourceId, artifactId: null, unitIds: [], request: "Analyze." });
    const packetAfter = JSON.stringify(new ContextEngine(repository).prepare({
      currentPage: "/knowledge", currentTask: "boundary check", currentQuestion: "What is trusted?", currentChapter: null, currentConversation: [],
    }, "full").packet);

    expect(result.fallbackReason).toBe("provider_failed");
    expect(result.snapshot.analyses[0]).toMatchObject({ status: "pending", trustClass: "untrusted", provider: "demo", modelMode: "demo" });
    expect(result.snapshot.analyses[0].limitations).toContain("fallback:provider_failed");
    expect(packetBefore).not.toContain(result.candidateId);
    expect(packetAfter).not.toContain(result.candidateId);
    expect(packetAfter).not.toContain("Review Owner uploaded systems text");
    expect(formalCounts()).toEqual(before);
    expect(result.snapshot.meta).toEqual({ contextIntegration: false, approvalProjection: false, automaticFormalWrites: false });
  });

  it("exports and restores ingestion history and pending candidates without promotion", async () => {
    const { sourceId } = sourceAndArtifact();
    const analysisService = new KnowledgeAnalysisService(repository, { isRealConfigured: () => false, complete: async () => { throw new Error("unused"); } });
    const created = await analysisService.generate({ clientRequestId: randomUUID(), sourceId, artifactId: null, unitIds: [], request: "Prepare owner review." });
    const backup = new DataPortabilityService(repository).exportJson();
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      const snapshot = new KnowledgeAnalysisService(restored, { isRealConfigured: () => false, complete: async () => { throw new Error("unused"); } }).snapshot();
      expect(snapshot.analyses.find((item) => item.id === created.candidateId)).toMatchObject({ status: "pending", trustClass: "untrusted" });
      expect(snapshot.learningCandidates.filter((item) => item.analysisCandidateId === created.candidateId)).toHaveLength(4);
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
      expect(restored.db.prepare("SELECT count(*) FROM learning_goals").pluck().get()).toBe(0);
    } finally {
      restored.close();
    }
  });
});
