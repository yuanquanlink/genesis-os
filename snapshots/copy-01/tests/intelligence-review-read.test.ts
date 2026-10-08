import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { GENESIS_REQUIRED_CAPABILITY_IDS, genesisCapabilityRegistry } from "@/lib/domain/genesis-capabilities";
import { reviewCandidateTypeSchema } from "@/lib/domain/intelligence-review";
import { IntelligenceReviewReadService, PERSONAL_OPERATING_REVIEW_ADAPTERS } from "@/lib/services/intelligence-review-read-service";

const USER_ID = "genesis-owner";

describe("Phase 4 Step 1 Candidate Review Read Service", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-review-read-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const timestamp = "2026-08-11T08:00:00.000Z";
  const id = () => randomUUID();
  const json = (value: unknown) => JSON.stringify(value);

  function seedCandidates() {
    const sourceId = id();
    repository.db.prepare(`INSERT INTO knowledge_objects
      (id,user_id,client_request_id,object_type,created_by,approval_status,validation_status,data_kind,created_at,updated_at,archived_at)
      VALUES (?,?,?,'source','user','not_required','valid','user',?,?,NULL)`).run(sourceId, USER_ID, id(), timestamp, timestamp);
    repository.db.prepare(`INSERT INTO knowledge_sources
      (id,title,source_type,ownership,original_locator,legacy_knowledge_item_id,research_source_id,provenance_json,captured_at)
      VALUES (?,'Review source','user_note','user_owned',NULL,NULL,NULL,?,?)`).run(sourceId, json({ sourceIds: [] }), timestamp);

    const aiObjectId = id();
    repository.db.prepare(`INSERT INTO knowledge_objects
      (id,user_id,client_request_id,object_type,created_by,approval_status,validation_status,data_kind,created_at,updated_at,archived_at)
      VALUES (?,?,?,'unit','ai','pending','valid','derived',?,?,NULL)`).run(aiObjectId, USER_ID, id(), timestamp, timestamp);
    const analysisId = id();
    repository.db.prepare(`INSERT INTO knowledge_analysis_candidates
      (id,user_id,client_request_id,source_id,artifact_id,ingestion_run_id,source_object_ids_json,analysis_json,
       difficulty_score,learning_value_score,confidence,provider,model,model_mode,prompt_version,limitations_json,status,trust_class,created_at)
      VALUES (?,?,?,?,NULL,NULL,?,?,2,0.4,0.3,'demo','fixture','demo','test-v1',?,'pending','untrusted',?)`)
      .run(analysisId, USER_ID, id(), sourceId, json([sourceId]), json({ summary: "A candidate analysis requiring owner review." }), json(["Needs explicit review"]), timestamp);

    const materialSet = id();
    repository.db.prepare(`INSERT INTO learning_material_candidate_sets
      (id,user_id,client_request_id,analysis_candidate_id,generation_method,status,trust_class,created_at)
      VALUES (?,?,?,?,'deterministic_v1','pending','untrusted',?)`).run(materialSet, USER_ID, id(), analysisId, timestamp);
    const learningId = id();
    repository.db.prepare(`INSERT INTO personal_learning_intelligence_candidates
      (id,user_id,client_request_id,material_candidate_set_id,aggregate_json,related_source_ids_json,upstream_confidence,generation_method,status,trust_class,created_at)
      VALUES (?,?,?,?,?,?,0.3,'deterministic_v1','pending','untrusted',?)`)
      .run(learningId, USER_ID, id(), materialSet, json({ target: "Candidate learning state" }), json([sourceId]), timestamp);
    const abilitySet = id();
    repository.db.prepare(`INSERT INTO personal_ability_candidate_sets
      (id,user_id,client_request_id,learning_intelligence_candidate_id,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`).run(abilitySet, USER_ID, id(), learningId, timestamp);

    const twinSet = id();
    repository.db.prepare(`INSERT INTO personal_digital_twin_candidate_sets
      (id,user_id,client_request_id,source_signal_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,'[]','pending','untrusted','deterministic_v1',?)`).run(twinSet, USER_ID, id(), timestamp);
    const twinId = id();
    repository.db.prepare(`INSERT INTO digital_twin_aggregation_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_signal_refs_json,final_truth_allowed,context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,'pending','untrusted',?)`).run(twinId, USER_ID, twinSet, json({ observation: "Candidate preference" }), "[]", timestamp);

    const decisionSet = id();
    repository.db.prepare(`INSERT INTO personal_decision_candidate_sets
      (id,user_id,client_request_id,source_candidate_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,'[]','pending','untrusted','deterministic_v1',?)`).run(decisionSet, USER_ID, id(), timestamp);
    const decisionId = id();
    repository.db.prepare(`INSERT INTO personal_decision_intelligence_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_candidate_refs_json,automatic_judgement_allowed,final_truth_allowed,context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`).run(decisionId, USER_ID, decisionSet, json({ factor: "Candidate factor" }), "[]", timestamp);

    const reflectionSet = id();
    repository.db.prepare(`INSERT INTO personal_reflection_mentor_candidate_sets
      (id,user_id,client_request_id,source_signal_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,'[]','pending','untrusted','deterministic_v1',?)`).run(reflectionSet, USER_ID, id(), timestamp);
    const reflectionId = id();
    repository.db.prepare(`INSERT INTO personal_reflection_mentor_intelligence_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_signal_refs_json,final_user_judgement_allowed,final_truth_allowed,context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`).run(reflectionId, USER_ID, reflectionSet, json({ reflection: "Candidate reflection" }), "[]", timestamp);

    const missionSet = id();
    repository.db.prepare(`INSERT INTO personal_mission_life_strategy_candidate_sets
      (id,user_id,client_request_id,source_candidate_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,'[]','pending','untrusted','deterministic_v1',?)`).run(missionSet, USER_ID, id(), timestamp);
    const missionId = id();
    repository.db.prepare(`INSERT INTO personal_mission_life_strategy_intelligence_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_candidate_refs_json,final_mission_allowed,final_identity_allowed,context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`).run(missionId, USER_ID, missionSet, json({ hypothesis: "Candidate direction" }), "[]", timestamp);

    return { sourceId, analysisId, learningId, twinId, decisionId, reflectionId, missionId };
  }

  it("reads every Phase 3 candidate family as a bounded pending review envelope", () => {
    seedCandidates();
    const service = new IntelligenceReviewReadService(repository);
    const result = service.list({ limit: 50 });

    expect(result.total).toBe(PERSONAL_OPERATING_REVIEW_ADAPTERS.length);
    expect(result.items).toHaveLength(9);
    expect(new Set(result.items.map((item) => item.candidateType)).size).toBe(9);
    for (const item of result.items) {
      expect(item).toMatchObject({ status: "pending", trustClass: "untrusted", reviewState: "pending_review", contextEligible: false });
      expect(item.sourceCandidateHash).toMatch(/^[a-f0-9]{64}$/);
      expect(item.observations.length).toBeGreaterThan(0);
      expect(item.inferences.join(" ")).toContain("untrusted Candidate");
      expect(reviewCandidateTypeSchema.safeParse(item.candidateType).success).toBe(true);
    }
  });

  it("supports allowlisted filtering, stable cursor pagination, and detail reads without writes", () => {
    seedCandidates();
    const service = new IntelligenceReviewReadService(repository);
    const auditBefore = Number(repository.db.prepare("SELECT count(*) FROM audit_logs").pluck().get());
    const first = service.list({ limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBeTruthy();
    const second = service.list({ limit: 50, cursor: first.nextCursor ?? undefined });
    expect(second.items).toHaveLength(6);
    const combined = [...first.items, ...second.items];
    expect(new Set(combined.map((item) => item.reviewId)).size).toBe(9);
    for (const item of combined) expect(service.get(item.reviewId)?.sourceCandidateHash).toBe(item.sourceCandidateHash);
    expect(service.list({ domain: "profile", limit: 50 }).items.map((item) => item.candidateType)).toEqual(["digital_twin"]);
    expect(service.list({ candidateType: "mission_life_strategy", limit: 50 }).items).toHaveLength(1);
    const detail = service.get(first.items[0].reviewId);
    expect(detail?.reviewId).toBe(first.items[0].reviewId);
    expect(service.get("unknown:row")).toBeNull();
    expect(service.get("knowledge_analysis:not-a-row")).toBeNull();
    expect(() => service.list({ cursor: "not-a-valid-cursor" })).toThrow("INTELLIGENCE_REVIEW_CURSOR_INVALID");
    expect(Number(repository.db.prepare("SELECT count(*) FROM audit_logs").pluck().get())).toBe(auditBefore);
  });

  it("rejects unknown filters and keeps formal truth unchanged", () => {
    const seeded = seedCandidates();
    const service = new IntelligenceReviewReadService(repository);
    const formalBefore = repository.db.prepare(`SELECT
      (SELECT count(*) FROM learning_goals) goals,
      (SELECT count(*) FROM missions) missions,
      (SELECT count(*) FROM growth_strategies) strategies,
      (SELECT count(*) FROM user_memory_profile) memory,
      (SELECT count(*) FROM evidence_items) evidence,
      (SELECT count(*) FROM growth_nodes) growth`).get();

    expect(() => service.list({ candidateType: "not-a-candidate" })).toThrow();
    expect(service.get(`mission_life_strategy:${seeded.missionId}`)?.allowedTargets).toContain("strategy_candidate_handoff");
    expect(service.get(`mission_life_strategy:${seeded.missionId}`)?.allowedTargets).not.toContain("memory_candidate");
    expect(repository.db.prepare(`SELECT
      (SELECT count(*) FROM learning_goals) goals,
      (SELECT count(*) FROM missions) missions,
      (SELECT count(*) FROM growth_strategies) strategies,
      (SELECT count(*) FROM user_memory_profile) memory,
      (SELECT count(*) FROM evidence_items) evidence,
      (SELECT count(*) FROM growth_nodes) growth`).get()).toEqual(formalBefore);
  });

  it("preserves the governance capability and exposes no write or Context integration", () => {
    const governance = genesisCapabilityRegistry.find((item) => item.capability_id === "governance.no_regression");
    expect(governance?.required_surfaces).toContain("lib/domain/intelligence-review.ts");
    expect(governance?.required_surfaces).toContain("lib/services/intelligence-review-read-service.ts");
    expect(genesisCapabilityRegistry.map((item) => item.capability_id)).toHaveLength(GENESIS_REQUIRED_CAPABILITY_IDS.length);
    expect(IntelligenceReviewReadService.adapterTypes()).toHaveLength(9);
    const source = fs.readFileSync(path.resolve(process.cwd(), "lib/services/intelligence-review-read-service.ts"), "utf8");
    expect(source).not.toMatch(/INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i);
    expect(source).not.toContain("ContextEngine");
    expect(source).not.toMatch(/getAIRouter|\.complete\(|\.stream\(/);
  });
});
