import { ContextEngine } from "@/lib/ai/context-engine";
import {
  analyzeCognitionReflection,
  generateCognitionContent,
} from "@/lib/ai/cognition";
import {
  COGNITION_CONTENT_PROMPT_VERSION,
  COGNITION_REFLECTION_PROMPT_VERSION,
} from "@/lib/ai/prompt-versions";
import { CognitionRepository } from "@/lib/db/cognition-repository";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  cognitionActionSchema,
  type CognitionModuleId,
} from "@/lib/domain/cognition";

const moduleLabels: Record<CognitionModuleId, string> = {
  thinking_model: "每日世界模型",
  book_intelligence: "每日阅读智能",
  business_learning: "商业继承人训练",
  movie_reflection: "电影思考",
};

export class CognitionService {
  private readonly cognition: CognitionRepository;
  private readonly evidence: EvidenceRepository;

  constructor(private readonly repository: ProfileRepository) {
    this.cognition = new CognitionRepository(repository);
    this.evidence = new EvidenceRepository(repository);
  }

  snapshot() { return this.cognition.snapshot(); }

  private localDate(value = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(value);
  }

  private periodKey(moduleId: CognitionModuleId) {
    const date = this.localDate();
    if (moduleId !== "business_learning") return date;
    const current = new Date(`${date}T12:00:00+08:00`);
    const first = new Date(current.getFullYear(), 0, 1);
    const week = Math.ceil((((current.getTime() - first.getTime()) / 86_400_000) + first.getDay() + 1) / 7);
    return `${current.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  async generate(rawInput: unknown) {
    const input = cognitionActionSchema.parse(rawInput);
    if (input.action !== "generate") throw new Error("COGNITION_GENERATE_ACTION_REQUIRED");
    const periodKey = this.periodKey(input.moduleId);
    const existing = this.cognition.itemByRequest(input.clientRequestId)
      ?? this.cognition.itemByPeriod(input.moduleId, periodKey);
    if (existing) return { item: existing, duplicate: true, snapshot: this.snapshot() };
    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({
      currentPage: "/cognition",
      currentTask: moduleLabels[input.moduleId],
      currentQuestion: input.topic || `今天的 ${moduleLabels[input.moduleId]} 应该如何连接到我的长期成长？`,
      currentChapter: null,
      currentConversation: [],
    }, "full", { includeOperationalMemory: true });
    const generated = await generateCognitionContent({
      repository: this.repository,
      moduleId: input.moduleId,
      topic: input.topic,
      preparedContext: prepared,
    });
    if (context.isRealConfigured() && !generated.meta.providerSucceeded) {
      this.repository.logAi({
        purpose: `cognition_${input.moduleId}`,
        provider: context.selectedProviderId,
        taskClass: input.moduleId === "book_intelligence" || input.moduleId === "movie_reflection" ? "long_context" : "high_reasoning",
        model: context.modelFor(input.moduleId === "book_intelligence" || input.moduleId === "movie_reflection" ? "long_context" : "high_reasoning"),
        mode: "real", latencyMs: generated.meta.latencyMs, success: false,
        errorCode: generated.meta.fallbackReason, promptVersion: COGNITION_CONTENT_PROMPT_VERSION,
      });
    } else {
      this.repository.logAi({
        purpose: `cognition_${input.moduleId}`,
        provider: generated.meta.provider,
        taskClass: input.moduleId === "book_intelligence" || input.moduleId === "movie_reflection" ? "long_context" : "high_reasoning",
        requestId: generated.meta.requestId,
        model: generated.meta.model, mode: generated.meta.mode,
        inputTokens: generated.meta.inputTokens, outputTokens: generated.meta.outputTokens,
        latencyMs: generated.meta.latencyMs, success: true,
        promptVersion: COGNITION_CONTENT_PROMPT_VERSION,
      });
    }
    const item = this.cognition.saveItem({
      clientRequestId: input.clientRequestId,
      periodKey,
      content: generated.content,
      meta: {
        provider: generated.meta.provider,
        model: generated.meta.model,
        modelMode: generated.meta.mode,
        promptVersion: COGNITION_CONTENT_PROMPT_VERSION,
        fallbackReason: generated.meta.fallbackReason,
      },
    });
    return { item, duplicate: item.duplicate, snapshot: this.snapshot() };
  }

  async reflect(rawInput: unknown) {
    const input = cognitionActionSchema.parse(rawInput);
    if (input.action !== "reflect") throw new Error("COGNITION_REFLECT_ACTION_REQUIRED");
    const item = this.cognition.item(input.itemId);
    if (!item) throw new Error("COGNITION_ITEM_NOT_FOUND");
    const prior = this.cognition.reflectionByRequest(input.clientRequestId) ?? this.cognition.reflectionForItem(item.id);
    if (prior?.analysisStatus === "ready") return { reflection: prior, duplicate: true, snapshot: this.snapshot() };
    const entry = this.repository.createEntry({
      content: input.reflection,
      category: "reflection",
      tags: ["cognition", item.moduleId],
      importance: 3,
      occurredAt: new Date().toISOString(),
      allowAi: false,
      clientRequestId: input.clientRequestId,
      dataKind: "user",
    });
    const raw = this.cognition.saveRawReflection({
      item,
      clientRequestId: input.clientRequestId,
      rawReflection: input.reflection,
      decisionText: input.decision,
      sourceEntryId: entry.id,
    });
    if (raw.analysisStatus === "ready") return { reflection: raw, duplicate: true, snapshot: this.snapshot() };
    this.evidence.syncSources();
    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({
      currentPage: "/cognition",
      currentTask: `${moduleLabels[item.moduleId]} 反思分析`,
      currentQuestion: input.reflection,
      currentChapter: item.content.title,
      currentConversation: [{ role: "user", content: input.reflection }],
    }, "full", { includeOperationalMemory: true });
    const generated = await analyzeCognitionReflection({
      repository: this.repository,
      item,
      reflection: input.reflection,
      decision: input.decision,
      sourceEntryId: entry.id,
      preparedContext: prepared,
    });
    const taskClass = item.moduleId === "book_intelligence" || item.moduleId === "movie_reflection" ? "long_context" : "high_reasoning";
    if (context.isRealConfigured() && !generated.meta.providerSucceeded) {
      this.repository.logAi({ purpose: `cognition_${item.moduleId}_reflection`, provider: context.selectedProviderId, taskClass, model: context.modelFor(taskClass), mode: "real", latencyMs: generated.meta.latencyMs, success: false, errorCode: generated.meta.fallbackReason, promptVersion: COGNITION_REFLECTION_PROMPT_VERSION });
    } else {
      this.repository.logAi({ purpose: `cognition_${item.moduleId}_reflection`, provider: generated.meta.provider, taskClass, requestId: generated.meta.requestId, model: generated.meta.model, mode: generated.meta.mode, inputTokens: generated.meta.inputTokens, outputTokens: generated.meta.outputTokens, latencyMs: generated.meta.latencyMs, success: true, promptVersion: COGNITION_REFLECTION_PROMPT_VERSION });
    }
    const reflection = this.cognition.finalizeReflection(raw.id, generated.analysis, { provider: generated.meta.provider, model: generated.meta.model, modelMode: generated.meta.mode, promptVersion: COGNITION_REFLECTION_PROMPT_VERSION, fallbackReason: generated.meta.fallbackReason });
    return { reflection, duplicate: false, snapshot: this.snapshot() };
  }

  async act(rawInput: unknown) {
    const parsed = cognitionActionSchema.parse(rawInput);
    return parsed.action === "generate" ? this.generate(parsed) : this.reflect(parsed);
  }
}
