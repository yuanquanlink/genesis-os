import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";

describe("learning engine data quality and delayed evidence", () => {
  let directory = "";
  let repository: ProfileRepository;
  let service: LearningService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-learning-quality-"));
    process.env.GENESIS_UPLOAD_PATH = path.join(directory, "uploads");
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
    service = new LearningService(repository);
  });

  afterEach(() => {
    repository.close();
    delete process.env.GENESIS_UPLOAD_PATH;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function preparedGoal() {
    const goal = service.createGoal({
      clientRequestId: crypto.randomUUID(), title: "FastAPI 可靠服务", purpose: "为了独立设计、测试并部署可靠的 AI 应用后端",
      targetLevel: "proficient", dailyMinutes: 60, deadline: null,
      engineeringOutcome: "交付一个含数据库、错误处理、测试、文档与部署的 FastAPI 服务",
    });
    const form = new FormData();
    form.set("goalId", goal.id); form.set("clientRequestId", crypto.randomUUID());
    form.set("file", new File(["# 输入验证\n请求参数必须经过 Schema 验证。\n\n# 失败路径\n数据库与外部 AI 超时必须返回可恢复错误。\n\n# 自动化测试\n覆盖成功、失败、权限和幂等场景。"], "fastapi.md", { type: "text/markdown" }));
    await service.addUploadedResource(form);
    const baseline = await service.generateBaseline(goal.id);
    service.submitBaseline(goal.id, { answers: baseline.questions.map((question: { id: string; rubric: string[] }, index: number) => ({
      questionId: question.id, answer: `${question.rubric.join("、")}。因为边界会影响结果，所以用失败测试、日志和部署结果验证。`, responseTimeSeconds: 30 + index, confidence: 4,
    })) });
    return goal;
  }

  it("deduplicates identical source content and preserves structured source locators", async () => {
    const goal = service.createGoal({ clientRequestId: crypto.randomUUID(), title: "资料去重验证", purpose: "验证相同原始资料不会产生重复分析记录", targetLevel: "working", dailyMinutes: 30, deadline: null, engineeringOutcome: "形成一份可引用来源位置的分析报告" });
    const add = async () => {
      const form = new FormData();
      form.set("goalId", goal.id); form.set("clientRequestId", crypto.randomUUID());
      form.set("file", new File(["# 唯一主题\n这是同一份资料的稳定内容，并包含可以定位的标题和段落。"], "same.md", { type: "text/markdown" }));
      return service.addUploadedResource(form);
    };
    const first = await add();
    const duplicate = await add();
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    const snapshot = service.snapshot();
    expect(snapshot.resources).toHaveLength(1);
    expect(snapshot.resources[0].sections.length).toBeGreaterThan(0);
    expect(snapshot.resources[0].sections[0].locatorType).toBe("heading");
    expect(snapshot.resources[0].processingJobs).toHaveLength(1);
  });

  it("does not count a cached baseline as another provider call", async () => {
    const goal = service.createGoal({ clientRequestId: crypto.randomUUID(), title: "基线缓存记账", purpose: "验证缓存不会虚增模型调用与成本", targetLevel: "working", dailyMinutes: 30, deadline: null, engineeringOutcome: "形成一份带测试证据的诊断报告" });
    const form = new FormData();
    form.set("goalId", goal.id);
    form.set("clientRequestId", crypto.randomUUID());
    form.set("file", new File(["# 缓存测试\n同一目标和资料只应生成并记账一次。"], "cache.md", { type: "text/markdown" }));
    await service.addUploadedResource(form);
    await service.generateBaseline(goal.id);
    await service.generateBaseline(goal.id);
    expect(repository.db.prepare("SELECT count(*) count FROM ai_usage_logs WHERE purpose='learning_baseline'").get()).toEqual({ count: 1 });
  });

  it("stores five raw assessment attempts with time, confidence, evaluation and source", async () => {
    await preparedGoal();
    const snapshot = service.snapshot();
    expect(snapshot.assessmentAttempts).toHaveLength(5);
    expect(snapshot.assessmentAttempts.map((attempt) => attempt.responseTimeSeconds)).toEqual([30, 31, 32, 33, 34]);
    expect(snapshot.assessmentAttempts.every((attempt) => attempt.confidence === 4)).toBe(true);
    expect(snapshot.assessmentAttempts.every((attempt) => attempt.aiEvaluation && attempt.evidenceSource)).toBe(true);
    expect(snapshot.timeEstimates).toHaveLength(1);
  });

  it("makes session answer retries idempotent and records only one interaction", async () => {
    const goal = await preparedGoal();
    const session = service.startSession(goal.id, { clientRequestId: crypto.randomUUID() });
    const clientRequestId = crypto.randomUUID();
    const answer = { clientRequestId, response: "因为请求边界影响内部状态，所以我会用失败用例、断言、日志与真实输出验证。", responseTimeSeconds: 52, confidence: 4 };
    const first = await service.answerSession(session.id, answer);
    const retry = await service.answerSession(session.id, answer);
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(repository.db.prepare("SELECT COUNT(*) AS count FROM session_interactions WHERE session_id=?").get(session.id)).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) AS count FROM mastery_evidence WHERE session_id=?").get(session.id)).toEqual({ count: 1 });
  });

  it("rejects early review, then stores one delayed attempt and reschedules it", async () => {
    const goal = await preparedGoal();
    let session = service.startSession(goal.id, { clientRequestId: crypto.randomUUID() });
    for (let index = 0; index < session.stages.length; index += 1) {
      session = await service.answerSession(session.id, { clientRequestId: crypto.randomUUID(), response: "因为前提决定机制，所以我给出反例、失败边界、测试断言、运行日志和迁移场景作为独立证据。", responseTimeSeconds: 40, confidence: 4, codeAuthorship: "user_independent" });
    }
    const review = service.snapshot().reviews[0];
    expect(() => service.submitReview(review.id, { clientRequestId: crypto.randomUUID(), response: "提前作答", responseTimeSeconds: 4, confidence: 2 })).toThrow("REVIEW_NOT_DUE");
    repository.db.prepare("UPDATE review_schedule SET due_at=? WHERE id=?").run("2000-01-01T00:00:00.000Z", review.id);
    const requestId = crypto.randomUUID();
    const result = service.submitReview(review.id, { clientRequestId: requestId, response: "因为输入验证失败会导致状态污染，所以用边界反例、自动化测试和日志证据验证，并迁移到新的接口场景。", responseTimeSeconds: 75, confidence: 4 });
    const retry = service.submitReview(review.id, { clientRequestId: requestId, response: "重复网络请求", responseTimeSeconds: 75, confidence: 4 });
    expect(result.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    const snapshot = service.snapshot();
    expect(snapshot.reviewAttempts).toHaveLength(1);
    expect(snapshot.evidence.some((item) => item.evidenceType === "delayed_test" && item.isDelayed === 1)).toBe(true);
    expect(new Date(snapshot.reviews[0].dueAt).getTime()).toBeGreaterThan(Date.now());
  });
});
