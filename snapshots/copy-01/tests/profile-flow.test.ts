import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { demoExtractCandidates, selfEntryInputSchema } from "@/lib/domain/profile";

let directory = ""; let repository: ProfileRepository;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-test-")); repository = new ProfileRepository(path.join(directory, "test.db")); });
afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

describe("profile vertical loop", () => {
  it("persists raw text, prevents duplicates, and only writes approved facts", () => {
    const input = selfEntryInputSchema.parse({ content: "今天完成了真实接口并补上测试，发现自己需要继续训练项目闭环。", category: "project", tags: ["FDE"], importance: 5, occurredAt: new Date().toISOString(), allowAi: true, clientRequestId: crypto.randomUUID() });
    const created = repository.createEntry(input);
    expect(repository.createEntry(input).duplicate).toBe(true);
    const proposals = repository.createProposals(created.id, demoExtractCandidates(input), "demo");
    expect(repository.snapshot().facts).toHaveLength(0);
    repository.decideProposal(proposals[0].id, "edit", "正在通过真实接口和测试提升项目闭环能力");
    expect(repository.snapshot().proposals[0].proposedContent).toContain("真实接口");
    repository.decideProposal(proposals[0].id, "approve");
    if (proposals[1]) repository.decideProposal(proposals[1].id, "reject");
    const snapshot = repository.snapshot();
    expect(snapshot.entries[0].content).toBe(input.content);
    expect(snapshot.facts).toHaveLength(1);
    expect(snapshot.facts[0].sourceEntryId).toBe(created.id);
    expect(snapshot.timeline.some((event) => event.eventType === "profile_fact_approved")).toBe(true);
    expect(snapshot.proposals.find((item) => item.id === proposals[1]?.id)?.status).toBe("rejected");
    repository.revokeFact(snapshot.facts[0].id, "这条结论后来被更多证据推翻");
    const revoked = repository.snapshot();
    expect(revoked.facts).toHaveLength(0);
    expect(revoked.timeline.some((event) => event.eventType === "profile_fact_revoked")).toBe(true);
  });

  it("enforces evidence and approval invariants at the database boundary", () => {
    const input = selfEntryInputSchema.parse({ content: "今天完成了真实接口并补上测试，继续验证项目闭环能力。", category: "project", tags: [], importance: 4, occurredAt: new Date().toISOString(), allowAi: true, clientRequestId: crypto.randomUUID() });
    const created = repository.createEntry(input);
    expect(() => repository.createProposals(created.id, [{ content: "无来源结论", factType: "state", evidenceExcerpt: "不存在的原文", confidence: .5, possibleImpact: "必须被数据库拒绝" }], "openai")).toThrow("INVALID_PROFILE_PROPOSAL");
    const migrations = repository.db.prepare("SELECT name FROM schema_migrations ORDER BY name").all() as Array<{ name: string }>;
    const migrationNames = migrations.map((item) => item.name);
    expect(migrationNames).toEqual(expect.arrayContaining(["0001_profile_loop.sql", "0002_release_hardening.sql", "0003_ai_traceability.sql", "0004_data_quality.sql"]));
    expect(new Set(migrationNames).size).toBe(migrationNames.length);
  });
});
