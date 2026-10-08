import { createHash } from "node:crypto";

export function normalizeText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim();
}

export function contentHash(value: string) {
  return createHash("sha256").update(normalizeText(value)).digest("hex");
}

export function canonicalProfileValue(factType: string, content: string) {
  const normalized = normalizeText(content);
  const rules: Array<[RegExp, string]> = [
    [/项目.*(闭环|交付)|(闭环|交付).*项目/, "project_delivery"],
    [/(工程|编程).*(学习|进展)|(学习|进展).*(工程|编程)/, "engineering_learning_progress"],
    [/(执行稳定|目标切换|开新坑|分心)/, "execution_stability_risk"],
    [/(阶段性|近期).*(意图|目标|计划)/, "stage_intent"],
    [/(状态).*(变化|观察)|(观察).*(状态)/, "observed_state_change"],
  ];
  const matched = rules.find(([pattern]) => pattern.test(normalized));
  return `${factType}:${matched?.[1] ?? normalized.replace(/[\p{P}\p{S}]/gu, "")}`;
}

export function profileFingerprint(factType: string, content: string) {
  return createHash("sha256").update(canonicalProfileValue(factType, content)).digest("hex");
}

function bigrams(value: string) {
  const normalized = normalizeText(value).replace(/\s/g, "");
  if (normalized.length < 2) return new Set([normalized]);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

export function textSimilarity(left: string, right: string) {
  const a = bigrams(left);
  const b = bigrams(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 1;
}
