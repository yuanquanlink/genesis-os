import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { IntelligenceProjectionService } from "@/lib/services/intelligence-projection-service";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";
import { IntelligenceReviewService } from "@/lib/services/intelligence-review-service";

describe("Phase 4 Step 4 Evidence Candidate handoff", () => {
  let directory = "";
  let repository: ProfileRepository;
  let reviewId = "";
  let candidateHash = "";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-evidence-handoff-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    const timestamp = "2026-08-11T08:00:00.000Z";
    const sourceId = randomUUID();
    repository.db.prepare("INSERT INTO knowledge_objects (id,user_id,client_request_id,object_type,created_by,approval_status,validation_status,data_kind,created_at,updated_at,archived_at) VALUES (?,?,?,'source','user','not_required','valid','user',?,?,NULL)").run(sourceId, "genesis-owner", randomUUID(), timestamp, timestamp);
    repository.db.prepare("INSERT INTO knowledge_sources (id,title,source_type,ownership,original_locator,legacy_knowledge_item_id,research_source_id,provenance_json,captured_at) VALUES (?,'Learning source','user_note','user_owned',NULL,NULL,NULL,?,?)").run(sourceId, JSON.stringify({ sourceIds: [sourceId] }), timestamp);
    const analysisId = randomUUID();
    repository.db.prepare(`INSERT INTO knowledge_analysis_candidates
      (id,user_id,client_request_id,source_id,artifact_id,ingestion_run_id,source_object_ids_json,analysis_json,difficulty_score,learning_value_score,confidence,provider,model,model_mode,prompt_version,limitations_json,status,trust_class,created_at)
      VALUES (?,?,?,?,NULL,NULL,?,?,3,.7,.6,'demo','local','demo','test','[]','pending','untrusted',?)`).run(analysisId, "genesis-owner", randomUUID(), sourceId, JSON.stringify([sourceId]), JSON.stringify({}), timestamp);
    const materialId = randomUUID();
    repository.db.prepare("INSERT INTO learning_material_candidate_sets (id,user_id,client_request_id,analysis_candidate_id,generation_method,status,trust_class,created_at) VALUES (?,?,?,?,'deterministic_v1','pending','untrusted',?)").run(materialId, "genesis-owner", randomUUID(), analysisId, timestamp);
    const intelligenceId = randomUUID();
    repository.db.prepare("INSERT INTO personal_learning_intelligence_candidates (id,user_id,client_request_id,material_candidate_set_id,aggregate_json,related_source_ids_json,upstream_confidence,generation_method,status,trust_class,created_at) VALUES (?,?,?,?,?,?,.6,'deterministic_v1','pending','untrusted',?)").run(intelligenceId, "genesis-owner", randomUUID(), materialId, JSON.stringify({ goal: { targetCapability: "Evidence-grounded learning" } }), JSON.stringify([sourceId]), timestamp);
    const stateId = randomUUID();
    repository.db.prepare("INSERT INTO personal_learning_state_candidates (id,user_id,intelligence_candidate_id,state_json,status,trust_class,created_at) VALUES (?,?,?,?,'pending','untrusted',?)").run(stateId, "genesis-owner", intelligenceId, JSON.stringify({ stage: "application" }), timestamp);
    const preparationId = randomUUID();
    const preparation = { stage: "application", evidenceDraft: { action: "create", evidenceType: "learning", source: "Owner-confirmed learning progress preparation", description: "Completed a bounded implementation and retained an inspectable test result.", relatedAbility: "Evidence-grounded learning", capturedAt: timestamp, dataKind: "user", clientRequestId: preparationId }, verificationStatus: "unverified", requiresExplicitEvidenceSubmission: true };
    repository.db.prepare("INSERT INTO learning_progress_evidence_preparations (id,user_id,client_request_id,intelligence_candidate_id,state_candidate_id,stage,preparation_json,related_source_ids_json,status,trust_class,handoff_status,created_at) VALUES (?,?,?,?,?,'application',?,?,'pending','untrusted','not_submitted',?)").run(preparationId, "genesis-owner", randomUUID(), intelligenceId, stateId, JSON.stringify(preparation), JSON.stringify([sourceId]), timestamp);
    const envelope = new IntelligenceReviewReadService(repository).get(`personal_learning:${intelligenceId}`)!;
    reviewId = envelope.reviewId;
    candidateHash = envelope.sourceCandidateHash;
  });

  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  it("submits one pending Evidence item while leaving Growth, Ability and Mastery unchanged", () => {
    const projection = new IntelligenceProjectionService(repository);
    const preview = projection.preview({ reviewId, targetType: "evidence_candidate_handoff" });
    expect(preview.effects[0]).toMatchObject({ field: "evidence_items.verification_status", after: "pending" });
    new IntelligenceReviewService(repository).record({ reviewId, action: "authorize_projection", sourceCandidateHash: candidateHash, targetType: "evidence_candidate_handoff", previewHash: preview.effectHash, clientRequestId: randomUUID() });
    const receipt = projection.confirm({ reviewId, targetType: "evidence_candidate_handoff", candidateHash, previewHash: preview.effectHash, effectHash: preview.effectHash, clientRequestId: randomUUID() });
    expect(receipt).toMatchObject({ targetType: "evidence_candidate_handoff", result: "committed" });
    expect(repository.db.prepare("SELECT verification_status FROM evidence_items WHERE id=?").get(receipt.targetId)).toEqual({ verification_status: "pending" });
    expect(repository.db.prepare("SELECT count(*) AS count FROM growth_evidence_candidates").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM mastery_decisions").get()).toEqual({ count: 0 });
  });
});
