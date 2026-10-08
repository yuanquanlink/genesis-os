import { randomUUID } from "node:crypto";
import { reviewEventInputSchema, reviewEventSchema, type ReviewEvent } from "@/lib/domain/intelligence-review";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
const TERMINAL = new Set(["rejected", "revision_requested", "projection_prepared", "projected", "revoked", "superseded"]);

function now() { return new Date().toISOString(); }

export class IntelligenceReviewService {
  constructor(private readonly repository: ProfileRepository, private readonly userId = USER_ID) {}

  private existingRequest(clientRequestId: string) {
    return this.repository.db.prepare(
      `SELECT id,review_id,user_id,action,source_candidate_hash,target_type,preview_hash,reason,revisit_at,client_request_id,created_at
       FROM intelligence_review_events WHERE user_id=? AND client_request_id=?`,
    ).get(this.userId, clientRequestId) as Record<string, unknown> | undefined;
  }

  private map(row: Record<string, unknown>, duplicate = false): ReviewEvent {
    return reviewEventSchema.parse({
      id: String(row.id), reviewId: String(row.review_id), userId: String(row.user_id), action: row.action,
      sourceCandidateHash: String(row.source_candidate_hash), targetType: row.target_type ? String(row.target_type) : null,
      targetId: row.target_id ? String(row.target_id) : null,
      previewHash: row.preview_hash ? String(row.preview_hash) : null, reason: row.reason ? String(row.reason) : null,
      revisitAt: row.revisit_at ? String(row.revisit_at) : null, clientRequestId: String(row.client_request_id),
      createdAt: String(row.created_at), duplicate,
    });
  }

  record(raw: unknown): ReviewEvent {
    const input = reviewEventInputSchema.parse(raw);
    const duplicate = this.existingRequest(input.clientRequestId);
    if (duplicate) {
      if (String(duplicate.review_id) !== input.reviewId || String(duplicate.source_candidate_hash) !== input.sourceCandidateHash || String(duplicate.action) !== input.action) {
        throw new Error("INTELLIGENCE_REVIEW_IDEMPOTENCY_CONFLICT");
      }
      return this.map(duplicate, true);
    }

    const read = new IntelligenceReviewReadService(this.repository, this.userId);
    const envelope = read.get(input.reviewId);
    if (!envelope) throw new Error("INTELLIGENCE_REVIEW_NOT_FOUND");
    if (envelope.sourceCandidateHash !== input.sourceCandidateHash) throw new Error("INTELLIGENCE_REVIEW_STALE_CANDIDATE");
    if (input.action === "authorize_projection") {
      if (!input.targetType || !envelope.allowedTargets.includes(input.targetType)) throw new Error("INTELLIGENCE_REVIEW_PROJECTION_FORBIDDEN");
      // Step 2 records authorization intent only. A deterministic Preview and formal projection are later steps.
    }
    if (input.action === "reopen" && envelope.reviewState !== "deferred") throw new Error("INTELLIGENCE_REVIEW_REOPEN_INVALID");
    if (input.action === "defer" && TERMINAL.has(envelope.reviewState)) throw new Error("INTELLIGENCE_REVIEW_STATE_CONFLICT");
    if (input.action === "reject" && TERMINAL.has(envelope.reviewState)) throw new Error("INTELLIGENCE_REVIEW_STATE_CONFLICT");
    if (input.action === "request_revision" && TERMINAL.has(envelope.reviewState)) throw new Error("INTELLIGENCE_REVIEW_STATE_CONFLICT");
    if (input.action === "authorize_projection" && TERMINAL.has(envelope.reviewState)) throw new Error("INTELLIGENCE_REVIEW_STATE_CONFLICT");

    const event = { id: randomUUID(), reviewId: input.reviewId, userId: this.userId, action: input.action,
      sourceCandidateHash: input.sourceCandidateHash, targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      previewHash: input.previewHash ?? null, reason: input.reason ?? null, revisitAt: input.revisitAt ?? null,
      clientRequestId: input.clientRequestId, createdAt: now() };
    this.repository.db.transaction(() => {
      this.repository.db.prepare(
        `INSERT OR IGNORE INTO intelligence_review_catalog
         (id,user_id,review_id,candidate_type,source_candidate_id,source_candidate_hash,created_at)
         VALUES (?,?,?,?,?,?,?)`,
      ).run(randomUUID(), this.userId, input.reviewId, envelope.candidateType, envelope.sourceCandidateId, input.sourceCandidateHash, event.createdAt);
      this.repository.db.prepare(
        `INSERT INTO intelligence_review_events
         (id,user_id,review_id,action,source_candidate_hash,target_type,target_id,preview_hash,reason,revisit_at,client_request_id,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(event.id, this.userId, event.reviewId, event.action, event.sourceCandidateHash, event.targetType, event.targetId, event.previewHash, event.reason, event.revisitAt, event.clientRequestId, event.createdAt);
    })();
    return reviewEventSchema.parse({ ...event, duplicate: false });
  }

  history(reviewId: string) {
    return (this.repository.db.prepare(
      `SELECT id,review_id,user_id,action,source_candidate_hash,target_type,target_id,preview_hash,reason,revisit_at,client_request_id,created_at
       FROM intelligence_review_events WHERE user_id=? AND review_id=? ORDER BY event_sequence`,
    ).all(this.userId, reviewId) as Array<Record<string, unknown>>).map((row) => this.map(row));
  }
}
