import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { IntelligenceProjectionService } from "@/lib/services/intelligence-projection-service";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";
import { IntelligenceReviewService } from "@/lib/services/intelligence-review-service";

describe("Phase 4 Step 3 typed Knowledge projection", () => {
  let directory = "";
  let repository: ProfileRepository;
  let reviewId = "";
  let candidateHash = "";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-projection-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    const id = randomUUID();
    repository.db.prepare(`INSERT INTO knowledge_objects
      (id,user_id,client_request_id,object_type,created_by,approval_status,validation_status,data_kind,created_at,updated_at,archived_at)
      VALUES (?,?,?,'source','ai','pending','valid','user',?,?,NULL)`).run(id, "genesis-owner", randomUUID(), "2026-08-11T08:00:00.000Z", "2026-08-11T08:00:00.000Z");
    const envelope = new IntelligenceReviewReadService(repository).list({ candidateType: "knowledge_object" }).items[0];
    reviewId = envelope.reviewId;
    candidateHash = envelope.sourceCandidateHash;
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("requires a fresh preview and explicit owner authorization, then commits one receipt atomically", () => {
    const projection = new IntelligenceProjectionService(repository);
    const preview = projection.preview({ reviewId, targetType: "knowledge_approval" });
    expect(preview.candidateHash).toBe(candidateHash);
    expect(preview.effects).toEqual([{ field: "knowledge_objects.approval_status", before: "pending", after: "approved" }]);
    const event = new IntelligenceReviewService(repository).record({ reviewId, action: "authorize_projection", sourceCandidateHash: candidateHash, targetType: "knowledge_approval", previewHash: preview.effectHash, clientRequestId: randomUUID() });
    expect(event.action).toBe("authorize_projection");
    const receipt = projection.confirm({ reviewId, targetType: "knowledge_approval", candidateHash, previewHash: preview.effectHash, effectHash: preview.effectHash, clientRequestId: randomUUID() });
    expect(receipt).toMatchObject({ targetType: "knowledge_approval", result: "committed" });
    expect(repository.db.prepare("SELECT approval_status FROM knowledge_objects WHERE id=?").get(reviewId.split(":")[1])).toEqual({ approval_status: "approved" });
    expect(repository.db.prepare("SELECT count(*) AS count FROM intelligence_projection_receipts").get()).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM memory_candidates").get()).toEqual({ count: 0 });
  });

  it("rejects stale previews and leaves Candidate and formal state unchanged", () => {
    const projection = new IntelligenceProjectionService(repository);
    const preview = projection.preview({ reviewId, targetType: "knowledge_approval" });
    new IntelligenceReviewService(repository).record({ reviewId, action: "authorize_projection", sourceCandidateHash: candidateHash, targetType: "knowledge_approval", previewHash: preview.effectHash, clientRequestId: randomUUID() });
    expect(() => projection.confirm({ reviewId, targetType: "knowledge_approval", candidateHash: "0".repeat(64), previewHash: preview.effectHash, effectHash: preview.effectHash, clientRequestId: randomUUID() })).toThrow("STALE_CANDIDATE");
    expect(repository.db.prepare("SELECT approval_status FROM knowledge_objects WHERE id=?").get(reviewId.split(":")[1])).toEqual({ approval_status: "pending" });
    expect(repository.db.prepare("SELECT count(*) AS count FROM intelligence_projection_receipts").get()).toEqual({ count: 0 });
  });
});
