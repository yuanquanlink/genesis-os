import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";

describe("AI deep learning vertical loop", () => {
  let directory = "";
  let repository: ProfileRepository;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-learning-"));
    process.env.GENESIS_UPLOAD_PATH = path.join(directory, "uploads");
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });
  afterEach(() => { repository.close(); delete process.env.GENESIS_UPLOAD_PATH; fs.rmSync(directory, { recursive: true, force: true }); });

  it("persists upload, baseline, 21-stage session, mastery, outcome, timeline and pending profile candidate", async () => {
    const service = new LearningService(repository);
    const goal = service.createGoal({ clientRequestId: crypto.randomUUID(), title: "TypeScript 服务端工程", purpose: "为了独立交付可靠的全栈产品并理解失败边界", targetLevel: "working", dailyMinutes: 45, deadline: null, engineeringOutcome: "部署一个带测试、错误处理和验收文档的 API 服务" });
    const form = new FormData();
    form.set("goalId", goal.id); form.set("clientRequestId", crypto.randomUUID());
    form.set("file", new File(["# 类型系统\n类型约束帮助我们在运行前发现错误。\n# API 边界\n所有外部输入必须验证，并对失败给出可恢复错误。\n# 测试与部署\n使用测试证据验证接口、错误路径和生产构建。"], "guide.md", { type: "text/markdown" }));
    const resource = await service.addUploadedResource(form);
    expect(resource.status).toBe("ready");
    expect(fs.existsSync(resource.storagePath)).toBe(true);

    const baseline = await service.generateBaseline(goal.id);
    expect(baseline.questions).toHaveLength(5);
    const submitted = service.submitBaseline(goal.id, { answers: baseline.questions.map((question: { id: string; rubric: string[] }) => ({ questionId: question.id, answer: `${question.rubric.join("，")}。因为需要证据，所以会设计失败路径、测试和验收结果。` })) });
    expect(submitted.status).toBe("submitted");
    expect(submitted.optimisticMinutes).toBeLessThan(submitted.conservativeMinutes);

    let session = service.startSession(goal.id, { clientRequestId: crypto.randomUUID() });
    expect(session.stages).toHaveLength(21);
    for (let index = 0; index < session.stages.length; index += 1) {
      session = await service.answerSession(session.id, { clientRequestId: crypto.randomUUID(), response: "因为前提会影响过程，所以我会用反例、失败路径、测试输出和部署结果作为证据。```ts\nconst verified = true\n```", responseTimeSeconds: 45, confidence: 4, codeAuthorship: "user_independent" });
    }
    expect(session.status).toBe("completed");
    const learned = service.snapshot();
    expect(learned.evidence.length).toBeGreaterThanOrEqual(9);
    expect(Number(learned.nodes[0].mastery)).toBeGreaterThan(0.65);
    expect(learned.reviews).toHaveLength(1);

    const outcome = await service.recordOutcome(goal.id, { title: "已部署的 TypeScript API", artifactUrl: "https://github.com/example/api", deploymentUrl: "https://example.com", demoNotes: "接口、错误路径和生产构建均已通过真实验收。", retrospective: "我理解了输入验证和测试证据的重要性，下次会更早验证失败路径并记录部署日志。", codeAuthorship: "user_independent", status: "reviewed", clientRequestId: crypto.randomUUID() });
    expect(outcome.profileCandidateRequiresApproval).toBe(true);
    const profile = repository.snapshot();
    expect(profile.timeline.some((item) => item.eventType === "learning_session")).toBe(true);
    expect(profile.proposals.some((item) => item.status === "pending")).toBe(true);
  });

  it("keeps an explicit unsupported record when video captions are unavailable", async () => {
    const service = new LearningService(repository);
    const goal = service.createGoal({ clientRequestId: crypto.randomUUID(), title: "公开视频学习", purpose: "验证无法取得字幕时系统不会伪装已经分析", targetLevel: "literacy", dailyMinutes: 20, deadline: null, engineeringOutcome: "提交一个带来源状态说明的学习报告" });
    const resource = await service.addUrlResource({ goalId: goal.id, clientRequestId: crypto.randomUUID(), url: "https://www.youtube.com/watch?v=test", sourceType: "video" });
    expect(resource.status).toBe("unsupported");
    expect(resource.errorCode).toBe("captions_unavailable");
    expect(service.snapshot().resources).toHaveLength(1);
  });
});
