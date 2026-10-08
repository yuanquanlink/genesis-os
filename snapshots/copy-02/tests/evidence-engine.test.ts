import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import { GrowthRepository } from "@/lib/db/growth-repository";
import { ProfileRepository } from "@/lib/db/repository";
import {
  EVIDENCE_ANALYSIS_BATCH_SIZE,
  EvidenceService,
} from "@/lib/services/evidence-service";
import { GrowthService } from "@/lib/services/growth-service";

describe("Genesis Evidence Engine", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-evidence-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function manual(type: "project" | "self_reflection", requestId = randomUUID()) {
    return {
      action: "create" as const,
      evidenceType: type,
      source: type === "project" ? "Genesis OS 本地项目" : "今日反思",
      description:
        type === "project"
          ? "完成 Genesis OS Evidence Engine 的服务端持久化和测试。"
          : "我觉得自己已经完全掌握软件工程。",
      relatedAbility: type === "project" ? "软件工程" : "Python",
      capturedAt: new Date().toISOString(),
      dataKind: "user" as const,
      clientRequestId: requestId,
    };
  }

  it("deduplicates identical evidence while preserving a second source reference", () => {
    const service = new EvidenceService(repository);
    const first = manual("project");
    service.createManual(first);
    service.createManual({ ...first, clientRequestId: randomUUID(), source: "第二次提交" });
    const snapshot = new EvidenceRepository(repository).snapshot(false);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].sources).toHaveLength(2);
  });

  it("keeps raw evidence pending, then links approval to Growth Graph with a before/after snapshot", async () => {
    const service = new EvidenceService(repository);
    service.createManual(manual("project"));
    const before = new EvidenceRepository(repository).snapshot(false);
    expect(before.items[0].verificationStatus).toBe("pending");
    const targetId = before.items.find((item) => item.sourceType === "manual")!.id;

    await service.analyze();
    const analyzed = new EvidenceRepository(repository).snapshot(false);
    expect(analyzed.items[0].latestEvaluation).toBeTruthy();
    expect(analyzed.stats.candidatesPending).toBeGreaterThan(0);
    const candidate = new GrowthRepository(repository)
      .snapshot(false)
      .candidates.find((item) => item.status === "pending" && item.candidateKind === "evidence_assessment" && item.evidence.some((evidence) => evidence.evidenceId === `EV:${targetId}`));
    expect(candidate).toBeTruthy();

    const approved = new GrowthService(repository).decideCandidate(candidate!.id, {
      action: "approve",
      currentLevel: 5,
    });
    const node = approved.nodes.find((item) => item.nodeType === "ability" && item.name === "软件工程");
    expect(node).toBeTruthy();
    expect(node!.currentLevel).toBe(1);
    expect(node!.evidence.some((item) => item.sourceType === "evidence_item")).toBe(true);
    const after = new EvidenceRepository(repository).snapshot(false);
    expect(after.items[0].verificationStatus).toBe("verified");
    const targetChange = after.abilityChanges.find((change) => change.evidenceItemId === targetId);
    expect(targetChange).toMatchObject({ previousLevel: 0, approvedLevel: 1 });
  });

  it("does not raise formal ability level from self reflection alone", async () => {
    const service = new EvidenceService(repository);
    service.createManual(manual("self_reflection"));
    const targetId = new EvidenceRepository(repository).snapshot(false).items.find((item) => item.sourceType === "manual")!.id;
    await service.analyze();
    const candidate = new GrowthRepository(repository)
      .snapshot(false)
      .candidates.find((item) => item.status === "pending" && item.candidateKind === "evidence_assessment" && item.evidence.some((evidence) => evidence.evidenceId === `EV:${targetId}`));
    expect(candidate).toBeTruthy();
    const result = new GrowthService(repository).decideCandidate(candidate!.id, {
      action: "approve",
      currentLevel: 4,
    });
    const node = result.nodes.find((item) => item.nodeType === "ability" && item.name === "Python");
    expect(node?.currentLevel).toBe(0);
    expect(new EvidenceRepository(repository).snapshot(false).items[0].verificationStatus).toBe("verified");
  });

  it("analyzes a bounded batch and leaves remaining raw evidence pending", async () => {
    const service = new EvidenceService(repository);
    for (let index = 0; index < EVIDENCE_ANALYSIS_BATCH_SIZE + 1; index += 1) {
      service.createManual({
        ...manual("project"),
        clientRequestId: randomUUID(),
        source: `项目验收 ${index + 1}`,
        description: `完成 Evidence Engine 第 ${index + 1} 组独立验收并保存测试结果。`,
      });
    }

    await service.analyze();

    const snapshot = new EvidenceRepository(repository).snapshot(false);
    expect(snapshot.items.filter((item) => item.latestEvaluation)).toHaveLength(
      EVIDENCE_ANALYSIS_BATCH_SIZE,
    );
    expect(
      snapshot.items.filter(
        (item) =>
          item.sourceType === "manual" && item.verificationStatus === "pending",
      ),
    ).toHaveLength(1);
  });
});
