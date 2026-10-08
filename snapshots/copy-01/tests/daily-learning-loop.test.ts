import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { LearningRepository } from "@/lib/db/learning-repository";
import { LearningService } from "@/lib/services/learning-service";
import { LearningAgentService } from "@/lib/services/learning-agent-service";
import { DailyLearningService } from "@/lib/services/daily-learning-service";
import { ProjectChallengeService, FASTAPI_REQUIREMENTS } from "@/lib/services/project-challenge-service";

describe("Daily Learning Loop", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-daily-loop-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.MODEL_PROVIDER = "deepseek";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("persists morning state, reflection, report, evidence and constrained tomorrow plan idempotently", async () => {
    const learning = new LearningService(repository);
    const goal = learning.createGoal({
      clientRequestId: crypto.randomUUID(), title: "FastAPI Daily Loop 验收", targetAbility: "后端工程",
      currentLevel: 1, targetLevelScore: 4, motivation: "成为能独立交付现场解决方案的 FDE",
      purpose: "用真实学习、复习和工程挑战证明后端工程能力", currentBasis: "会基础 Python",
      finalGoal: "独立交付可测试的 FastAPI 服务", targetLevel: "proficient", masteryLevel: 5,
      dailyMinutes: 75, weeklyDays: 5, deadline: null, engineeringOutcome: "FastAPI 服务", fdeLinked: true, dataKind: "user",
    });
    const legacy = new LearningRepository(repository.db);
    legacy.createDiagnostic(goal.id, {
      questions: ["concept", "explanation", "correction", "transfer", "practice"].map((type) => ({
        id: type, type: type as "concept" | "explanation" | "correction" | "transfer" | "practice",
        prompt: `解释 ${type}`, rubric: ["边界"], concept: "FastAPI 请求生命周期",
      })),
      knowledgeNodes: [{ title: "FastAPI 请求生命周期", description: "理解验证、路由、事务和响应", difficulty: 3, prerequisiteIndexes: [] }],
    }, "demo");
    const node = repository.db.prepare("SELECT id FROM knowledge_nodes WHERE goal_id=? LIMIT 1").get(goal.id) as { id: string };
    const reviewId = crypto.randomUUID();
    repository.db.prepare(
      "INSERT INTO review_schedule (id,goal_id,node_id,due_at,interval_days,reason,status,updated_at) VALUES (?,?,?,?,1,'延迟检索验证','scheduled',?)",
    ).run(reviewId, goal.id, node.id, "2000-01-01T00:00:00.000Z", new Date().toISOString());
    const challenge = new ProjectChallengeService(repository).createChallenge(goal.id, {
      clientRequestId: crypto.randomUUID(), challengeTitle: "FastAPI Daily Loop 工程挑战",
      targetAbilities: ["后端工程"], requirements: FASTAPI_REQUIREMENTS,
      acceptanceCriteria: FASTAPI_REQUIREMENTS, difficulty: 4, deadline: null, maxAiAssistance: 3,
      requiredTests: ["单元测试", "集成测试"], requiredDocs: ["README"], deploymentRequirement: "可本地运行", allowNetwork: false,
    });
    const agent = new LearningAgentService(repository);
    await agent.createPlan(goal.id);
    const mission = await agent.createTodayMission(goal.id);
    const daily = new DailyLearningService(repository);
    const morning = daily.ensureMorningBrief(goal.id);
    expect(morning.primaryTask).toContain(String(mission.learningObjective).slice(0, 20));
    expect(morning.reviewTasks).toHaveLength(1);
    expect(morning.challengeGap).toContain("仍需提交");

    const clientRequestId = crypto.randomUUID();
    const input = {
      action: "submit_evening" as const, goalId: goal.id, clientRequestId, actualMinutes: 68,
      completed: "完成 FastAPI 请求验证练习，并保存了通过与失败响应。",
      stuck: "数据库异常回滚与统一错误响应仍不稳定。",
      biggestGain: "明确了参数类型正确不等于业务规则有效，需要负向测试证明边界。",
      unfinished: "没有完成数据库失败路径的集成测试。",
      unfinishedReason: "原任务拆分过大，调试时间超过预估。",
      tomorrowAvailableMinutes: 90,
    };
    const first = await daily.act(input) as Record<string, unknown>;
    const retry = await daily.act(input) as Record<string, unknown>;
    expect(first.growthGraphUpdated).toBe(false);
    expect(first.evidenceApprovalRequired).toBe(true);
    expect(retry.duplicate).toBe(true);
    expect(repository.db.prepare("SELECT COUNT(*) count FROM evening_reflections").get()).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM daily_learning_reports").get()).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM daily_next_plans").get()).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM self_entries WHERE category='reflection'").get()).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM evidence_items WHERE source_type='self_entry'").get()).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM ability_change_snapshots").get()).toEqual({ count: 0 });

    const snapshot = daily.snapshot(goal.id);
    expect(snapshot.reports[0].facts.length).toBeGreaterThan(0);
    expect(snapshot.reports[0].alternativeExplanation).toBeTruthy();
    expect(snapshot.reports[0].tomorrowActions).toHaveLength(3);
    expect(snapshot.plans[0].availableMinutes).toBe(90);
    expect(snapshot.plans[0].reviewTaskIds).toContain(reviewId);
    expect(snapshot.plans[0].challengeIds).toContain(String(challenge.id));
    expect(snapshot.plans[0].rationale).toContain("Review Scheduler");
    expect(snapshot.plans[0].rationale).toContain("Adaptive Curriculum");
    expect(snapshot.plans[0].rationale).toContain("Project Challenge");
  });
});
