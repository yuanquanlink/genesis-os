import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import type { ContextProjectionSourceDomain, ContextPurpose } from "@/lib/domain/approved-context-projection";
import { ApprovedContextProjectionService } from "@/lib/services/approved-context-projection-service";
import { ApprovedContextReadService } from "@/lib/services/approved-context-read-service";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";
import { IntelligenceReviewService } from "@/lib/services/intelligence-review-service";

const OWNER = "genesis-owner";
const AT = "2026-08-11T08:00:00.000Z";

function createApprovedStrategy(repository: ProfileRepository) {
  const candidateId = randomUUID();
  const strategyId = randomUUID();
  repository.db.prepare(`INSERT INTO strategy_candidates
    (id,user_id,client_request_id,generated_strategy_json,reasoning,evidence_ids_json,confidence,status,created_at,decided_at,approved_at,approved_by,provider,model,model_mode,prompt_version)
    VALUES (?,?,?,?,?,?,.8,'approved',?,?,?,?,?,?,?,?)`).run(candidateId, OWNER, randomUUID(), JSON.stringify({ priorityRanking: ["ship"] }), "owner approved", JSON.stringify(["EV-1"]), AT, AT, AT, OWNER, "demo", "local", "demo", "test");
  repository.db.prepare(`INSERT INTO growth_strategies
    (id,user_id,period_key,client_request_id,diagnosis_json,strategies_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,created_at,source_candidate_id)
    VALUES (?,?,?,?,?,?,?,.8,'demo','local','demo','test',?,?)`).run(strategyId, OWNER, `P-${strategyId}`, randomUUID(), JSON.stringify({ currentPosition: "learning", targetPosition: "shipping", priorityRanking: ["ship"] }), JSON.stringify({ d7: { goal: "ship", actions: ["build"], avoid: ["drift"] } }), JSON.stringify(["EV-1"]), AT, candidateId);
  return { strategyId, candidateId };
}

function createApprovedMission(repository: ProfileRepository, strategyId: string) {
  const candidateId = randomUUID();
  const missionId = randomUUID();
  repository.db.prepare(`INSERT INTO mission_candidates
    (id,user_id,strategy_id,client_request_id,mission_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,status,created_at,approved_at,approved_by)
    VALUES (?,?,?,?,?,?,.7,'demo','local','demo','test','approved',?,?,?)`).run(candidateId, OWNER, strategyId, randomUUID(), JSON.stringify({ title: "Ship the project" }), JSON.stringify(["EV-1"]), AT, AT, OWNER);
  repository.db.prepare(`INSERT INTO missions
    (id,user_id,title,description,source_goal,strategy_id,source_candidate_id,status,priority,deadline,evidence_requirement,daily_tasks_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'active','high',?,?,?, ?,?)`).run(missionId, OWNER, "Ship the project", "Build and verify the delivery.", "engineering delivery", strategyId, candidateId, "2026-08-30T08:00:00.000Z", "tested artifact", JSON.stringify(["build", "test"]), AT, AT);
  return { missionId, candidateId };
}

function createConfirmedMemory(repository: ProfileRepository) {
  const candidateId = randomUUID();
  const memoryId = randomUUID();
  repository.db.prepare(`INSERT INTO memory_candidates
    (id,user_id,generation_request_id,dedupe_key,candidate_json,source_knowledge_ids_json,importance,confidence,provider,model,model_mode,prompt_version,status,created_at,approved_at,approved_by)
    VALUES (?,?,?,?,?,?,.8,.75,'demo','local','demo','test','approved',?,?,?)`).run(candidateId, OWNER, randomUUID(), randomUUID(), JSON.stringify({ content: "Prefers source-backed learning" }), "[]", AT, AT, OWNER);
  repository.db.prepare(`INSERT INTO user_memory_profile
    (id,user_id,memory_type,content,content_hash,source_candidate_id,source_knowledge_ids_json,importance,confidence,status,confirmed_at,confirmed_by,created_at,updated_at)
    VALUES (?,?,'learning_pattern','Prefers source-backed learning',?,?,?,.8,.75,'active',?,?,?,?)`).run(memoryId, OWNER, randomUUID().replaceAll("-", ""), candidateId, "[]", AT, OWNER, AT, AT);
  return { memoryId, candidateId };
}

function createGoal(repository: ProfileRepository, ownerId = OWNER) {
  const id = randomUUID();
  repository.db.prepare(`INSERT INTO learning_goals
    (id,user_id,client_request_id,title,purpose,target_level,daily_minutes,deadline,engineering_outcome,status,created_at,updated_at,data_kind)
    VALUES (?,?,?,'Master FastAPI','Deliver independently','working',45,NULL,'tested service','active',?,?,'user')`).run(id, ownerId, randomUUID(), AT, AT);
  return id;
}

function createMastery(repository: ProfileRepository, goalId: string, completeOnly = false) {
  const definition = repository.db.prepare("SELECT id FROM mastery_definitions WHERE status='active' ORDER BY id LIMIT 1").get() as { id: string };
  const pilot = repository.db.prepare("SELECT id FROM mastery_pilots WHERE definition_id=? AND availability_status='available' ORDER BY id LIMIT 1").get(definition.id) as { id: string };
  const certificationId = randomUUID();
  repository.db.prepare(`INSERT INTO mastery_certifications
    (id,user_id,goal_id,definition_id,pilot_id,lifecycle_status,course_completed_at,started_at,created_at,updated_at)
    VALUES (?,?,?,?,?,'course_completed',?,?,?,?)`).run(certificationId, OWNER, goalId, definition.id, pilot.id, AT, AT, AT, AT);
  if (completeOnly) return certificationId;
  const gates = repository.db.prepare("SELECT id,gate_type,threshold FROM mastery_gate_requirements WHERE definition_id=? AND required=1 ORDER BY position").all(definition.id) as Array<{ id: string; gate_type: string; threshold: number }>;
  for (const gate of gates) repository.db.prepare(`INSERT INTO mastery_gate_attempts
    (id,certification_id,gate_requirement_id,client_request_id,attempt_number,gate_type,status,result,required,threshold,score_optional,evaluated_at,evaluator_type,assistance_max_level,metadata_version,created_at)
    VALUES (?,?,?,?,1,?,'passed','pass',1,?,?,?,'deterministic',0,'test',?)`).run(randomUUID(), certificationId, gate.id, randomUUID(), gate.gate_type, gate.threshold, Math.min(1, gate.threshold + .05), AT, AT);
  const decisionId = randomUUID();
  const gateNames = gates.map((gate) => gate.gate_type);
  repository.db.prepare(`INSERT INTO mastery_decisions
    (id,certification_id,overall_status,aggregate_score,hard_gate_summary_json,passed_gates_json,failed_gates_json,missing_gates_json,blocked_reasons_json,evidence_refs_json,decision_version,evaluated_at,created_at)
    VALUES (?,?,'mastered',.9,?,?, '[]','[]','[]',?,'mastery-truth-v1',?,?)`).run(decisionId, certificationId, JSON.stringify({ allRequiredPassed: true }), JSON.stringify(gateNames), JSON.stringify(["EV-MASTERY"]), AT, AT);
  repository.db.prepare("UPDATE mastery_certifications SET latest_decision_id=?,lifecycle_status='mastered',mastered_at=?,updated_at=? WHERE id=?").run(decisionId, AT, AT, certificationId);
  return certificationId;
}

function createKnowledgeCandidate(repository: ProfileRepository, status: "pending" | "rejected" = "pending") {
  const id = randomUUID();
  repository.db.prepare(`INSERT INTO knowledge_objects
    (id,user_id,client_request_id,object_type,created_by,approval_status,validation_status,data_kind,created_at,updated_at)
    VALUES (?,?,?,'source','ai','pending','valid','user',?,?)`).run(id, OWNER, randomUUID(), AT, AT);
  if (status === "rejected") {
    repository.db.prepare("INSERT INTO knowledge_approval_decisions (id,user_id,object_id,decision,reason,decided_by,created_at) VALUES (?,?,?,'rejected','Owner rejected the candidate.',?,?)").run(randomUUID(), OWNER, id, OWNER, AT);
    repository.db.prepare("UPDATE knowledge_objects SET approval_status='rejected',updated_at=? WHERE id=?").run(AT, id);
  }
  return id;
}

function project(repository: ProfileRepository, domain: ContextProjectionSourceDomain, id: string, purpose: ContextPurpose, expiresAt: string | null = null) {
  const service = new ApprovedContextProjectionService(repository);
  const preview = service.preview({ sourceDomain: domain, sourceRecordId: id, purpose, expiresAt });
  const authorization = service.authorize({ sourceDomain: domain, sourceRecordId: id, purpose, sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, expiresAt, actor: OWNER, clientRequestId: randomUUID() });
  return { preview, authorization, confirmation: service.confirm({ authorizationId: authorization.id, actor: OWNER, clientRequestId: randomUUID() }) };
}

describe("Phase 4 Step 8 Approved Context Projection", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-approved-context-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("keeps pending, rejected, deferred, acknowledged, and authorization-only Candidates outside Context", () => {
    const pendingId = createKnowledgeCandidate(repository);
    const rejectedId = createKnowledgeCandidate(repository, "rejected");
    const deferredId = createKnowledgeCandidate(repository);
    const authorizedId = createKnowledgeCandidate(repository);
    const read = new IntelligenceReviewReadService(repository);
    const ledger = new IntelligenceReviewService(repository);
    const pending = read.get(`knowledge_object:${pendingId}`)!;
    const deferred = read.get(`knowledge_object:${deferredId}`)!;
    const authorized = read.get(`knowledge_object:${authorizedId}`)!;
    ledger.record({ reviewId: pending.reviewId, action: "acknowledge", sourceCandidateHash: pending.sourceCandidateHash, clientRequestId: randomUUID() });
    ledger.record({ reviewId: deferred.reviewId, action: "defer", sourceCandidateHash: deferred.sourceCandidateHash, revisitAt: "2026-08-30T08:00:00.000Z", clientRequestId: randomUUID() });
    ledger.record({ reviewId: authorized.reviewId, action: "authorize_projection", sourceCandidateHash: authorized.sourceCandidateHash, targetType: "knowledge_approval", previewHash: "1".repeat(64), clientRequestId: randomUUID() });
    expect(read.get(`knowledge_object:${rejectedId}`)).toBeNull();
    expect(repository.db.prepare("SELECT approval_status FROM knowledge_objects WHERE id=?").get(rejectedId)).toEqual({ approval_status: "rejected" });
    expect(new ApprovedContextReadService(repository).read("mentor").items).toEqual([]);
    for (const id of [pendingId, rejectedId, deferredId, authorizedId])
      expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "knowledge", sourceRecordId: id, purpose: "mentor" })).toThrow("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
  });

  it("requires preview, owner authorization, confirmation, and immutable receipt before eligibility", () => {
    const { strategyId } = createApprovedStrategy(repository);
    const service = new ApprovedContextProjectionService(repository);
    const preview = service.preview({ sourceDomain: "strategy", sourceRecordId: strategyId, purpose: "mentor", trustClass: "verified_personal_truth", contextEligible: true });
    expect(preview.trustClass).toBe("approved_personal_state");
    expect(new ApprovedContextReadService(repository).read("mentor").items).toEqual([]);
    const authorization = service.authorize({ sourceDomain: "strategy", sourceRecordId: strategyId, purpose: "mentor", sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, actor: OWNER, clientRequestId: randomUUID() });
    expect(new ApprovedContextReadService(repository).read("mentor").items).toEqual([]);
    const confirmation = service.confirm({ authorizationId: authorization.id, actor: OWNER, clientRequestId: randomUUID() });
    const item = new ApprovedContextReadService(repository).read("mentor").items[0];
    expect(item).toMatchObject({ projectionId: confirmation.projectionId, projectionReceiptId: confirmation.receiptId, freshness: "fresh", sourceDomain: "strategy" });
    expect(() => repository.db.prepare("UPDATE approved_context_projection_receipts SET result='committed' WHERE id=?").run(confirmation.receiptId)).toThrow("APPROVED_CONTEXT_RECEIPT_IMMUTABLE");
    expect(() => repository.db.prepare("DELETE FROM approved_context_projection_receipts WHERE id=?").run(confirmation.receiptId)).toThrow("APPROVED_CONTEXT_RECEIPT_IMMUTABLE");
  });

  it("enforces purpose policy for approved Strategy and formal active Mission while excluding their Candidates", () => {
    const { strategyId, candidateId: strategyCandidateId } = createApprovedStrategy(repository);
    const { missionId, candidateId } = createApprovedMission(repository, strategyId);
    expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "strategy", sourceRecordId: strategyId, purpose: "research" })).toThrow("APPROVED_CONTEXT_PURPOSE_NOT_ALLOWED");
    expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "strategy", sourceRecordId: strategyCandidateId, purpose: "mentor" })).toThrow("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "mission", sourceRecordId: candidateId, purpose: "daily_operation" })).toThrow("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    project(repository, "strategy", strategyId, "mentor");
    project(repository, "mission", missionId, "daily_operation");
    expect(new ApprovedContextReadService(repository).read("mentor").items.map((item) => item.sourceDomain)).toEqual(["strategy"]);
    expect(new ApprovedContextReadService(repository).read("daily_operation").items.map((item) => item.sourceDomain)).toEqual(["mission"]);
  });

  it("excludes pending Memory Candidates and admits only current confirmed Memory for allowed purposes", () => {
    const pendingId = createConfirmedMemory(repository).candidateId;
    const pendingOnly = randomUUID();
    repository.db.prepare(`INSERT INTO memory_candidates
      (id,user_id,generation_request_id,dedupe_key,candidate_json,source_knowledge_ids_json,importance,confidence,provider,model,model_mode,prompt_version,status,created_at)
      VALUES (?,?,?,?,?,'[]',.5,.5,'demo','local','demo','test','pending',?)`).run(pendingOnly, OWNER, randomUUID(), randomUUID(), JSON.stringify({ content: "pending memory" }), AT);
    expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "memory", sourceRecordId: pendingOnly, purpose: "mentor" })).toThrow("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "memory", sourceRecordId: pendingId, purpose: "mentor" })).toThrow("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    const { memoryId } = createConfirmedMemory(repository);
    project(repository, "memory", memoryId, "reflection");
    expect(new ApprovedContextReadService(repository).read("reflection").items[0]).toMatchObject({ sourceRecordId: memoryId, trustClass: "verified_personal_truth" });
  });

  it("does not treat course completion as Mastery and requires all deterministic hard Gates", () => {
    const completeOnly = createMastery(repository, createGoal(repository), true);
    expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "mastery", sourceRecordId: completeOnly, purpose: "learning" })).toThrow("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    const mastered = createMastery(repository, createGoal(repository));
    project(repository, "mastery", mastered, "learning");
    expect(new ApprovedContextReadService(repository).read("learning").items[0]).toMatchObject({ sourceRecordId: mastered, sourceTruthStatus: "mastered", trustClass: "system_derived_deterministic" });
  });

  it("keeps raw Evidence outside verified Context and never converts it into Ability truth", () => {
    const id = randomUUID();
    repository.db.prepare(`INSERT INTO evidence_items
      (id,user_id,evidence_type,source_type,source_id,source,description,related_ability,content_hash,data_kind,captured_at,verification_status,confidence,impact,created_at,updated_at)
      VALUES (?,?,'project','manual',?,'local','Raw project note','Engineering',?,'user',?,'pending',0,0,?,?)`).run(id, OWNER, randomUUID(), randomUUID().replaceAll("-", ""), AT, AT, AT);
    expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "evidence", sourceRecordId: id, purpose: "learning" })).toThrow("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    const packet = new ContextEngine(repository).buildPacket({ currentPage: "/learning", currentTask: "learn", currentQuestion: "status", currentChapter: null, currentConversation: [] }, { purpose: "learning" });
    expect(packet.approvedContext.items).toEqual([]);
    expect(packet.growthGraph.abilities).toEqual([]);
  });

  it("rejects wrong-owner sources and prevents cross-owner Context leakage", () => {
    repository.db.prepare("INSERT INTO users (id,name,long_term_goal,current_stage,is_demo,created_at,updated_at) VALUES ('owner-b','B','B goal','B stage',0,?,?)").run(AT, AT);
    const goalId = createGoal(repository, "owner-b");
    expect(() => new ApprovedContextProjectionService(repository).preview({ sourceDomain: "goal", sourceRecordId: goalId, purpose: "mentor" })).toThrow("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    const serviceB = new ApprovedContextProjectionService(repository, "owner-b");
    const preview = serviceB.preview({ sourceDomain: "goal", sourceRecordId: goalId, purpose: "mentor" });
    const authorization = serviceB.authorize({ sourceDomain: "goal", sourceRecordId: goalId, purpose: "mentor", sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, actor: "owner-b", clientRequestId: randomUUID() });
    serviceB.confirm({ authorizationId: authorization.id, actor: "owner-b", clientRequestId: randomUUID() });
    expect(new ApprovedContextReadService(repository).read("mentor").items).toEqual([]);
    expect(new ApprovedContextReadService(repository, "owner-b").read("mentor").items).toHaveLength(1);
  });

  it("marks changed sources stale and excludes stale projections", () => {
    const { strategyId } = createApprovedStrategy(repository);
    const first = project(repository, "strategy", strategyId, "mentor").confirmation;
    repository.db.prepare("UPDATE growth_strategies SET strategies_json=? WHERE id=?").run(JSON.stringify({ d7: { goal: "changed", actions: ["ship"] } }), strategyId);
    expect(new ApprovedContextReadService(repository).evaluate(first.projectionId, "mentor")).toMatchObject({ eligible: false, freshness: "stale" });
    expect(new ApprovedContextReadService(repository).read("mentor").items).toEqual([]);
  });

  it("excludes revoked, superseded, and expired projections without mutating historical receipts", () => {
    const { strategyId } = createApprovedStrategy(repository);
    const service = new ApprovedContextProjectionService(repository);
    const first = project(repository, "strategy", strategyId, "mentor").confirmation;
    const receiptBefore = repository.db.prepare("SELECT * FROM approved_context_projection_receipts WHERE id=?").get(first.receiptId);
    repository.db.prepare("UPDATE growth_strategies SET diagnosis_json=? WHERE id=?").run(JSON.stringify({ currentPosition: "changed", targetPosition: "shipping" }), strategyId);
    const second = project(repository, "strategy", strategyId, "mentor").confirmation;
    expect(new ApprovedContextReadService(repository).evaluate(first.projectionId, "mentor")).toMatchObject({ eligible: false, freshness: "superseded" });
    service.revoke({ projectionId: second.projectionId, reason: "Owner removed this Context projection.", actor: OWNER, clientRequestId: randomUUID() });
    expect(new ApprovedContextReadService(repository).evaluate(second.projectionId, "mentor")).toMatchObject({ eligible: false, freshness: "revoked" });
    expect(repository.db.prepare("SELECT * FROM approved_context_projection_receipts WHERE id=?").get(first.receiptId)).toEqual(receiptBefore);

    const goalId = createGoal(repository);
    const expired = project(repository, "goal", goalId, "learning", "2099-01-01T00:00:00.000Z").confirmation;
    const futureRead = new ApprovedContextReadService(repository, OWNER, () => new Date("2100-01-01T00:00:00.000Z"));
    expect(futureRead.evaluate(expired.projectionId, "learning")).toMatchObject({ eligible: false, freshness: "expired" });
  });

  it("prevents AI self-authorization and does not accept client-supplied trust elevation", () => {
    const { strategyId } = createApprovedStrategy(repository);
    const service = new ApprovedContextProjectionService(repository);
    const preview = service.preview({ sourceDomain: "strategy", sourceRecordId: strategyId, purpose: "mentor", trustClass: "verified_personal_truth", contextEligible: true });
    expect(preview.trustClass).toBe("approved_personal_state");
    expect(() => service.authorize({ sourceDomain: "strategy", sourceRecordId: strategyId, purpose: "mentor", sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, actor: "ai", clientRequestId: randomUUID() })).toThrow("APPROVED_CONTEXT_OWNER_AUTHORIZATION_REQUIRED");
    expect(repository.db.prepare("SELECT count(*) AS count FROM approved_context_projection_authorizations").get()).toEqual({ count: 0 });
  });

  it("provides a read-only purpose-scoped read model to ContextEngine instead of Candidate storage", () => {
    const { strategyId } = createApprovedStrategy(repository);
    const candidateId = createKnowledgeCandidate(repository);
    const confirmation = project(repository, "strategy", strategyId, "mentor").confirmation;
    const before = repository.db.prepare(`SELECT
      (SELECT count(*) FROM approved_context_projections) projections,
      (SELECT count(*) FROM approved_context_projection_receipts) receipts,
      (SELECT count(*) FROM approved_context_projection_events) events`).get();
    const packet = new ContextEngine(repository).buildPacket({ currentPage: "/mentor", currentTask: "mentor", currentQuestion: "What is current?", currentChapter: null, currentConversation: [] }, { purpose: "mentor" });
    const after = repository.db.prepare(`SELECT
      (SELECT count(*) FROM approved_context_projections) projections,
      (SELECT count(*) FROM approved_context_projection_receipts) receipts,
      (SELECT count(*) FROM approved_context_projection_events) events`).get();
    expect(packet.approvedContext).toMatchObject({ purpose: "mentor", items: [{ projectionId: confirmation.projectionId, sourceDomain: "strategy", freshness: "fresh" }] });
    expect(JSON.stringify(packet.approvedContext)).not.toContain(candidateId);
    expect(after).toEqual(before);
  });
});
