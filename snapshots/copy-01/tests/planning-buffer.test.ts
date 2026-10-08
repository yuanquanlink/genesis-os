import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { PlanningBufferService } from "@/lib/services/planning-buffer-service";

describe("Phase 5 Step 1 Planning Buffer", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-planning-buffer-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function input(clientRequestId = randomUUID()) {
    return {
      title: "明年参加一次 AI 竞赛",
      description: "先保留这个意图，后续再判断比赛方向、投入时间和最小行动。",
      category: "future_goal" as const,
      source: "owner_input" as const,
      clientRequestId,
    };
  }

  function formalCounts() {
    const count = (table: string) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
    return {
      profileFacts: count("profile_facts"),
      goals: count("learning_goals"),
      missions: count("missions"),
      missionCandidates: count("mission_candidates"),
      dailyPlans: count("daily_plans"),
      dailyPlanCandidates: count("daily_plan_candidates"),
      strategies: count("growth_strategies"),
      strategyCandidates: count("strategy_candidates"),
      memories: count("user_memory_profile"),
      memoryCandidates: count("memory_candidates"),
      evidence: count("evidence_items"),
      abilities: count("growth_nodes"),
      growthCandidates: count("growth_evidence_candidates"),
      mastery: count("mastery_certifications"),
    };
  }

  function contextPacket() {
    const packet = new ContextEngine(repository).prepare({
      currentPage: "/",
      currentTask: "读取已批准的正式状态",
      currentQuestion: "当前正式状态是什么？",
      currentChapter: null,
      currentConversation: [],
    }, "full", { approvedOnly: true }).packet;
    if (packet) packet.meta.generatedAt = "<generated-at>";
    return JSON.stringify(packet);
  }

  it("migrates and captures an idempotent owner-authored candidate with provenance", () => {
    const service = new PlanningBufferService(repository);
    const requestId = randomUUID();
    const first = service.capture(input(requestId));
    const second = service.capture(input(requestId));

    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: true, candidateId: first.candidateId });
    expect(first.snapshot.candidates[0]).toMatchObject({
      status: "captured",
      approvalState: "pending",
      source: "owner_input",
      category: "future_goal",
      contextEligible: false,
      formalMutationAllowed: false,
      provenance: { capturedBy: "owner", trustClass: "owner_authored_candidate" },
    });
    expect(first.snapshot.boundary).toEqual({
      candidateOnly: true,
      contextEligible: false,
      formalMutationAllowed: false,
      conversionAvailable: false,
    });
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0058_planning_buffer.sql'").get()).toBeTruthy();
    expect(repository.db.prepare("SELECT count(*) FROM planning_candidate_events").pluck().get()).toBe(1);
  });

  it("keeps capture and owner approval out of formal truth and ContextEngine", () => {
    const beforeCounts = formalCounts();
    const beforeContext = contextPacket();
    const service = new PlanningBufferService(repository);
    const created = service.capture(input());
    const approved = service.transition({ id: created.candidateId, action: "approve", clientRequestId: randomUUID() });

    expect(approved.snapshot.candidates[0]).toMatchObject({
      status: "approved",
      approvalState: "approved",
      contextEligible: false,
      formalMutationAllowed: false,
    });
    expect(approved.snapshot.boundary.conversionAvailable).toBe(false);
    expect(formalCounts()).toEqual(beforeCounts);
    expect(contextPacket()).toBe(beforeContext);
    expect(contextPacket()).not.toContain(created.candidateId);
  });

  it("enforces isolation, owner approval, and append-only lifecycle events in SQLite", () => {
    const service = new PlanningBufferService(repository);
    const created = service.capture(input());

    expect(() => repository.db.prepare("UPDATE planning_candidates SET context_eligible=1 WHERE id=?").run(created.candidateId))
      .toThrow("PLANNING_CANDIDATE_MUST_REMAIN_ISOLATED");
    expect(() => repository.db.prepare("UPDATE planning_candidates SET formal_mutation_allowed=1 WHERE id=?").run(created.candidateId))
      .toThrow("PLANNING_CANDIDATE_MUST_REMAIN_ISOLATED");
    expect(() => repository.db.prepare("UPDATE planning_candidates SET status='approved' WHERE id=?").run(created.candidateId))
      .toThrow("PLANNING_CANDIDATE_REQUIRES_OWNER_APPROVAL");
    expect(() => repository.db.prepare("UPDATE planning_candidate_events SET to_status='archived' WHERE planning_candidate_id=?").run(created.candidateId))
      .toThrow("PLANNING_CANDIDATE_EVENTS_ARE_APPEND_ONLY");
    expect(() => repository.db.prepare("DELETE FROM planning_candidate_events WHERE planning_candidate_id=?").run(created.candidateId))
      .toThrow("PLANNING_CANDIDATE_EVENTS_ARE_APPEND_ONLY");
  });

  it("archives and reopens without creating an automatic plan", () => {
    const service = new PlanningBufferService(repository);
    const created = service.capture(input());
    const archived = service.transition({ id: created.candidateId, action: "archive", clientRequestId: randomUUID() });
    expect(archived.snapshot.candidates[0]).toMatchObject({ status: "archived", approvalState: "pending" });

    const reopened = service.transition({ id: created.candidateId, action: "reopen", clientRequestId: randomUUID() });
    expect(reopened.snapshot.candidates[0]).toMatchObject({ status: "captured", approvalState: "pending" });
    expect(reopened.snapshot.counts).toMatchObject({ active: 1, captured: 1, approved: 0, archived: 0 });
    expect(repository.db.prepare("SELECT action FROM planning_candidate_events WHERE planning_candidate_id=? ORDER BY event_sequence").all(created.candidateId))
      .toEqual([{ action: "captured" }, { action: "archived" }, { action: "reopened" }]);
    expect(repository.db.prepare("SELECT count(*) FROM daily_plan_candidates").pluck().get()).toBe(0);
  });
});
