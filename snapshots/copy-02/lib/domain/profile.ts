import { z } from "zod";

export const entryCategorySchema = z.enum([
  "experience",
  "learning",
  "project",
  "reflection",
  "decision",
  "goal",
  "state",
]);

export const selfEntryInputSchema = z.object({
  content: z.string().trim().min(10, "请至少写 10 个字，保留足够证据上下文").max(10_000),
  category: entryCategorySchema,
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  importance: z.number().int().min(1).max(5),
  occurredAt: z.string().datetime(),
  allowAi: z.boolean(),
  clientRequestId: z.string().uuid(),
  dataKind: z.enum(["user", "demo", "test"]).default("user"),
});

export const profileCandidateSchema = z.object({
  content: z.string().trim().min(4).max(500),
  factType: z.enum(["capability", "goal", "interest", "value", "pattern", "risk", "opportunity", "state"]),
  evidenceExcerpt: z.string().trim().min(2).max(500),
  confidence: z.number().min(0).max(1),
  possibleImpact: z.string().trim().min(2).max(500),
});

export const profileCandidatesSchema = z.object({
  candidates: z.array(profileCandidateSchema).max(4),
});

export const proposalDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("edit"), content: z.string().trim().min(4).max(500) }),
]);

export const profileFactDecisionSchema = z.object({
  action: z.literal("revoke"),
  reason: z.string().trim().min(4).max(300),
});

export const profileFactManagementSchema = z.discriminatedUnion("action", [
  profileFactDecisionSchema,
  z.object({ action: z.literal("edit"), content: z.string().trim().min(4).max(500), reason: z.string().trim().min(4).max(300) }),
  z.object({ action: z.literal("archive"), reason: z.string().trim().min(4).max(300) }),
  z.object({ action: z.literal("delete"), reason: z.string().trim().min(4).max(300) }),
  z.object({ action: z.literal("restore"), reason: z.string().trim().min(4).max(300) }),
  z.object({ action: z.literal("restore_version"), version: z.number().int().positive() }),
  z.object({ action: z.literal("merge"), targetFactId: z.string().uuid(), reason: z.string().trim().min(4).max(300) }),
]);

export const selfEntryManagementSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit_metadata"), category: entryCategorySchema, tags: z.array(z.string().trim().min(1).max(24)).max(8), dataKind: z.enum(["user", "demo", "test"]) }),
  z.object({ action: z.literal("archive"), reason: z.string().trim().min(4).max(300) }),
  z.object({ action: z.literal("delete"), reason: z.string().trim().min(4).max(300) }),
  z.object({ action: z.literal("mark_duplicate") }),
]);

export const timelineManagementSchema = z.object({ action: z.literal("hide") });

export const cleanupRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview") }),
  z.object({ action: z.literal("execute"), confirmation: z.literal("CLEAR_TEST_DATA"), keepConfirmedFacts: z.boolean().default(true) }),
]);

export const entityIdSchema = z.string().uuid();

export type SelfEntryInput = z.infer<typeof selfEntryInputSchema>;
export type ProfileCandidate = z.infer<typeof profileCandidateSchema>;

export function validateCandidateEvidence(content: string, candidates: ProfileCandidate[]) {
  const normalizedSource = content.replace(/\r\n/g, "\n");
  const unique = new Set<string>();
  for (const candidate of candidates) {
    if (!normalizedSource.includes(candidate.evidenceExcerpt.replace(/\r\n/g, "\n"))) {
      throw new Error("INVALID_EVIDENCE_REFERENCE");
    }
    const key = `${candidate.factType}:${candidate.content.toLocaleLowerCase("zh-CN")}`;
    if (unique.has(key)) throw new Error("DUPLICATE_PROFILE_CANDIDATE");
    unique.add(key);
  }
  return candidates;
}

export function demoExtractCandidates(input: SelfEntryInput): ProfileCandidate[] {
  if (!input.allowAi) return [];
  const exactSource = input.content.trim();
  const normalized = exactSource.replace(/\s+/g, " ");
  // Evidence must remain an exact substring of the persisted source. The
  // normalized copy is only for rule matching and must never be cited.
  const excerpt = exactSource.slice(0, 220);
  const candidates: ProfileCandidate[] = [];
  const add = (content: string, factType: ProfileCandidate["factType"], confidence: number, impact: string) => {
    candidates.push({ content, factType, confidence, evidenceExcerpt: excerpt, possibleImpact: impact });
  };

  if (/完成|交付|上线|部署|闭环/.test(normalized)) {
    add("正在主动提升项目闭环与交付能力", "capability", 0.64, "若后续项目证据持续出现，可提高项目闭环能力判断的置信度。");
  }
  if (/拖延|没做|未完成|放弃|开新坑|分心/.test(normalized)) {
    add("近期可能存在执行稳定性或目标切换风险", "risk", 0.53, "需要结合后续完成记录验证，不能由单次事件定义为长期模式。");
  }
  if (/学会|理解|掌握|调试|测试|重构/.test(normalized)) {
    add("近期产生了可验证的工程学习进展", "capability", 0.58, "应通过解释、测试或独立实现继续验证真实掌握程度。");
  }
  if (/决定|选择|以后|目标|计划/.test(normalized)) {
    add("形成了一项需要后续行为验证的阶段性意图", "goal", 0.55, "可用于校准近期优先级，但不等同于已经形成稳定目标。");
  }
  if (candidates.length === 0) {
    add("该记录反映了用户当前值得继续观察的状态变化", "state", 0.42, "证据仅来自单条自述，需用后续记录或行为结果交叉验证。");
  }
  return candidates.slice(0, 4);
}
