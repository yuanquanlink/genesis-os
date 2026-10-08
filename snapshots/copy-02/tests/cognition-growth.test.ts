import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { CognitionService } from "@/lib/services/cognition-service";
import { cognitionContentSchema, cognitionReflectionAnalysisSchema } from "@/lib/domain/cognition";

describe("Cognition Growth MVP", () => {
  let directory = "";
  let repository: ProfileRepository;
  let service: CognitionService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-cognition-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
    service = new CognitionService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("generates all four modules in Demo mode with schema-safe output", async () => {
    for (const moduleId of ["thinking_model", "book_intelligence", "business_learning", "movie_reflection"] as const) {
      const result = await service.generate({ action: "generate", moduleId, topic: "连接我的 FDE 成长目标", clientRequestId: crypto.randomUUID() });
      expect(result.item?.moduleId).toBe(moduleId);
      expect(result.item?.modelMode).toBe("demo");
      expect(cognitionContentSchema.safeParse(result.item?.content).success).toBe(true);
      expect(result.item?.content.sourceStatus).toBe("summary_only");
      expect(result.item?.content.shortQuote).toBeNull();
    }
    expect(service.snapshot().items).toHaveLength(4);
  });

  it("is idempotent per module period and request retry", async () => {
    const clientRequestId = crypto.randomUUID();
    const first = await service.generate({ action: "generate", moduleId: "thinking_model", topic: "反馈回路", clientRequestId });
    const retry = await service.generate({ action: "generate", moduleId: "thinking_model", topic: "反馈回路", clientRequestId });
    const newRequest = await service.generate({ action: "generate", moduleId: "thinking_model", topic: "不同问题", clientRequestId: crypto.randomUUID() });
    expect(first.item?.id).toBe(retry.item?.id);
    expect(retry.duplicate).toBe(true);
    expect(newRequest.item?.id).toBe(first.item?.id);
    expect(service.snapshot().items).toHaveLength(1);
  });

  it("saves raw reflection and creates low-confidence evidence without changing formal ability", async () => {
    const generated = await service.generate({ action: "generate", moduleId: "business_learning", topic: "需求与成本", clientRequestId: crypto.randomUUID() });
    const itemId = generated.item!.id;
    const beforeAbilities = repository.db.prepare("SELECT count(*) AS count FROM growth_nodes WHERE node_type='ability' AND status='active'").get() as { count: number };
    const result = await service.reflect({ action: "reflect", itemId, reflection: "我会先验证一个垂直需求，再决定是否继续投入工程时间。", decision: "先做小范围验证，不把公开案例当作实时经营数据。", clientRequestId: crypto.randomUUID() });
    expect(result.reflection?.rawReflection).toContain("垂直需求");
    expect(result.reflection?.analysisStatus).toBe("ready");
    expect(cognitionReflectionAnalysisSchema.safeParse(result.reflection?.analysis).success).toBe(true);
    expect(result.reflection?.sourceRefs.every((source) => source.startsWith("COG:") || source.startsWith("SELF:"))).toBe(true);
    const rawCount = repository.db.prepare("SELECT count(*) AS count FROM self_entries WHERE category='reflection'").get() as { count: number };
    const evidence = repository.db.prepare("SELECT confidence,impact,verification_status FROM evidence_items WHERE evidence_type='self_reflection'").get() as { confidence: number; impact: number; verification_status: string } | undefined;
    const afterAbilities = repository.db.prepare("SELECT count(*) AS count FROM growth_nodes WHERE node_type='ability' AND status='active'").get() as { count: number };
    expect(rawCount.count).toBe(1);
    expect(evidence).toMatchObject({ confidence: 0.25, impact: 0, verification_status: "pending" });
    expect(afterAbilities.count).toBe(beforeAbilities.count);
  });

  it("does not create a second raw reflection for a repeated item", async () => {
    const generated = await service.generate({ action: "generate", moduleId: "movie_reflection", topic: "误读风险", clientRequestId: crypto.randomUUID() });
    const payload = { action: "reflect" as const, itemId: generated.item!.id, reflection: "我需要把叙事启发和现实因果分开验证。", decision: "记录一个可检验的反例。", clientRequestId: crypto.randomUUID() };
    const first = await service.reflect(payload);
    const retry = await service.reflect({ ...payload, clientRequestId: crypto.randomUUID() });
    expect(first.reflection?.id).toBe(retry.reflection?.id);
    expect(service.snapshot().reflections).toHaveLength(1);
    const rawCount = repository.db.prepare("SELECT count(*) AS count FROM self_entries WHERE category='reflection'").get() as { count: number };
    expect(rawCount.count).toBe(1);
  });

  it("falls back safely when a configured provider fails and retains the raw reflection", async () => {
    const configured = vi.spyOn(ContextEngine.prototype, "isRealConfigured").mockReturnValue(true);
    const complete = vi.spyOn(ContextEngine.prototype, "complete").mockRejectedValue(new Error("simulated provider failure"));
    try {
      const generated = await service.generate({ action: "generate", moduleId: "thinking_model", topic: "安全降级", clientRequestId: crypto.randomUUID() });
      expect(generated.item?.modelMode).toBe("demo");
      expect(generated.item?.fallbackReason).toBeTruthy();
      const reflected = await service.reflect({ action: "reflect", itemId: generated.item!.id, reflection: "即使 AI 调用失败，原始反思也应该被保留。", decision: "保留记录后再重试。", clientRequestId: crypto.randomUUID() });
      expect(reflected.reflection?.modelMode).toBe("demo");
      expect(reflected.reflection?.rawReflection).toContain("原始反思");
      expect(repository.snapshot().entries.some((entry) => entry.content.includes("原始反思"))).toBe(true);
    } finally {
      complete.mockRestore();
      configured.mockRestore();
    }
  });
});
