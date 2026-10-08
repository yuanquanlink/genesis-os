import { randomUUID } from "node:crypto";
import { ContextEngine } from "@/lib/ai/context-engine";
import { generateMentorAnalysis } from "@/lib/ai/mentor-analysis";
import { GENESIS_MENTOR_DEEP_PROMPT_VERSION } from "@/lib/ai/prompt-versions";
import { MentorRepository } from "@/lib/db/mentor-repository";
import type { ProfileRepository } from "@/lib/db/repository";
import { mentorRequestSchema } from "@/lib/domain/ai";
import type { ContextItem, UserContextPacket } from "@/lib/domain/context";
import type { MentorDeepAnalysis, MentorSourceDetail } from "@/lib/domain/mentor";

function contextItems(packet: UserContextPacket): ContextItem[] {
  const items: ContextItem[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.value === "string" && Array.isArray(record.evidenceIds) && typeof record.confidence === "number") {
      items.push(record as unknown as ContextItem);
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(packet);
  return items;
}

function attachSourceDetails(analysis: MentorDeepAnalysis, packet: UserContextPacket): MentorDeepAnalysis {
  const items = contextItems(packet);
  const details: MentorSourceDetail[] = analysis.sourceRefs.map((id) => {
    const match = items.find((item) => item.evidenceIds.includes(id));
    return match
      ? { id, source: match.value, evidenceKind: match.evidenceKind, confidence: match.confidence, occurredAt: match.occurredAt, resolved: true }
      : { id, source: "Unresolved Context reference; Genesis did not infer source metadata.", evidenceKind: "system_record", confidence: 0, occurredAt: null, resolved: false };
  });
  return { ...analysis, sourceDetails: details };
}

export class MentorService {
  private readonly analyses: MentorRepository;

  constructor(private readonly repository: ProfileRepository) {
    this.analyses = new MentorRepository(repository);
  }

  snapshot(limit = 8) {
    return { analyses: this.analyses.list(limit) };
  }

  async analyze(rawInput: unknown) {
    const input = mentorRequestSchema.parse(rawInput);
    if (input.module !== "ai_mentor") throw new Error("MENTOR_ANALYSIS_MODULE_REQUIRED");
    const clientRequestId = input.clientRequestId ?? randomUUID();
    const existing = this.analyses.byRequest(clientRequestId);
    if (existing) return { analysis: existing, duplicate: true };
    const context = new ContextEngine(this.repository);
    const workingMemory = {
      currentPage: "/today-learning",
      currentTask: input.context || "Genesis Mentor 深度分析",
      currentQuestion: input.prompt,
      currentChapter: null,
      currentConversation: [{ role: "user" as const, content: input.prompt }],
    };
    const prepared = context.prepare(workingMemory, input.contextMode, {
      includeOperationalMemory: true,
    });
    const generated = await generateMentorAnalysis({
      repository: this.repository,
      prompt: input.prompt,
      contextNote: input.context,
      requestedPerspectives: input.perspectives,
      preparedContext: prepared,
    });
    generated.analysis = attachSourceDetails(generated.analysis, prepared.packet!);
    const configured = context.isRealConfigured();
    if (configured && !generated.meta.providerSucceeded) {
      this.repository.logAi({
        purpose: "genesis_mentor_deep",
        provider: context.selectedProviderId,
        taskClass: "high_reasoning",
        model: context.modelFor("high_reasoning"),
        mode: "real",
        latencyMs: generated.meta.latencyMs,
        success: false,
        errorCode: generated.meta.fallbackReason,
        promptVersion: GENESIS_MENTOR_DEEP_PROMPT_VERSION,
      });
    } else {
      this.repository.logAi({
        purpose: "genesis_mentor_deep",
        provider: generated.meta.provider,
        taskClass: "high_reasoning",
        requestId: generated.meta.requestId,
        model: generated.meta.model,
        mode: generated.meta.mode,
        inputTokens: generated.meta.inputTokens,
        outputTokens: generated.meta.outputTokens,
        latencyMs: generated.meta.latencyMs,
        success: true,
        promptVersion: GENESIS_MENTOR_DEEP_PROMPT_VERSION,
      });
    }
    const record = this.analyses.save({
      clientRequestId,
      question: input.prompt,
      contextNote: input.context,
      requestedPerspectives: input.perspectives,
      analysis: generated.analysis,
      meta: {
        provider: generated.meta.provider,
        model: generated.meta.model,
        modelMode: generated.meta.mode,
        promptVersion: GENESIS_MENTOR_DEEP_PROMPT_VERSION,
        upstreamRequestId: generated.meta.requestId,
        fallbackReason: generated.meta.fallbackReason ?? null,
      },
    });
    return {
      analysis: record,
      duplicate: false,
      contextEvidenceCount: prepared.evidenceCount,
    };
  }
}
