import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { AgentActionService } from "@/lib/services/agent-action-service";
import { PersonalOperatingService } from "@/lib/services/personal-operating-service";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";

describe("Genesis Personal Operating Loop", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-personal-operating-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  async function activeMission() {
    const strategy = new StrategyService(repository);
    const strategyCandidate = (await strategy.act({ action: "generate", clientRequestId: randomUUID() })).candidate!;
    new StrategyApprovalService(repository).approveCandidate(strategyCandidate.id);
    const mission = new AgentActionService(repository);
    const missionCandidate = (await mission.generate(randomUUID())).candidate!;
    return mission.approve(missionCandidate.id).missionId;
  }

  it("generates a read-only Morning Brief and a Daily Plan Candidate without modifying formal data", async () => {
    await activeMission();
    const service = new PersonalOperatingService(repository);
    const counts = (table: string) => Number((repository.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
    const before = { strategies: counts("growth_strategies"), missions: counts("missions"), evidence: counts("evidence_items"), abilities: counts("ability_change_snapshots"), plans: counts("daily_plans") };
    const brief = await service.generateBrief(randomUUID());
    expect(brief.brief.brief.activeMission).toContain("(");
    const candidate = await service.generatePlan(3, randomUUID());
    expect(candidate.candidate?.status).toBe("candidate");
    expect(candidate.candidate?.plan.sourceRefs.some((ref) => ref.startsWith("MS:"))).toBe(true);
    expect({ strategies: counts("growth_strategies"), missions: counts("missions"), evidence: counts("evidence_items"), abilities: counts("ability_change_snapshots"), plans: counts("daily_plans") }).toEqual(before);
  });

  it("requires user approval before a Daily Plan becomes active and enforces it at the database boundary", async () => {
    await activeMission();
    const service = new PersonalOperatingService(repository);
    const candidate = (await service.generatePlan(4, randomUUID())).candidate!;
    expect(() => repository.db.prepare("INSERT INTO daily_plans (id,user_id,plan_date,source_candidate_id,plan_json,energy,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)")
      .run(randomUUID(), "genesis-owner", candidate.date, candidate.id, JSON.stringify(candidate.plan), candidate.energy, new Date().toISOString(), new Date().toISOString()))
      .toThrow("DAILY_PLAN_APPROVAL_REQUIRED");
    const approved = service.approvePlan(candidate.id);
    expect(approved.snapshot.plan).toMatchObject({ id: approved.planId, status: "active", sourceCandidateId: candidate.id });
    expect(() => service.approvePlan(candidate.id)).toThrow("DAILY_PLAN_CANDIDATE_NOT_PENDING");
    const packet = new ContextEngine(repository).buildPacket({ currentPage: "/", currentTask: "mentor", currentQuestion: "What should I do today?", currentChapter: null, currentConversation: [] });
    expect(packet.dailyContext.activePlan?.value).toContain(candidate.plan.title);
    expect(packet.dailyContext.planActions).not.toHaveLength(0);
  });

  it("persists raw Evening Reflection first, creates a low-trust Evidence Candidate, and never updates Ability automatically", async () => {
    const service = new PersonalOperatingService(repository);
    const beforeAbilities = Number((repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get() as { count: number }).count);
    const result = await service.submitReflection({ completed: "Completed a small documented task and preserved its result.", unfinishedReason: "The task boundary was wider than the available time.", newProblems: "The verification step was not prepared before implementation.", tomorrowAdjustment: "Prepare the verification command before starting the smallest deliverable.", clientRequestId: randomUUID() });
    expect(result.analysisPending).toBe(false);
    expect(repository.db.prepare("SELECT count(*) AS count FROM operating_reflections").get()).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT evidence_type FROM evidence_items WHERE id=?").get(result.reflection?.evidenceId)).toEqual({ evidence_type: "self_reflection" });
    expect(repository.db.prepare("SELECT proposed_level,impact FROM evidence_evaluations WHERE evidence_item_id=?").get(result.reflection?.evidenceId)).toEqual({ proposed_level: 0, impact: 0 });
    expect(result.reflection?.growthCandidateId).toBeTruthy();
    expect(repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get()).toEqual({ count: beforeAbilities });
  });

  it("falls back safely when a configured Provider fails and excludes unapproved Daily Plan Candidates from dailyContext", async () => {
    await activeMission();
    const service = new PersonalOperatingService(repository);
    const configured = vi.spyOn(ContextEngine.prototype, "isRealConfigured").mockReturnValue(true);
    const complete = vi.spyOn(ContextEngine.prototype, "complete").mockRejectedValue(new Error("provider unavailable"));
    try {
      const brief = await service.generateBrief(randomUUID());
      expect(brief.brief.fallbackReason).toBe("provider_failed");
      const candidate = (await service.generatePlan(2, randomUUID())).candidate!;
      expect(candidate.fallbackReason).toBe("provider_failed");
      const pendingPacket = new ContextEngine(repository).buildPacket({ currentPage: "/", currentTask: "mentor", currentQuestion: "What should I do today?", currentChapter: null, currentConversation: [] });
      expect(pendingPacket.dailyContext.activePlan).toBeNull();
      expect(pendingPacket.dailyContext.planActions).toHaveLength(0);
    } finally { complete.mockRestore(); configured.mockRestore(); }
  });
});
