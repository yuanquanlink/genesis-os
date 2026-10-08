import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { DataIntegrityService } from "@/lib/services/data-integrity-service";
import { EvidenceService } from "@/lib/services/evidence-service";
import { PersonalMemoryService } from "@/lib/services/personal-memory-service";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";
import { AgentActionService } from "@/lib/services/agent-action-service";

describe("DataIntegrityService", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-integrity-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  const count = (table: string) => Number((repository.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);

  it("previews malformed or orphaned non-formal records and repairs only those after explicit confirmation", async () => {
    const strategyService = new StrategyService(repository);
    const approvedCandidate = (await strategyService.act({ action: "generate", clientRequestId: randomUUID() })).candidate!;
    new StrategyApprovalService(repository).approveCandidate(approvedCandidate.id);
    const invalidStrategy = randomUUID();
    repository.db.prepare("INSERT INTO strategy_candidates (id,user_id,client_request_id,generated_strategy_json,reasoning,evidence_ids_json,confidence,status,created_at,provider,model,model_mode,prompt_version) VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?)")
      .run(invalidStrategy, "genesis-owner", randomUUID(), "{}", "invalid fixture", "[]", 0.2, new Date().toISOString(), "demo", "local", "demo", "test");
    const mission = (await new AgentActionService(repository).generate(randomUUID())).candidate!;
    repository.db.prepare("UPDATE mission_candidates SET mission_json='{}' WHERE id=?").run(mission.id);

    const knowledge = new ProactiveCompanionService(repository).addKnowledge({
      type: "project", content: "Tested FastAPI project work should remain tied to a documented delivery result.", source: "integrity test", tags: ["fastapi"], clientRequestId: randomUUID(),
    });
    const memory = await new PersonalMemoryService(repository).consolidate(randomUUID());
    const memoryCandidate = memory.snapshot.candidates.find((item) => item.status === "pending")!;
    repository.db.prepare("DELETE FROM knowledge_items WHERE id=?").run(knowledge.snapshot.items[0].id);

    const evidenceSnapshot = new EvidenceService(repository).createManual({
      action: "create", evidenceType: "project", source: "integrity test", description: "A pending project artifact retained for source-link verification.", relatedAbility: "Backend engineering", capturedAt: new Date().toISOString(), dataKind: "user", clientRequestId: randomUUID(),
    });
    const evidence = evidenceSnapshot.items.find((item) => item.source === "integrity test")!;
    repository.db.prepare("DELETE FROM evidence_item_sources WHERE evidence_item_id=?").run(evidence.id);

    const formalBefore = { strategies: count("growth_strategies"), abilities: count("ability_change_snapshots"), facts: count("profile_facts") };
    const service = new DataIntegrityService(repository);
    const preview = service.snapshot();
    expect(preview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityId: invalidStrategy, kind: "invalid_candidate" }),
      expect.objectContaining({ entityId: mission.id, kind: "invalid_candidate" }),
      expect.objectContaining({ entityId: memoryCandidate.id, kind: "orphan_candidate_source" }),
      expect.objectContaining({ entityId: evidence.id, kind: "orphan_evidence_source" }),
    ]));

    const applied = service.apply();
    expect(applied.repaired.rejectedCandidates).toBeGreaterThanOrEqual(3);
    expect(repository.db.prepare("SELECT status FROM strategy_candidates WHERE id=?").get(invalidStrategy)).toEqual({ status: "rejected" });
    expect(repository.db.prepare("SELECT status FROM mission_candidates WHERE id=?").get(mission.id)).toEqual({ status: "rejected" });
    expect(repository.db.prepare("SELECT status FROM memory_candidates WHERE id=?").get(memoryCandidate.id)).toEqual({ status: "rejected" });
    expect(repository.db.prepare("SELECT verification_status FROM evidence_items WHERE id=?").get(evidence.id)).toEqual({ verification_status: "needs_review" });
    expect({ strategies: count("growth_strategies"), abilities: count("ability_change_snapshots"), facts: count("profile_facts") }).toEqual(formalBefore);
    expect(repository.db.prepare("SELECT count(*) AS count FROM audit_logs WHERE action='data_integrity.nonformal_repaired'").get()).toEqual({ count: 1 });
  });

  it("reports formal memory provenance drift without changing the confirmed profile", () => {
    const knowledgeId = randomUUID();
    const candidateId = randomUUID();
    const profileId = randomUUID();
    const timestamp = new Date().toISOString();
    repository.db.prepare("INSERT INTO knowledge_items (id,user_id,type,content,source,tags_json,data_kind,content_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(knowledgeId, "genesis-owner", "note", "A stable learning preference recorded for integrity validation.", "test", "[]", "user", randomUUID(), timestamp, timestamp);
    repository.db.prepare("INSERT INTO memory_candidates (id,user_id,generation_request_id,dedupe_key,candidate_json,source_knowledge_ids_json,importance,confidence,provider,model,model_mode,prompt_version,status,created_at,approved_at,approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(candidateId, "genesis-owner", randomUUID(), randomUUID(), JSON.stringify({ memoryType: "stable_preference", content: "Prefer bounded engineering practice before broadening scope.", reasoning: "This is an integrity fixture and is not user-confirmed.", sourceKnowledgeIds: [knowledgeId], importance: 0.5, confidence: 0.5 }), JSON.stringify([knowledgeId]), 0.5, 0.5, "demo", "local", "demo", "test", "approved", timestamp, timestamp, "genesis-owner");
    repository.db.prepare("INSERT INTO user_memory_profile (id,user_id,memory_type,content,content_hash,source_candidate_id,source_knowledge_ids_json,importance,confidence,status,confirmed_at,confirmed_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(profileId, "genesis-owner", "stable_preference", "Invalid formal memory fixture.", randomUUID(), candidateId, JSON.stringify([knowledgeId]), 0.5, 0.5, "active", timestamp, "genesis-owner", timestamp, timestamp);
    repository.db.prepare("UPDATE memory_candidates SET status='rejected',rejected_at=?,rejected_by=?,reject_reason=? WHERE id=?").run(timestamp, "genesis-owner", "Fixture provenance drift", candidateId);

    const preview = new DataIntegrityService(repository).snapshot();
    expect(preview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "memory", entityId: profileId, kind: "formal_reference_warning", repairable: false }),
    ]));
    expect(repository.db.prepare("SELECT status FROM user_memory_profile WHERE id=?").get(profileId)).toEqual({ status: "active" });
  });

  it("keeps aged pending Memory Candidates visible and only rejects duplicate candidates after explicit cleanup", () => {
    const knowledgeId = randomUUID();
    const firstId = randomUUID();
    const duplicateId = randomUUID();
    const createdAt = new Date(Date.now() - 9 * 86_400_000).toISOString();
    const payload = JSON.stringify({ memoryType: "learning_pattern", content: "Prefer a small verified delivery loop before expanding the next learning topic.", reasoning: "Two source runs produced the same candidate, so one requires a user-visible review decision.", sourceKnowledgeIds: [knowledgeId], importance: 0.6, confidence: 0.6 });
    repository.db.prepare("INSERT INTO knowledge_items (id,user_id,type,content,source,tags_json,data_kind,content_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(knowledgeId, "genesis-owner", "note", "Memory duplicate integrity fixture source.", "test", "[]", "user", randomUUID(), createdAt, createdAt);
    for (const [index, id] of [firstId, duplicateId].entries()) {
      repository.db.prepare("INSERT INTO memory_candidates (id,user_id,generation_request_id,dedupe_key,candidate_json,source_knowledge_ids_json,importance,confidence,provider,model,model_mode,prompt_version,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, "genesis-owner", randomUUID(), randomUUID(), payload, JSON.stringify([knowledgeId]), 0.6, 0.6, "demo", "local", "demo", "test", "pending", new Date(Date.parse(createdAt) + index).toISOString());
    }

    const service = new DataIntegrityService(repository);
    const preview = service.snapshot();
    expect(preview.pendingCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "memory_candidate", total: 2, olderThanSevenDays: 2 })]));
    expect(preview.issues).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: duplicateId, kind: "duplicate_candidate", repairable: true })]));

    service.apply();
    expect(repository.db.prepare("SELECT status FROM memory_candidates WHERE id=?").get(firstId)).toEqual({ status: "pending" });
    expect(repository.db.prepare("SELECT status FROM memory_candidates WHERE id=?").get(duplicateId)).toEqual({ status: "rejected" });
  });
});
