import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";
import { LearningAgentService } from "@/lib/services/learning-agent-service";
import { learningGoalInputSchema } from "@/lib/domain/learning";

describe("Genesis AI Learning Agent MVP", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-learning-agent-"));
    process.env.GENESIS_UPLOAD_PATH = path.join(directory, "uploads");
    process.env.MODEL_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    delete process.env.GENESIS_UPLOAD_PATH;
    delete process.env.MODEL_PROVIDER;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function createGoal() {
    return new LearningService(repository).createGoal({
      clientRequestId: crypto.randomUUID(),
      title: "Python 工程能力提升",
      targetAbility: "Python 工程能力",
      currentLevel: 1,
      targetLevelScore: 4,
      motivation: "成为能够独立交付真实 AI 应用解决方案的 FDE",
      purpose: "补齐 Python 工程基础并通过真实项目证明可以独立交付",
      currentBasis: "会基础语法，但测试、数据库、错误处理和部署能力尚未验证",
      finalGoal: "独立解释、实现、测试和部署一个 Python AI 应用后端",
      targetLevel: "proficient",
      masteryLevel: 5,
      dailyMinutes: 60,
      weeklyDays: 5,
      deadline: null,
      engineeringOutcome: "交付一个包含 API、Schema、数据库、测试和部署文档的后端项目",
      fdeLinked: true,
      dataKind: "user",
    });
  }

  it("rejects a 0-5 target level that does not exceed the current level", () => {
    const parsed = learningGoalInputSchema.safeParse({
      clientRequestId: crypto.randomUUID(),
      title: "无效等级目标",
      targetAbility: "Python",
      currentLevel: 4,
      targetLevelScore: 4,
      motivation: "验证能力等级边界不会被错误接受",
      purpose: "验证目标等级必须严格高于当前能力等级",
      targetLevel: "proficient",
      dailyMinutes: 30,
      deadline: null,
      engineeringOutcome: "完成一个可验证的边界测试工程成果",
    });
    expect(parsed.success).toBe(false);
  });

  it("persists a context-driven diagnosis and exactly five curriculum phases", async () => {
    const goal = createGoal();
    const agent = new LearningAgentService(repository);
    const plan = await agent.createPlan(goal.id);
    expect(plan.duplicate).toBe(false);
    expect(plan.diagnosis?.currentLevel).toBe(1);
    expect(plan.diagnosis?.strengths.length).toBeGreaterThan(0);
    expect(plan.diagnosis?.weaknesses.length).toBeGreaterThan(0);
    expect(plan.curriculum.map((phase) => phase.phaseKey)).toEqual([
      "foundation",
      "application",
      "engineering",
      "independent_project",
      "innovation",
    ]);
    expect(agent.snapshot(goal.id).curricula).toHaveLength(5);
    expect((await agent.createPlan(goal.id)).duplicate).toBe(true);
  });

  it("keeps Today Mission idempotent per goal and local date", async () => {
    const goal = createGoal();
    const agent = new LearningAgentService(repository);
    await agent.createPlan(goal.id);
    const first = await agent.createTodayMission(goal.id);
    const retry = await agent.createTodayMission(goal.id);
    expect(first.id).toBe(retry.id);
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(agent.snapshot(goal.id).missions).toHaveLength(1);
  });

  it("records one result, generates a pending Evidence Candidate and never mutates Growth Graph automatically", async () => {
    const goal = createGoal();
    const agent = new LearningAgentService(repository);
    await agent.createPlan(goal.id);
    const mission = await agent.createTodayMission(goal.id);
    const clientRequestId = crypto.randomUUID();
    const result = await agent.recordResult(goal.id, {
      clientRequestId,
      missionId: mission.id,
      summary: "我独立解释了 FastAPI 请求验证的边界和从输入到响应的因果链。",
      practiceOutput: "实现了带 Zod 等价 Schema、错误路径和自动化测试的 API；测试输出 8/8 通过，并记录了无效参数失败日志。",
      reflection: "最初把运行成功当成掌握；纠正后增加了反例、失败测试和对请求生命周期的解释。",
      artifactUrl: "https://github.com/example/learning-agent-proof",
      completionStatus: "completed",
      confidence: 4,
    });
    expect(result.duplicate).toBe(false);
    expect(result.evidenceHandoff.evidenceItemId).toBeTruthy();
    expect(result.evidenceHandoff.growthGraphUpdated).toBe(false);
    expect(result.evidenceHandoff.approvalRequired).toBe(true);

    const evidenceItem = repository.db
      .prepare("SELECT * FROM evidence_items WHERE source_type='learning_agent_result' AND source_id=?")
      .get(result.id) as Record<string, unknown>;
    expect(evidenceItem).toBeTruthy();
    const candidate = repository.db
      .prepare("SELECT * FROM growth_evidence_candidates WHERE id=? AND status='pending'")
      .get(result.evidenceHandoff.candidateId) as Record<string, unknown> | undefined;
    expect(candidate).toBeTruthy();
    const formalAbility = repository.db
      .prepare("SELECT * FROM growth_nodes WHERE node_type='ability' AND name='Python 工程能力'")
      .get();
    expect(formalAbility).toBeUndefined();

    const retry = await agent.recordResult(goal.id, {
      clientRequestId,
      missionId: mission.id,
      summary: "我独立解释了 FastAPI 请求验证的边界和从输入到响应的因果链。",
      practiceOutput: "实现了带 Zod 等价 Schema、错误路径和自动化测试的 API；测试输出 8/8 通过，并记录了无效参数失败日志。",
      reflection: "最初把运行成功当成掌握；纠正后增加了反例、失败测试和对请求生命周期的解释。",
      artifactUrl: "https://github.com/example/learning-agent-proof",
      completionStatus: "completed",
      confidence: 4,
    });
    expect(retry.duplicate).toBe(true);
    const count = repository.db
      .prepare("SELECT count(*) count FROM evidence_items WHERE source_type='learning_agent_result'")
      .get() as { count: number };
    expect(count.count).toBe(1);
  });
});
