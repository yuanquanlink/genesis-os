import { describe, expect, it } from "vitest";
import { demoExtractCandidates, profileCandidatesSchema, selfEntryInputSchema, validateCandidateEvidence } from "@/lib/domain/profile";

const input = selfEntryInputSchema.parse({ content: "今天完成并部署了登录流程，还补上了集成测试，没有再开新项目。", category: "project", tags: ["闭环"], importance: 4, occurredAt: new Date().toISOString(), allowAi: true, clientRequestId: crypto.randomUUID() });

describe("profile domain", () => {
  it("extracts evidence-bound candidates in demo mode", () => {
    const candidates = demoExtractCandidates(input);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].evidenceExcerpt).toContain("完成并部署");
    expect(() => profileCandidatesSchema.parse({ candidates })).not.toThrow();
  });
  it("respects opt-out", () => expect(demoExtractCandidates({ ...input, allowAi: false })).toEqual([]));
  it("rejects underspecified raw records", () => expect(() => selfEntryInputSchema.parse({ ...input, content: "太短" })).toThrow());
  it("rejects invalid AI confidence", () => expect(() => profileCandidatesSchema.parse({ candidates: [{ ...demoExtractCandidates(input)[0], confidence: 1.2 }] })).toThrow());
  it("rejects AI evidence that is not present in the raw record", () => {
    const candidate = { ...demoExtractCandidates(input)[0], evidenceExcerpt: "这段文字从未由用户提供" };
    expect(() => validateCandidateEvidence(input.content, [candidate])).toThrow("INVALID_EVIDENCE_REFERENCE");
  });
  it("keeps demo evidence byte-for-byte inside multiline source text", () => {
    const multiline = selfEntryInputSchema.parse({ ...input, content: "今天完成了接口。\r\n第二行包含   连续空格，并补上测试。", clientRequestId: crypto.randomUUID() });
    const candidates = demoExtractCandidates(multiline);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) expect(multiline.content).toContain(candidate.evidenceExcerpt);
    expect(() => validateCandidateEvidence(multiline.content, candidates)).not.toThrow();
  });
});
