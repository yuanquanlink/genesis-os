import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import {
  GrowthRepository,
  growthConceptKey,
} from "@/lib/db/growth-repository";
import { ProfileRepository } from "@/lib/db/repository";
import { GrowthService } from "@/lib/services/growth-service";

describe("Genesis Growth Graph", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-growth-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("normalizes semantic duplicates before database uniqueness checks", () => {
    expect(growthConceptKey("ability", "项目闭环能力")).toBe(
      growthConceptKey("ability", "项目闭环与交付能力"),
    );
    expect(growthConceptKey("ability", "工程学习进展")).toBe(
      growthConceptKey("ability", "工程学习能力"),
    );
    expect(growthConceptKey("weakness", "执行不稳定、项目缺少闭环")).toBe(
      growthConceptKey("weakness", "执行不稳定与多项目未闭环"),
    );
  });

  it("does not promote raw self reports into formal project or ability nodes", () => {
    repository.createEntry({
      content:
        "我是湖南工商大学计算机卓工大一学生，目标成为FDE，做过Genesis OS、Kinetix和湖工商雷达。",
      category: "project",
      tags: ["FDE"],
      importance: 5,
      occurredAt: new Date().toISOString(),
      allowAi: false,
      clientRequestId: crypto.randomUUID(),
      dataKind: "user",
    });
    const snapshot = new GrowthService(repository).snapshot();
    expect(snapshot.nodes.some((node) => node.nodeType === "project")).toBe(false);
    expect(snapshot.nodes.some((node) => node.nodeType === "ability")).toBe(false);
    expect(snapshot.nodes.some((node) => node.nodeType === "goal")).toBe(true);
  });

  it("creates evidence candidates in Demo mode and only adds an ability after approval", async () => {
    repository.createEntry({
      content:
        "我是湖南工商大学计算机卓工大一学生，目标成为FDE。我正在开发Genesis OS、Kinetix和湖工商雷达，但计算机基础体系、软件工程规范和持续深挖能力仍不足。",
      category: "reflection",
      tags: ["FDE", "项目"],
      importance: 5,
      occurredAt: new Date().toISOString(),
      allowAi: false,
      clientRequestId: crypto.randomUUID(),
      dataKind: "user",
    });
    const service = new GrowthService(repository);
    const beforeFacts = repository.snapshot().facts.length;
    const analyzed = await service.analyze();
    const candidate = analyzed.candidates.find(
      (item) => item.status === "pending" && item.nodeType === "ability",
    );
    expect(candidate).toBeTruthy();
    expect(analyzed.nodes.some((node) => node.name === candidate?.name)).toBe(false);

    const approved = service.decideCandidate(candidate!.id, {
      action: "approve",
      name: candidate!.name,
      currentLevel: 2,
      nextImprovement: "通过独立交付和延迟测试继续验证",
    });
    const ability = approved.nodes.find((node) => node.name === candidate!.name);
    expect(ability).toMatchObject({ nodeType: "ability", currentLevel: 2 });
    expect(ability!.evidenceCount).toBeGreaterThan(0);
    expect(approved.radar.some((item) => item.id === ability!.id)).toBe(true);
    expect(repository.snapshot().facts.length).toBe(beforeFacts);
  });

  it("rejects unknown evidence references before persistence", () => {
    const growth = new GrowthRepository(repository);
    expect(() =>
      growth.saveAnalysis(
        {
          candidates: [
            {
              nodeType: "ability",
              name: "虚构能力",
              proposedLevel: 3,
              confidence: 0.5,
              nextImprovement: "无",
              relatedGoals: [],
              evidence: [
                { evidenceId: "MADE_UP", excerpt: "不存在", reason: "虚构" },
              ],
            },
          ],
          recommendation: {
            goal: "成为FDE",
            next30Days: [
              {
                focus: "测试",
                why: "验证",
                expectedImprovement: "形成证据",
                evidenceIds: ["MADE_UP"],
              },
            ],
            next90Days: {
              project: "项目",
              deliverables: ["产物"],
              evidenceIds: ["MADE_UP"],
            },
            nextYear: {
              stage: "阶段",
              proof: ["证据"],
              evidenceIds: ["MADE_UP"],
            },
            confidence: 0.5,
            limitations: [],
          },
        },
        {
          provider: "demo",
          model: "test",
          modelMode: "demo",
          promptVersion: "test",
          allowedEvidenceIds: new Set(["U1"]),
        },
      ),
    ).toThrow("GROWTH_UNKNOWN_EVIDENCE");
    expect(growth.snapshot().candidates).toHaveLength(0);
  });

  it("exposes only approved graph nodes to the Context Engine", async () => {
    repository.createEntry({
      content: "我通过Genesis OS项目练习AI应用开发，目标成为FDE。",
      category: "project",
      tags: ["FDE"],
      importance: 5,
      occurredAt: new Date().toISOString(),
      allowAi: false,
      clientRequestId: crypto.randomUUID(),
      dataKind: "user",
    });
    const service = new GrowthService(repository);
    const analyzed = await service.analyze();
    const candidate = analyzed.candidates.find((item) => item.nodeType === "ability")!;
    const before = new ContextEngine(repository).buildPacket({
      currentPage: "/today-learning",
    });
    expect(before.growthGraph.abilities.some((item) => item.value.includes(candidate.name))).toBe(false);

    service.decideCandidate(candidate.id, { action: "approve" });
    const after = new ContextEngine(repository).buildPacket({
      currentPage: "/today-learning",
    });
    const graphAbility = after.growthGraph.abilities.find((item) =>
      item.value.includes(candidate.name),
    );
    expect(graphAbility?.evidenceKind).toBe("system_record");
    expect(graphAbility?.evidenceIds[0]).toMatch(/^GG:/);
  });

  it("keeps rejected candidates out of the graph and records the decision", async () => {
    const service = new GrowthService(repository);
    const analyzed = await service.analyze();
    const candidate = analyzed.candidates.find((item) => item.status === "pending")!;
    const rejected = service.decideCandidate(candidate.id, { action: "reject" });
    expect(rejected.candidates.find((item) => item.id === candidate.id)?.status).toBe("rejected");
    expect(rejected.nodes.some((node) => node.name === candidate.name)).toBe(false);
    const audit = repository.db
      .prepare("SELECT action FROM audit_logs WHERE entity_id=?")
      .get(candidate.id) as { action: string };
    expect(audit.action).toBe("growth.candidate_rejected");
  });
});
