import { describe, expect, it, vi } from "vitest";
import {
  ContextBoundFutureModuleGateway,
  futureModuleDefinitions,
  type FutureModuleRecord,
} from "@/lib/ai/future-modules";

describe("future intelligence module boundary", () => {
  it("defines all four modules behind ContextEngine and saves traceable output", async () => {
    expect(Object.keys(futureModuleDefinitions)).toEqual([
      "book_intelligence",
      "business_learning",
      "thinking_model",
      "movie_reflection",
    ]);
    const saved: FutureModuleRecord[] = [];
    const complete = vi.fn().mockResolvedValue({
      parsed: {
        summary: "这条阅读记录揭示了一个需要通过项目实践验证的思考模式。",
        sourceIds: ["BOOK:1"],
        confidence: 0.62,
        limitations: ["当前只有一条阅读来源"],
        growthEvidenceCandidates: [
          {
            ability: "系统思考",
            claim: "能够识别局部优化与系统目标之间的冲突",
            confidence: 0.55,
            sourceIds: ["BOOK:1"],
          },
        ],
      },
      provider: "deepseek",
      model: "deepseek-chat",
    });
    const gateway = new ContextBoundFutureModuleGateway(
      { complete } as never,
      {
        save: (record) => {
          saved.push(record);
        },
      },
    );

    const result = await gateway.analyze({
      moduleId: "book_intelligence",
      request: "把这段阅读连接到我的 FDE 成长目标",
      sources: [{ id: "BOOK:1", summary: "局部最优不等于系统最优" }],
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(saved).toEqual([result]);
    expect(result).toMatchObject({
      moduleId: "book_intelligence",
      sourceIds: ["BOOK:1"],
      confidence: 0.62,
      provider: "deepseek",
      promptVersion: "future-module-interface-v1",
    });
  });

  it("rejects an unknown model-supplied source before persistence", async () => {
    const save = vi.fn();
    const gateway = new ContextBoundFutureModuleGateway(
      {
        complete: vi.fn().mockResolvedValue({
          parsed: {
            summary: "存在无法追溯来源的结论，应被拒绝。",
            sourceIds: ["UNKNOWN:1"],
            confidence: 0.5,
            limitations: [],
            growthEvidenceCandidates: [],
          },
          provider: "deepseek",
          model: "deepseek-chat",
        }),
      } as never,
      { save },
    );

    await expect(
      gateway.analyze({
        moduleId: "thinking_model",
        request: "分析这次决策中的认知漏洞",
        sources: [{ id: "DECISION:1", summary: "只收集了支持方案的证据" }],
      }),
    ).rejects.toThrow("FUTURE_MODULE_UNKNOWN_SOURCE:UNKNOWN:1");
    expect(save).not.toHaveBeenCalled();
  });
});
