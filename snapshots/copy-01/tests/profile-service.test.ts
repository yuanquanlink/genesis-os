import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { ProfileService } from "@/lib/services/profile-service";

let directory = "";
let repository: ProfileRepository;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-service-test-"));
  repository = new ProfileRepository(path.join(directory, "test.db"));
});

afterEach(() => {
  repository.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("ProfileService partial failure", () => {
  it("keeps one raw entry and reuses its id when candidate persistence is retried", async () => {
    const input = {
      content: "今天完成了接口。\r\n第二行包含   连续空格，并补上测试。",
      category: "project",
      tags: ["可靠性"],
      importance: 5,
      occurredAt: new Date().toISOString(),
      allowAi: true,
      clientRequestId: crypto.randomUUID(),
    };
    const originalCreateProposals = repository.createProposalsDeduplicated.bind(repository);
    repository.createProposalsDeduplicated = (() => { throw new Error("SIMULATED_CANDIDATE_WRITE_FAILURE"); }) as typeof repository.createProposalsDeduplicated;

    const failed = await new ProfileService(repository).submitEntry(input);
    expect(failed.analysisStatus).toBe("failed");
    expect(repository.snapshot().entries).toHaveLength(1);
    expect(repository.snapshot().proposals).toHaveLength(0);

    repository.createProposalsDeduplicated = originalCreateProposals;
    const retried = await new ProfileService(repository).submitEntry(input);
    expect(retried.duplicate).toBe(true);
    expect(retried.candidates.length).toBeGreaterThan(0);
    expect(repository.snapshot().entries).toHaveLength(1);
  });

  it("returns an explicit duplicate result when the first analysis only added evidence to an existing fact", async () => {
    const service = new ProfileService(repository);
    const firstInput = { content: "今天完成并交付了正式项目，形成了可以验证的项目闭环。", category: "project", tags: ["正式"], importance: 5, occurredAt: new Date().toISOString(), allowAi: true, clientRequestId: crypto.randomUUID(), dataKind: "user" };
    const first = await service.submitEntry(firstInput);
    repository.decideProposal(first.candidates[0].id, "approve");
    const testText = "幂等性测试：今天再次完成项目交付，用于验证已有画像证据更新。";
    const testInput = { ...firstInput, content: testText, tags: ["测试"], clientRequestId: crypto.randomUUID(), dataKind: "test" };
    const evidenceResult = await service.submitEntry(testInput);
    expect(evidenceResult.evidenceUpdates).toEqual([expect.objectContaining({ added: true })]);
    const childCount = repository.db.prepare("SELECT count(*) n FROM life_events WHERE source_id=? AND event_type='profile_candidates_processed'").get(evidenceResult.id) as { n: number };
    const retry = await service.submitEntry({ ...testInput, clientRequestId: crypto.randomUUID() });
    expect(retry).toMatchObject({ id: evidenceResult.id, duplicate: true, duplicateReason: "same_content_window" });
    expect(retry.message).toContain("相同原文");
    expect(repository.db.prepare("SELECT count(*) n FROM life_events WHERE source_id=? AND event_type='profile_candidates_processed'").get(evidenceResult.id)).toMatchObject({ n: childCount.n });
  });
});
