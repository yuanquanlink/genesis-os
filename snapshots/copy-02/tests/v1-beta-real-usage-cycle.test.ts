import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { AgentActionService } from "@/lib/services/agent-action-service";
import { EvidenceService } from "@/lib/services/evidence-service";
import { MentorService } from "@/lib/services/mentor-service";
import { MonthlyReviewService } from "@/lib/services/monthly-review-service";
import { PersonalMemoryService } from "@/lib/services/personal-memory-service";
import { PersonalOperatingService } from "@/lib/services/personal-operating-service";
import { ProactiveCompanionService } from "@/lib/services/proactive-companion-service";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";

describe("Genesis v1 Beta real usage cycle fixture", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-v1-beta-cycle-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "beta-cycle.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("replays Day 1, 7, 14, 21, and 30 without letting unconfirmed records become formal context", async () => {
    const knowledge = new ProactiveCompanionService(repository);
    const memory = new PersonalMemoryService(repository);
    const strategies = new StrategyService(repository);
    const actions = new AgentActionService(repository);

    // Day 1: raw project direction yields candidates only.
    knowledge.addKnowledge({
      type: "project",
      content: "My long-term direction is dependable FastAPI delivery. The current project needs a tested, documented endpoint before I start another topic.",
      source: "Beta Day 1 local note",
      tags: ["fastapi", "delivery"],
      clientRequestId: randomUUID(),
    });
    const memoryCandidate = (await memory.consolidate(randomUUID())).snapshot.candidates.find((candidate) => candidate.status === "pending");
    const strategyCandidate = (await strategies.act({ action: "generate", clientRequestId: randomUUID() })).candidate!;
    const beforeApproval = new ContextEngine(repository).buildPacket({ currentPage: "/today", currentTask: "Day 1", currentQuestion: "What should I do first?", currentChapter: null, currentConversation: [] });
    expect(memoryCandidate).toBeTruthy();
    expect(beforeApproval.memoryContext.projectDirections).toHaveLength(0);
    expect(beforeApproval.strategicContext.currentStrategy).toBeNull();
    expect(beforeApproval.missionContext.activeMissions).toHaveLength(0);

    // Day 7: explicit user decisions make the approved records available to Context.
    memory.approve(memoryCandidate!.id);
    new StrategyApprovalService(repository).approveCandidate(strategyCandidate.id);
    const missionCandidate = (await actions.generate(randomUUID())).candidate!;
    expect(actions.snapshot().missions).toHaveLength(0);
    const approvedMission = actions.approve(missionCandidate.id);
    const weekOne = new ContextEngine(repository).buildPacket({ currentPage: "/today", currentTask: "Day 7", currentQuestion: "What is the bounded Mission?", currentChapter: null, currentConversation: [] });
    expect(weekOne.memoryContext.projectDirections).toHaveLength(1);
    expect(weekOne.strategicContext.currentStrategy).not.toBeNull();
    expect(weekOne.missionContext.activeMissions.some((item) => item.evidenceIds.includes(`MS:${approvedMission.missionId}`))).toBe(true);

    // Day 14: observed work becomes reviewed Evidence, and Mentor advice remains source-bound.
    const evidence = new EvidenceService(repository);
    evidence.createManual({
      action: "create",
      evidenceType: "project",
      source: "Beta Day 14 verified delivery",
      description: "Completed a tested FastAPI endpoint with input validation, documentation, and saved test output for review.",
      relatedAbility: "Backend engineering",
      capturedAt: new Date().toISOString(),
      dataKind: "user",
      clientRequestId: randomUUID(),
    });
    await evidence.analyze();
    const mentor = await new MentorService(repository).analyze({
      module: "ai_mentor",
      prompt: "What is the next bounded action for the active Mission?",
      context: "Beta Day 14 evidence and active Mission review",
      contextMode: "full",
      clientRequestId: randomUUID(),
      perspectives: ["engineer"],
    });
    expect(mentor.analysis.sourceRefs.length).toBeGreaterThan(0);
    expect(mentor.analysis.sourceDetails.every((source) => source.source && source.confidence >= 0 && source.confidence <= 1)).toBe(true);

    // Day 21: a plan is a candidate until confirmation; reflection keeps raw text before Evidence review.
    const operating = new PersonalOperatingService(repository);
    await operating.generateBrief(randomUUID());
    const planCandidate = await operating.generatePlan(4, randomUUID());
    const beforePlanApproval = new ContextEngine(repository).buildPacket({ currentPage: "/today", currentTask: "Day 21", currentQuestion: "Can the plan be treated as active?", currentChapter: null, currentConversation: [] });
    expect(beforePlanApproval.dailyContext.activePlan).toBeNull();
    await operating.approvePlan(planCandidate.candidate.id);
    const reflection = await operating.submitReflection({
      completed: "Executed the most important Mission task and preserved the test result.",
      unfinishedReason: "A second failure-path test remains for tomorrow.",
      newProblems: "Need independent reproduction before broader claims.",
      tomorrowAdjustment: "Run the failure-path test before expanding scope.",
      clientRequestId: randomUUID(),
    });
    expect(reflection.reflection?.id).toBeTruthy();
    expect(new ContextEngine(repository).buildPacket({ currentPage: "/today", currentTask: "Day 21", currentQuestion: "What is active?", currentChapter: null, currentConversation: [] }).dailyContext.activePlan).not.toBeNull();

    // Day 30: mission completion creates pending Evidence, while Monthly Review uses only verified Evidence.
    const completion = await actions.complete(approvedMission.missionId, "Completed the bounded Mission with a reproducible test result and a documented remaining limitation.", randomUUID());
    expect(completion.growthCandidateId).toBeTruthy();
    expect(repository.db.prepare("SELECT status FROM growth_evidence_candidates WHERE id=?").get(completion.growthCandidateId)).toEqual({ status: "pending" });
    const review = await new MonthlyReviewService(repository).generate({ action: "generate", clientRequestId: randomUUID() });
    expect(review.review?.evidenceIds.length).toBeGreaterThan(0);
    expect(review.review?.review.monthlyGoal.goal).toBeTruthy();
    expect(repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
  });
});
