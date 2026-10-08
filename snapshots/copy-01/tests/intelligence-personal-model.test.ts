import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { IntelligenceProjectionService } from "@/lib/services/intelligence-projection-service";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";
import { IntelligenceReviewService } from "@/lib/services/intelligence-review-service";

describe("Phase 4 Step 5 Personal Model Review", () => {
  let directory = "";
  let repository: ProfileRepository;
  let reviewId = "";
  let candidateHash = "";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-personal-model-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    const timestamp = "2026-08-11T08:00:00.000Z";
    const knowledgeId = randomUUID();
    repository.db.prepare("INSERT INTO knowledge_items (id,user_id,type,content,source,tags_json,data_kind,content_hash,created_at,updated_at) VALUES (?,?,?,?,?,'[]','user',?,?,?)")
      .run(knowledgeId, "genesis-owner", "note", "The owner prefers focused engineering study.", "owner", "hash-" + knowledgeId, timestamp, timestamp);
    const setId = randomUUID();
    repository.db.prepare("INSERT INTO personal_digital_twin_candidate_sets (id,user_id,client_request_id,source_signal_refs_json,created_at) VALUES (?,?,?,?,?)")
      .run(setId, "genesis-owner", randomUUID(), JSON.stringify([knowledgeId]), timestamp);
    const aggregateId = randomUUID();
    repository.db.prepare("INSERT INTO digital_twin_aggregation_candidates (id,user_id,candidate_set_id,aggregate_json,source_signal_refs_json,created_at) VALUES (?,?,?,?,?,?)")
      .run(aggregateId, "genesis-owner", setId, JSON.stringify({ learningPreference: "focused engineering study" }), JSON.stringify([knowledgeId]), timestamp);
    const envelope = new IntelligenceReviewReadService(repository).get(`digital_twin:${aggregateId}`)!;
    reviewId = envelope.reviewId;
    candidateHash = envelope.sourceCandidateHash;
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("requires authorization and creates only a pending Profile proposal", () => {
    const projection = new IntelligenceProjectionService(repository);
    const preview = projection.preview({ reviewId, targetType: "profile_proposal" });
    expect(() => projection.confirm({ reviewId, targetType: "profile_proposal", candidateHash, previewHash: preview.effectHash, effectHash: preview.effectHash, clientRequestId: randomUUID() })).toThrow("PROJECTION_AUTHORIZATION_REQUIRED");
    new IntelligenceReviewService(repository).record({ reviewId, action: "authorize_projection", sourceCandidateHash: candidateHash, targetType: "profile_proposal", previewHash: preview.effectHash, clientRequestId: randomUUID() });
    const receipt = projection.confirm({ reviewId, targetType: "profile_proposal", candidateHash, previewHash: preview.effectHash, effectHash: preview.effectHash, clientRequestId: randomUUID() });
    expect(receipt.targetType).toBe("profile_proposal");
    expect(repository.db.prepare("SELECT status FROM profile_update_proposals WHERE id=?").get(receipt.targetId)).toEqual({ status: "pending" });
    expect(repository.db.prepare("SELECT count(*) AS count FROM profile_facts").get()).toEqual({ count: 0 });
  });

  it("creates a pending Memory Candidate without writing the Memory Profile", () => {
    const projection = new IntelligenceProjectionService(repository);
    const preview = projection.preview({ reviewId, targetType: "memory_candidate" });
    new IntelligenceReviewService(repository).record({ reviewId, action: "authorize_projection", sourceCandidateHash: candidateHash, targetType: "memory_candidate", previewHash: preview.effectHash, clientRequestId: randomUUID() });
    const receipt = projection.confirm({ reviewId, targetType: "memory_candidate", candidateHash, previewHash: preview.effectHash, effectHash: preview.effectHash, clientRequestId: randomUUID() });
    expect(repository.db.prepare("SELECT status FROM memory_candidates WHERE id=?").get(receipt.targetId)).toEqual({ status: "pending" });
    expect(repository.db.prepare("SELECT count(*) AS count FROM user_memory_profile").get()).toEqual({ count: 0 });
  });
});
