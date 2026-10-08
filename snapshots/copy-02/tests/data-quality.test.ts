import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { selfEntryInputSchema, type ProfileCandidate } from "@/lib/domain/profile";

let directory = "";
let repository: ProfileRepository;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-quality-"));
  repository = new ProfileRepository(path.join(directory, "test.db"));
});
afterEach(() => {
  repository.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function input(content: string, requestId = crypto.randomUUID(), dataKind: "user" | "test" = "user") {
  return selfEntryInputSchema.parse({
    content, category: "project", tags: ["质量"], importance: 4,
    occurredAt: new Date().toISOString(), allowAi: true, clientRequestId: requestId, dataKind,
  });
}
function candidate(content: string, evidenceExcerpt: string, factType: ProfileCandidate["factType"] = "capability"): ProfileCandidate {
  return { content, factType, evidenceExcerpt, confidence: .66, possibleImpact: "需要后续证据继续验证" };
}

describe("M1 data quality", () => {
  it("suppresses double-click, request retry, and same-content retry at the server", () => {
    const requestId = crypto.randomUUID();
    const text = "今天完成了幂等接口并补上双击和网络重试测试。";
    const first = repository.createEntry(input(text, requestId));
    const exactRetry = repository.createEntry(input(text, requestId));
    const newKeySameText = repository.createEntry(input(text));
    expect(first.duplicate).toBe(false);
    expect(exactRetry).toMatchObject({ id: first.id, duplicate: true, duplicateReason: "idempotency_key" });
    expect(newKeySameText).toMatchObject({ id: first.id, duplicate: true, duplicateReason: "same_content_window" });
    expect(repository.snapshot().entries).toHaveLength(1);
  });

  it("reuses one pending candidate and attaches new evidence to an approved fact", () => {
    const firstText = "今天完成接口联调并通过测试，项目交付流程更加完整。";
    const secondText = "这周再次完成生产构建和验收，交付闭环得到新的支持。";
    const thirdText = "随后完成浏览器回归和迁移验证，继续支持同一能力判断。";
    const profile = "正在主动提升项目闭环与交付能力";
    const first = repository.createEntry(input(firstText));
    const firstResult = repository.createProposalsDeduplicated(first.id, [candidate(profile, firstText)], "demo");
    const second = repository.createEntry(input(secondText));
    const secondResult = repository.createProposalsDeduplicated(second.id, [candidate(profile, secondText)], "demo");
    expect(firstResult.records).toHaveLength(1);
    expect(secondResult.records).toHaveLength(0);
    expect(secondResult.reusedPending).toBe(1);
    expect(repository.snapshot().proposals).toHaveLength(1);
    expect(repository.snapshot().proposals[0].evidenceCount).toBe(2);
    repository.decideProposal(firstResult.records[0].id, "approve");
    const third = repository.createEntry(input(thirdText));
    const thirdResult = repository.createProposalsDeduplicated(third.id, [candidate(profile, thirdText)], "demo");
    expect(thirdResult.evidenceUpdates).toEqual([expect.objectContaining({ added: true })]);
    expect(repository.snapshot().facts).toHaveLength(1);
    expect(repository.snapshot().facts[0].evidenceCount).toBe(3);
  });

  it("merges facts without losing evidence and retains versions", () => {
    const textA = "我完成了服务端接口实现并通过真实数据库验证。";
    const textB = "我完成了移动端交互修复并通过浏览器验收流程。";
    const entryA = repository.createEntry(input(textA));
    const entryB = repository.createEntry(input(textB));
    const proposalA = repository.createProposals(entryA.id, [candidate("能够独立完成服务端交付", textA)], "demo")[0];
    const proposalB = repository.createProposals(entryB.id, [candidate("能够独立完成移动端验收", textB)], "demo")[0];
    const factA = repository.decideProposal(proposalA.id, "approve");
    const factB = repository.decideProposal(proposalB.id, "approve");
    const merged = repository.manageFact(String(factB.factId), { action: "merge", targetFactId: factA.factId, reason: "两条画像描述同一交付能力" });
    expect(merged).toMatchObject({ status: "merged", evidenceTransferred: 1 });
    const snapshot = repository.snapshot();
    expect(snapshot.facts).toHaveLength(1);
    expect(snapshot.facts[0].evidenceCount).toBe(2);
    expect(snapshot.inactiveFacts.find((fact) => fact.id === factB.factId)?.status).toBe("merged");
    expect(snapshot.inactiveFacts.find((fact) => fact.id === factB.factId)?.versions.length).toBeGreaterThan(1);
    repository.close();
    repository = new ProfileRepository(path.join(directory, "test.db"));
    expect(repository.snapshot().inactiveFacts.find((fact) => fact.id === factB.factId)?.status).toBe("merged");
  });

  it("archives records, clears only marked test data, and groups timeline children", () => {
    const formalText = "这是一条必须保留的正式用户记录，用于验证清理边界。";
    const testText = "这是一条明确标记为测试的数据，可以通过设置安全清理。";
    const formal = repository.createEntry(input(formalText));
    const test = repository.createEntry(input(testText, crypto.randomUUID(), "test"));
    repository.createProposals(test.id, [candidate("测试候选不会污染正式画像", testText, "state")], "demo");
    let snapshot = repository.snapshot();
    expect(snapshot.timeline.find((event) => event.sourceId === test.id)?.children).toHaveLength(1);
    expect(repository.cleanupPreview()).toMatchObject({ entries: 1, proposals: 1 });
    repository.manageEntry(formal.id, { action: "archive", reason: "用户确认归档正式原始输入" });
    expect(repository.snapshot().entries.find((item) => item.id === formal.id)?.status).toBe("archived");
    repository.clearTestData(true);
    snapshot = repository.snapshot();
    expect(snapshot.entries.some((item) => item.id === test.id)).toBe(false);
    expect(snapshot.entries.some((item) => item.id === formal.id)).toBe(true);
    expect(snapshot.timeline.some((event) => event.sourceId === test.id)).toBe(false);
    expect(repository.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='test_data.cleared'").get()).toMatchObject({ n: 1 });
  });

  it("can reclassify a historical entry as test data and propagate its timeline marker", () => {
    const text = "历史接口验收记录需要重新标记为测试数据后统一清理。";
    const created = repository.createEntry(input(text));
    repository.manageEntry(created.id, { action: "edit_metadata", category: "project", tags: ["验收"], dataKind: "test" });
    const snapshot = repository.snapshot();
    expect(snapshot.entries.find((entry) => entry.id === created.id)?.dataKind).toBe("test");
    expect(repository.cleanupPreview().entries).toBe(1);
    expect(repository.db.prepare("SELECT data_kind FROM life_events WHERE source_id=?").get(created.id)).toMatchObject({ data_kind: "test" });
  });

  it("removes test evidence from an existing formal fact without deleting the fact", () => {
    const formalText = "正式记录表明我完成了真实项目交付并形成稳定闭环。";
    const testText = "幂等性测试记录再次完成项目交付，用于验证证据清理。";
    const profile = "正在主动提升项目闭环与交付能力";
    const formalEntry = repository.createEntry(input(formalText));
    const proposal = repository.createProposals(formalEntry.id, [candidate(profile, formalText)], "demo")[0];
    repository.decideProposal(proposal.id, "approve");
    const testEntry = repository.createEntry(input(testText, crypto.randomUUID(), "test"));
    repository.createProposalsDeduplicated(testEntry.id, [candidate(profile, testText)], "demo");
    expect(repository.snapshot().facts[0].evidenceCount).toBe(2);
    expect(repository.cleanupPreview().protectedEntries).toBe(0);
    repository.clearTestData(true);
    const cleaned = repository.snapshot();
    expect(cleaned.facts).toHaveLength(1);
    expect(cleaned.facts[0].evidenceCount).toBe(1);
    expect(cleaned.entries.some((entry) => entry.id === testEntry.id)).toBe(false);
    expect(cleaned.entries.some((entry) => entry.id === formalEntry.id)).toBe(true);
  });

  it("does not show cleaned test-only facts in the recoverable formal history", () => {
    const testText = "Test-only source that must not remain visible in the formal profile history.";
    const testEntry = repository.createEntry(input(testText, crypto.randomUUID(), "test"));
    const proposal = repository.createProposals(
      testEntry.id,
      [candidate("Test-only profile fact", testText, "state")],
      "demo",
    )[0];
    repository.decideProposal(proposal.id, "approve");

    repository.clearTestData(false);

    const cleaned = repository.snapshot();
    expect(cleaned.facts).toHaveLength(0);
    expect(cleaned.inactiveFacts).toHaveLength(0);
    expect(repository.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='test_data.cleared'").get()).toMatchObject({ n: 1 });
  });
});
