import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { AgentActionService } from "@/lib/services/agent-action-service";
import { PersonalMemoryService } from "@/lib/services/personal-memory-service";
import { PersonalOperatingService } from "@/lib/services/personal-operating-service";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";

describe("Genesis v0.3 real-life validation fixture", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-real-life-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  it("replays Day 1 -> Day 30 checkpoints without bypassing approvals", async () => {
    const knowledge = new ProactiveCompanionService(repository).addKnowledge({
      type: "project", content: "FastAPI delivery is the current project direction and should be verified with tests.", source: "Day 14 knowledge note", tags: ["fastapi"], clientRequestId: crypto.randomUUID(),
    });
    const memoryService = new PersonalMemoryService(repository);
    const memoryCandidates = await memoryService.consolidate(crypto.randomUUID());
    const memoryCandidate = memoryCandidates.snapshot.candidates.find((candidate) => candidate.status === "pending");
    expect(memoryCandidate?.sourceKnowledgeIds).toContain(knowledge.snapshot.items[0].id);
    memoryService.approve(memoryCandidate!.id);

    const strategyService = new StrategyService(repository);
    const generatedStrategy = await strategyService.act({ action: "generate", clientRequestId: crypto.randomUUID() });
    const strategyCandidate = generatedStrategy.candidate!;
    expect(repository.db.prepare("SELECT count(*) AS count FROM growth_strategies").get()).toEqual({ count: 0 });
    const approvedStrategy = new StrategyApprovalService(repository).approveCandidate(strategyCandidate.id);

    const actionService = new AgentActionService(repository);
    const generatedMission = await actionService.generate(crypto.randomUUID());
    const missionCandidate = generatedMission.candidate!;
    expect(repository.db.prepare("SELECT count(*) AS count FROM missions").get()).toEqual({ count: 0 });
    const approvedMission = actionService.approve(missionCandidate.id);

    const context = new ContextEngine(repository).buildPacket({ currentPage: "/today", currentTask: "Day 21 validation", currentQuestion: "What is the next bounded action?", currentChapter: null, currentConversation: [] });
    expect(context.memoryContext.rankedMemories.some((item) => item.evidenceIds.includes(`MEM:${memoryService.snapshot().profile[0].id}`))).toBe(true);
    expect(context.missionContext.activeMissions.some((item) => item.evidenceIds.includes(`MS:${approvedMission.missionId}`))).toBe(true);
    expect(context.strategicContext.ninetyDayGoal).not.toBeNull();

    const operating = new PersonalOperatingService(repository);
    const brief = await operating.execute({ action: "generate_brief", clientRequestId: crypto.randomUUID() });
    expect(JSON.stringify(brief)).toContain(missionCandidate.title);
    const planCandidate = await operating.generatePlan(4, crypto.randomUUID());
    await operating.approvePlan(planCandidate.candidate.id);

    const completion = await actionService.complete(approvedMission.missionId, "Day 30 project delivery completed with a reproducible test result.", crypto.randomUUID());
    expect(completion.evidenceId).toBeTruthy();
    expect(repository.db.prepare("SELECT mission_id FROM mission_evidence WHERE mission_id=?").get(approvedMission.missionId)).toEqual({ mission_id: approvedMission.missionId });
    const pendingGrowthCandidates = (repository.db.prepare("SELECT count(*) AS count FROM growth_evidence_candidates WHERE status='pending' AND candidate_kind='evidence_assessment'").get() as { count: number }).count;
    expect(pendingGrowthCandidates).toBeGreaterThan(0);

    const reflection = await operating.submitReflection({ completed: "Completed the Mission delivery loop.", unfinishedReason: "None; the next gap needs independent verification.", newProblems: "Need a second test path.", tomorrowAdjustment: "Repeat the core test without AI assistance.", clientRequestId: crypto.randomUUID() });
    expect(reflection.reflection?.id).toBeTruthy();
    const after = new ContextEngine(repository).buildPacket({ currentPage: "/today", currentTask: "Day 30 review", currentQuestion: "What changed?", currentChapter: null, currentConversation: [] });
    expect(after.missionContext.activeMissions).toHaveLength(0);
    expect(after.missionContext.recentCompletions.some((item) => item.evidenceIds.includes(`MS:${approvedMission.missionId}`))).toBe(true);
    expect(after.dailyContext.activePlan).not.toBeNull();
    expect(after.dailyContext.latestReflection).not.toBeNull();
    expect(approvedStrategy.strategyId).toBeTruthy();
    expect(repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
  });
});
