import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { AgentActionService } from "@/lib/services/agent-action-service";
import { DailyLifeService } from "@/lib/services/daily-life-service";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";

describe("Genesis Agent Action Layer", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-agent-action-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function approvedStrategy() {
    const generated = await new StrategyService(repository).act({ action: "generate", clientRequestId: randomUUID() });
    return new StrategyApprovalService(repository).approveCandidate(generated.candidate!.id);
  }

  it("requires an approved Strategy and stores only a candidate during generation", async () => {
    const service = new AgentActionService(repository);
    const unavailable = await service.generate(randomUUID());
    expect(unavailable.candidate).toBeNull();
    expect(unavailable.unavailable).toContain("已批准战略");

    await approvedStrategy();
    const before = {
      missions: Number((repository.db.prepare("SELECT count(*) AS count FROM missions").get() as { count: number }).count),
      evidence: Number((repository.db.prepare("SELECT count(*) AS count FROM evidence_items").get() as { count: number }).count),
      abilities: Number((repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get() as { count: number }).count),
    };
    const generated = await service.generate(randomUUID());
    expect(generated.candidate?.status).toBe("candidate");
    expect(repository.db.prepare("SELECT count(*) AS count FROM missions").get()).toEqual({ count: before.missions });
    expect(repository.db.prepare("SELECT count(*) AS count FROM evidence_items").get()).toEqual({ count: before.evidence });
    expect(repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get()).toEqual({ count: before.abilities });
  });

  it("approves exactly once, rejects pending candidates, and enforces approval in SQLite", async () => {
    await approvedStrategy();
    const service = new AgentActionService(repository);
    const first = (await service.generate(randomUUID())).candidate!;
    expect(() => repository.db.prepare("INSERT INTO missions (id,user_id,title,description,source_goal,strategy_id,source_candidate_id,status,priority,deadline,evidence_requirement,daily_tasks_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'active',?,?,?,?,?,?)")
      .run(randomUUID(), "genesis-owner", first.title, first.description, first.sourceGoal, first.strategyId, first.id, first.priority, first.deadline, first.evidenceRequirement, "[]", new Date().toISOString(), new Date().toISOString()))
      .toThrow("MISSION_APPROVAL_REQUIRED");

    const approved = service.approve(first.id);
    expect(approved.snapshot.missions).toHaveLength(1);
    expect(approved.snapshot.missions[0]).toMatchObject({ status: "active", sourceGoal: first.sourceGoal });
    expect(() => service.approve(first.id)).toThrow("MISSION_CANDIDATE_NOT_PENDING");

    const second = (await service.generate(randomUUID())).candidate!;
    service.reject(second.id, "This delivery loop is not the right focus this week.");
    expect(service.snapshot().candidates.find((candidate) => candidate.id === second.id)?.status).toBe("rejected");
    expect(repository.db.prepare("SELECT count(*) AS count FROM missions").get()).toEqual({ count: 1 });
  });

  it("completes an active Mission through raw Evidence and a pending Evidence Candidate without changing Ability", async () => {
    await approvedStrategy();
    const service = new AgentActionService(repository);
    const candidate = (await service.generate(randomUUID())).candidate!;
    const approved = service.approve(candidate.id);
    const morning = new DailyLifeService(repository).snapshot().morning;
    expect(morning.activeMission).toMatchObject({ id: approved.missionId, title: candidate.title, priority: candidate.priority });
    expect(morning.activeMission?.dailyTasks).toEqual(candidate.dailyTasks);
    const beforeSnapshots = Number((repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get() as { count: number }).count);
    const completed = await service.complete(approved.missionId, "Implemented a documented API delivery loop, ran its tests, and recorded the exact remaining deployment limitation.", randomUUID());
    expect(completed.analysisPending).toBe(false);
    expect(repository.db.prepare("SELECT status FROM missions WHERE id=?").get(approved.missionId)).toEqual({ status: "completed" });
    expect(repository.db.prepare("SELECT count(*) AS count FROM mission_evidence WHERE mission_id=?").get(approved.missionId)).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM growth_evidence_candidates WHERE user_id=? AND status='pending'").get("genesis-owner")).toMatchObject({ count: expect.any(Number) });
    expect(repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get()).toEqual({ count: beforeSnapshots });
    expect(new DailyLifeService(repository).snapshot().evening.missionCompletion).toBe("没有进行中使命");
  });

  it("injects active Missions into ContextEngine, excludes candidates, and has a provider-failure fallback", async () => {
    await approvedStrategy();
    const service = new AgentActionService(repository);
    const pending = (await service.generate(randomUUID())).candidate!;
    const before = new ContextEngine(repository).buildPacket({ currentPage: "/mentor", currentTask: "mentor", currentQuestion: "What should I execute?", currentChapter: null, currentConversation: [] });
    expect(before.missionContext.activeMissions).toHaveLength(0);
    expect(before.missionContext.dailyTasks).toHaveLength(0);

    const configured = vi.spyOn(ContextEngine.prototype, "isRealConfigured").mockReturnValue(true);
    const complete = vi.spyOn(ContextEngine.prototype, "complete").mockRejectedValue(new Error("provider unavailable"));
    try {
      service.approve(pending.id);
      const active = new ContextEngine(repository).buildPacket({ currentPage: "/mentor", currentTask: "mentor", currentQuestion: "What should I execute?", currentChapter: null, currentConversation: [] });
      expect(active.missionContext.activeMissions[0]?.value).toContain(pending.title);
      expect(active.missionContext.dailyTasks).not.toHaveLength(0);
      const fallback = await service.generate(randomUUID());
      expect(fallback.candidate?.mode).toBe("demo");
      expect(fallback.candidate?.fallbackReason).toBe("provider_failed");
    } finally {
      complete.mockRestore();
      configured.mockRestore();
    }
  });
});
