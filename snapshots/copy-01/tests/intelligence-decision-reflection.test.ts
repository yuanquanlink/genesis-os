import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { IntelligenceProjectionService } from "@/lib/services/intelligence-projection-service";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";
import { IntelligenceReviewService } from "@/lib/services/intelligence-review-service";

describe("Phase 4 Step 6 Decision and Reflection Experience", () => {
  let directory = "";
  let repository: ProfileRepository;
  let reviewId = "";
  let candidateHash = "";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-decision-review-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    const timestamp = "2026-08-11T08:00:00.000Z";
    const setId = randomUUID();
    repository.db.prepare("INSERT INTO personal_decision_candidate_sets (id,user_id,client_request_id,source_candidate_refs_json,created_at) VALUES (?,?,?,?,?)")
      .run(setId, "genesis-owner", randomUUID(), "[]", timestamp);
    const candidateId = randomUUID();
    repository.db.prepare("INSERT INTO personal_decision_intelligence_candidates (id,user_id,candidate_set_id,aggregate_json,source_candidate_refs_json,created_at) VALUES (?,?,?,?,?,?)")
      .run(candidateId, "genesis-owner", setId, JSON.stringify({ question: "Review the trade-offs without judging the owner.", recommendation: null }), "[]", timestamp);
    const envelope = new IntelligenceReviewReadService(repository).get(`decision_intelligence:${candidateId}`)!;
    reviewId = envelope.reviewId;
    candidateHash = envelope.sourceCandidateHash;
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("requires owner authorization and persists only an isolated review Candidate", () => {
    const projection = new IntelligenceProjectionService(repository);
    const preview = projection.preview({ reviewId, targetType: "user_review_record" });
    expect(preview.effects).toContainEqual({ field: "intelligence_user_review_records.status", before: null, after: "pending" });
    expect(() => projection.confirm({ reviewId, targetType: "user_review_record", candidateHash, previewHash: preview.effectHash, effectHash: preview.effectHash, clientRequestId: randomUUID() })).toThrow("PROJECTION_AUTHORIZATION_REQUIRED");
    new IntelligenceReviewService(repository).record({ reviewId, action: "authorize_projection", sourceCandidateHash: candidateHash, targetType: "user_review_record", previewHash: preview.effectHash, clientRequestId: randomUUID() });
    const receipt = projection.confirm({ reviewId, targetType: "user_review_record", candidateHash, previewHash: preview.effectHash, effectHash: preview.effectHash, clientRequestId: randomUUID() });
    expect(repository.db.prepare("SELECT status,trust_class,context_eligible,record_kind FROM intelligence_user_review_records WHERE id=?").get(receipt.targetId))
      .toEqual({ status: "pending", trust_class: "untrusted", context_eligible: 0, record_kind: "decision_review" });
    expect(repository.db.prepare("SELECT count(*) AS count FROM profile_facts").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM user_memory_profile").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM mastery_decisions").get()).toEqual({ count: 0 });
    expect(() => repository.db.prepare("UPDATE intelligence_user_review_records SET context_eligible=1 WHERE id=?").run(receipt.targetId)).toThrow("INTELLIGENCE_USER_REVIEW_RECORD_IMMUTABLE");
  });
});
