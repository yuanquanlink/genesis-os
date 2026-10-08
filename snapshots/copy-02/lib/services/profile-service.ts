import { randomUUID } from "node:crypto";
import { extractProfileCandidates } from "@/lib/ai/profile-extractor";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  cleanupRequestSchema,
  entityIdSchema,
  profileFactManagementSchema,
  proposalDecisionSchema,
  selfEntryInputSchema,
  selfEntryManagementSchema,
  timelineManagementSchema,
} from "@/lib/domain/profile";

export class ProfileService {
  constructor(private readonly repository: ProfileRepository) {}

  snapshot() { return this.repository.snapshot(); }

  async submitEntry(raw: unknown) {
    const input = selfEntryInputSchema.parse(raw);
    const created = this.repository.createEntry(input);
    try { new EvidenceRepository(this.repository).syncSources(); }
    catch (error) { console.error("[ProfileService] evidence sync deferred", { entryId: created.id, error: error instanceof Error ? error.message : "unknown" }); }
    if (created.duplicate) {
      const existing = this.repository.proposalsForEntry(created.id);
      if (existing.length || this.repository.hasProcessedProfileCandidates(created.id) || !input.allowAi) {
        return {
          ...created,
          candidates: existing,
          evidenceUpdates: [],
          reusedPending: existing.filter((item) => item.status === "pending").length,
          suppressedRejected: existing.filter((item) => item.status === "rejected").length,
          mode: existing[0]?.modelMode ?? "demo",
          analysisStatus: input.allowAi ? "complete" : "skipped",
          message: created.duplicateReason === "idempotency_key"
            ? "该请求已处理，已返回原有记录，未重复写入。"
            : "短时间内已保存过相同原文，已复用原记录。",
        };
      }
    }

    let result: Awaited<ReturnType<typeof extractProfileCandidates>> | undefined;
    try {
      result = await extractProfileCandidates(input, this.repository);
      const persisted = this.repository.createProposalsDeduplicated(created.id, result.candidates, result.mode, result.provider);
      this.repository.logAi({
        purpose: "profile_extraction",
        provider: result.provider,
        taskClass: "cheap_daily",
        requestId: result.requestId,
        model: result.model,
        mode: result.mode,
        latencyMs: result.latencyMs,
        success: result.providerSucceeded,
        errorCode: result.fallbackReason,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      const evidenceAdded = persisted.evidenceUpdates.filter((item) => item.added).length;
      return {
        ...created,
        candidates: persisted.records,
        evidenceUpdates: persisted.evidenceUpdates,
        reusedPending: persisted.reusedPending,
        suppressedRejected: persisted.suppressedRejected,
        mode: result.mode,
        fallbackReason: result.fallbackReason,
        analysisStatus: !input.allowAi ? "skipped" : result.providerSucceeded ? "complete" : "degraded",
        message: evidenceAdded > 0
          ? `已有画像，新增 ${evidenceAdded} 条支持证据。`
          : persisted.reusedPending > 0
            ? `已关联到 ${persisted.reusedPending} 条待确认候选，未创建重复候选。`
            : persisted.suppressedRejected > 0
              ? "检测到与已拒绝候选相同的内容，未重复创建。"
              : undefined,
      };
    } catch (error) {
      const errorId = randomUUID();
      console.error(`[ProfileAnalysis] ${errorId} Raw entry ${created.id} was saved, but candidate analysis failed`, error);
      try {
        this.repository.logAi({
          purpose: "profile_extraction",
          provider: result?.provider ?? "demo",
          taskClass: "cheap_daily",
          requestId: result?.requestId,
          model: result?.model ?? "profile-extractor-unavailable",
          mode: result?.mode ?? "demo",
          latencyMs: result?.latencyMs ?? 0,
          success: false,
          errorCode: "candidate_persistence_error",
          inputTokens: result?.inputTokens,
          outputTokens: result?.outputTokens,
        });
      } catch (loggingError) {
        console.error(`[ProfileAnalysis] ${errorId} Failed to persist AI error telemetry`, loggingError);
      }
      return {
        ...created,
        candidates: [],
        evidenceUpdates: [],
        reusedPending: 0,
        suppressedRejected: 0,
        mode: result?.mode ?? "demo",
        analysisStatus: "failed" as const,
        message: "原文已可靠保存，但画像候选生成失败。可刷新后重试，原文不会丢失。",
        errorId,
      };
    }
  }

  decideProposal(id: string, raw: unknown) {
    entityIdSchema.parse(id);
    const decision = proposalDecisionSchema.parse(raw);
    return this.repository.decideProposal(id, decision.action, decision.action === "edit" ? decision.content : undefined);
  }

  manageFact(id: string, raw: unknown) {
    entityIdSchema.parse(id);
    return this.repository.manageFact(id, profileFactManagementSchema.parse(raw));
  }

  revokeFact(id: string, raw: unknown) { return this.manageFact(id, raw); }

  manageEntry(id: string, raw: unknown) {
    entityIdSchema.parse(id);
    return this.repository.manageEntry(id, selfEntryManagementSchema.parse(raw));
  }

  manageTimeline(id: string, raw: unknown) {
    entityIdSchema.parse(id);
    timelineManagementSchema.parse(raw);
    return this.repository.hideTimelineEvent(id);
  }

  cleanup(raw: unknown) {
    const request = cleanupRequestSchema.parse(raw);
    return request.action === "preview"
      ? this.repository.cleanupPreview()
      : this.repository.clearTestData(request.keepConfirmedFacts);
  }
}
