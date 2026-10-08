import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";
import { EvidenceService } from "@/lib/services/evidence-service";

describe("Genesis Context Engine", () => {
  let directory = "";
  let repository: ProfileRepository;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-context-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });
  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("builds working, recent and long-term memory with traceable identity evidence", () => {
    repository.createEntry({
      content: "我是湖南工商大学计算机科学与技术卓越班学生，大一结束进入大二，目标成为FDE。做过Genesis OS和Kinetix项目。我的短板是编程数学基础不足、执行不稳定、项目缺少闭环。",
      category: "reflection",
      tags: ["身份", "FDE"],
      importance: 5,
      occurredAt: "2026-08-03T01:00:00.000Z",
      allowAi: false,
      clientRequestId: crypto.randomUUID(),
      dataKind: "user",
    });
    const prepared = new ContextEngine(repository).prepare({
      currentPage: "/today-learning",
      currentTask: "导师分析",
      currentQuestion: "分析我的问题",
      currentChapter: "Python并发",
      currentConversation: [{ role: "user", content: "分析我的问题" }],
    });
    const packet = prepared.packet!;
    expect(packet.identity.school?.value).toContain("湖南工商大学");
    expect(packet.identity.major?.value).toContain("计算机");
    expect(packet.identity.careerGoal?.value).toContain("FDE");
    expect(packet.currentProjects.some((entry) => /Genesis|Kinetix/.test(entry.value))).toBe(true);
    expect(packet.weaknesses.some((entry) => /编程|数学|执行|闭环/.test(entry.value))).toBe(true);
    expect(packet.memory.working.currentChapter).toBe("Python并发");
    expect(packet.memory.recent.inputs.length).toBeGreaterThan(0);
    expect(packet.memory.longTerm.longTermGoals.length).toBeGreaterThan(0);
    expect(prepared.evidenceCount).toBeGreaterThan(1);
  });

  it("excludes test goals and keeps the compressed packet inside its budget", () => {
    const service = new LearningService(repository);
    const create = (title: string, dataKind: "user" | "test") =>
      service.createGoal({ clientRequestId: crypto.randomUUID(), title, purpose: "用真实练习形成可以验证的长期工程能力", currentBasis: "已经完成基础语法学习", finalGoal: "独立交付可部署服务", targetLevel: "working", dailyMinutes: 45, deadline: null, engineeringOutcome: "交付一个包含测试文档的服务", dataKind });
    create("正式学习目标", "user");
    create("接口验收测试目标", "test");
    const packet = new ContextEngine(repository).buildPacket(
      { currentPage: "/learning", currentTask: "规划", currentQuestion: "分析我的问题", currentChapter: null, currentConversation: [] },
      { maxCharacters: 3_500 },
    );
    expect(packet.learningStatus.some((entry) => entry.value.includes("正式学习目标"))).toBe(true);
    expect(packet.learningStatus.some((entry) => entry.value.includes("接口验收测试目标"))).toBe(false);
    expect(packet.meta.characterCount).toBeLessThanOrEqual(3_900);
    expect(new ContextEngine(repository).prepare({ currentPage: "/learning" }, "none")).toMatchObject({ packet: null, evidenceCount: 0, mode: "none" });
  });

  it("keeps business AI modules behind ContextEngine", () => {
    const root = process.cwd();
    for (const file of ["app/api/ai/mentor/route.ts", "lib/services/mentor-service.ts", "lib/ai/mentor-analysis.ts", "lib/ai/profile-extractor.ts", "lib/ai/learning-engine.ts", "lib/services/growth-service.ts", "lib/ai/future-modules.ts"])
      expect(fs.readFileSync(path.join(root, file), "utf8")).not.toContain("getAIRouter");
  });

  it("adds evaluated Evidence to the packet without treating a pending candidate as formal ability", async () => {
    const evidence = new EvidenceService(repository);
    evidence.createManual({
      action: "create",
      evidenceType: "project",
      source: "Genesis OS 本地验收",
      description: "完成 Evidence Engine 的真实浏览器审批闭环并保存测试结果。",
      relatedAbility: "软件工程",
      capturedAt: new Date().toISOString(),
      dataKind: "user",
      clientRequestId: crypto.randomUUID(),
    });
    await evidence.analyze();

    const packet = new ContextEngine(repository).buildPacket({
      currentPage: "/today-learning",
      currentTask: "导师分析",
      currentQuestion: "我的证据说明了什么？",
      currentChapter: null,
      currentConversation: [],
    });

    const targetEvidence = packet.verifiedEvidence.find((item) =>
      item.value.includes("真实浏览器审批闭环"),
    );
    expect(targetEvidence).toBeTruthy();
    expect(targetEvidence!.evidenceIds[0]).toMatch(/^EV:/);
    expect(targetEvidence!.value).toContain("能力候选状态=pending");
    expect(packet.growthGraph.abilities.some((item) => item.value.includes("软件工程"))).toBe(false);
    expect(packet.compressedSummaries.importantEvidence).toContain("EV:");
  });
});
