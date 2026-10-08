import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";
import { IntelligenceReviewService } from "@/lib/services/intelligence-review-service";

describe("Phase 4 Step 2 Review Ledger", () => {
  let directory = "";
  let repository: ProfileRepository;
  let reviewId = "";
  let sourceHash = "";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-review-ledger-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    const id = randomUUID();
    repository.db.prepare(`INSERT INTO knowledge_objects
      (id,user_id,client_request_id,object_type,created_by,approval_status,validation_status,data_kind,created_at,updated_at,archived_at)
      VALUES (?,?,?,'source','ai','pending','valid','user',?,?,NULL)`).run(id, "genesis-owner", randomUUID(), "2026-08-11T08:00:00.000Z", "2026-08-11T08:00:00.000Z");
    const envelope = new IntelligenceReviewReadService(repository).list({ candidateType: "knowledge_object" }).items[0];
    reviewId = envelope.reviewId;
    sourceHash = envelope.sourceCandidateHash;
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("records owner events append-only and computes state without changing the Candidate", () => {
    const service = new IntelligenceReviewService(repository);
    const deferred = service.record({ reviewId, action: "defer", sourceCandidateHash: sourceHash, revisitAt: "2026-08-20T08:00:00.000Z", clientRequestId: randomUUID() });
    expect(deferred.duplicate).toBe(false);
    expect(new IntelligenceReviewReadService(repository).get(reviewId)).toMatchObject({ reviewState: "deferred", contextEligible: false, trustClass: "untrusted" });
    service.record({ reviewId, action: "reopen", sourceCandidateHash: sourceHash, clientRequestId: randomUUID() });
    const rejected = service.record({ reviewId, action: "reject", sourceCandidateHash: sourceHash, reason: "Needs a better source.", clientRequestId: randomUUID() });
    expect(rejected.action).toBe("reject");
    expect(new IntelligenceReviewReadService(repository).get(reviewId)).toMatchObject({ reviewState: "rejected" });
    expect(repository.db.prepare("SELECT approval_status FROM knowledge_objects WHERE id=?").get(reviewId.split(":")[1])).toMatchObject({ approval_status: "pending" });
    expect(() => repository.db.prepare("UPDATE intelligence_review_events SET reason='changed'").run()).toThrow("append_only");
    expect(() => repository.db.prepare("DELETE FROM intelligence_review_events").run()).toThrow("append_only");
  });

  it("is idempotent and rejects stale or conflicting retries", () => {
    const service = new IntelligenceReviewService(repository);
    const clientRequestId = randomUUID();
    const input = { reviewId, action: "acknowledge" as const, sourceCandidateHash: sourceHash, clientRequestId };
    const first = service.record(input);
    expect(service.record(input)).toMatchObject({ id: first.id, duplicate: true });
    expect(() => service.record({ ...input, action: "defer", revisitAt: "2026-08-20T08:00:00.000Z" })).toThrow("IDEMPOTENCY_CONFLICT");
    expect(() => service.record({ ...input, clientRequestId: randomUUID(), sourceCandidateHash: "0".repeat(64) })).toThrow("STALE_CANDIDATE");
  });

  it("stores projection authorization intent but never creates a receipt or formal projection", () => {
    const service = new IntelligenceReviewService(repository);
    const event = service.record({ reviewId, action: "authorize_projection", sourceCandidateHash: sourceHash, targetType: "knowledge_approval", previewHash: "1".repeat(64), clientRequestId: randomUUID() });
    expect(event.action).toBe("authorize_projection");
    expect(new IntelligenceReviewReadService(repository).get(reviewId)).toMatchObject({ reviewState: "projection_prepared", contextEligible: false });
    expect(repository.db.prepare("SELECT count(*) AS count FROM intelligence_projection_receipts").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT approval_status FROM knowledge_objects WHERE id=?").get(reviewId.split(":")[1])).toEqual({ approval_status: "pending" });
  });
});
