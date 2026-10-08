import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { GENESIS_REQUIRED_CAPABILITY_IDS, genesisCapabilityRegistry } from "@/lib/domain/genesis-capabilities";
import type { ReflectionMentorSignalRef } from "@/lib/domain/personal-reflection-mentor-intelligence";
import { DataPortabilityService } from "@/lib/services/data-portability-service";
import { PersonalReflectionMentorIntelligenceService } from "@/lib/services/personal-reflection-mentor-intelligence-service";

const USER_ID = "genesis-owner";

describe("Phase 3 Personal Reflection and Mentor Intelligence foundation", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-reflection-mentor-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function sourceSignals(): ReflectionMentorSignalRef[] {
    const timestamp = new Date().toISOString();
    const reflectionId = randomUUID();
    repository.db.prepare(`INSERT INTO operating_reflections
      (id,user_id,reflection_date,client_request_id,completed_text,unfinished_reason,new_problems,
       tomorrow_adjustment,source_refs_json,evidence_item_id,growth_candidate_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?,?)`)
      .run(reflectionId, USER_ID, "2026-08-10", randomUUID(),
        "Recorded assumptions and completed a bounded implementation.",
        "Outcome evidence is not available yet.",
        "The review may overgeneralize from one day.",
        "Collect a later outcome before drawing a conclusion.", "[]", timestamp, timestamp);

    const knowledgeSourceId = randomUUID();
    repository.db.prepare(`INSERT INTO knowledge_objects
      (id,user_id,client_request_id,object_type,created_by,approval_status,validation_status,data_kind,created_at,updated_at,archived_at)
      VALUES (?,?,?,'source','user','not_required','valid','user',?,?,NULL)`)
      .run(knowledgeSourceId, USER_ID, randomUUID(), timestamp, timestamp);
    repository.db.prepare(`INSERT INTO knowledge_sources
      (id,title,source_type,ownership,original_locator,legacy_knowledge_item_id,research_source_id,provenance_json,captured_at)
      VALUES (?,'Reflection reference','user_note','user_owned',NULL,NULL,NULL,?,?)`)
      .run(knowledgeSourceId, JSON.stringify({ sourceIds: [], capturedAt: timestamp, notes: ["Owner source"] }), timestamp);
    const knowledgeCandidateId = randomUUID();
    repository.db.prepare(`INSERT INTO knowledge_analysis_candidates
      (id,user_id,client_request_id,source_id,artifact_id,ingestion_run_id,source_object_ids_json,
       analysis_json,difficulty_score,learning_value_score,confidence,provider,model,model_mode,
       prompt_version,limitations_json,status,trust_class,created_at)
      VALUES (?,?,?,?,NULL,NULL,?,?,2,0.5,0.3,'demo','deterministic-fixture','demo','test-v1',?,'pending','untrusted',?)`)
      .run(knowledgeCandidateId, USER_ID, randomUUID(), knowledgeSourceId, JSON.stringify([knowledgeSourceId]),
        JSON.stringify({ summary: "Candidate reference for reflection framing." }),
        JSON.stringify(["Test fixture remains untrusted."]), timestamp);

    const decisionSetId = randomUUID();
    repository.db.prepare(`INSERT INTO personal_decision_candidate_sets
      (id,user_id,client_request_id,source_candidate_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`)
      .run(decisionSetId, USER_ID, randomUUID(), "[]", timestamp);
    const decisionCandidateId = randomUUID();
    repository.db.prepare(`INSERT INTO personal_decision_intelligence_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_candidate_refs_json,automatic_judgement_allowed,
       final_truth_allowed,context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,0,'pending','untrusted',?)`)
      .run(decisionCandidateId, USER_ID, decisionSetId,
        JSON.stringify({ aggregationState: "candidate_only", automaticDecisionJudgement: false }), "[]", timestamp);

    const twinSetId = randomUUID();
    repository.db.prepare(`INSERT INTO personal_digital_twin_candidate_sets
      (id,user_id,client_request_id,source_signal_refs_json,status,trust_class,generation_method,created_at)
      VALUES (?,?,?,?,'pending','untrusted','deterministic_v1',?)`)
      .run(twinSetId, USER_ID, randomUUID(), "[]", timestamp);
    const twinCandidateId = randomUUID();
    repository.db.prepare(`INSERT INTO digital_twin_aggregation_candidates
      (id,user_id,candidate_set_id,aggregate_json,source_signal_refs_json,final_truth_allowed,
       context_eligible,status,trust_class,created_at)
      VALUES (?,?,?,?,?,0,0,'pending','untrusted',?)`)
      .run(twinCandidateId, USER_ID, twinSetId,
        JSON.stringify({ aggregationState: "candidate_only", finalPersonalityTruth: false }), "[]", timestamp);

    return [
      { signalType: "operating_reflection", signalId: reflectionId },
      { signalType: "decision_intelligence_candidate", signalId: decisionCandidateId },
      { signalType: "digital_twin_aggregation_candidate", signalId: twinCandidateId },
      { signalType: "knowledge_analysis_candidate", signalId: knowledgeCandidateId },
    ];
  }

  function input(signals: ReflectionMentorSignalRef[], clientRequestId = randomUUID()) {
    return {
      clientRequestId,
      sourceSignals: signals,
      dailyReflection: {
        reflectionDate: "2026-08-10",
        summaryCandidate: "The day may show useful scope discipline, while outcome evidence remains incomplete.",
        completedCandidates: ["A bounded implementation and explicit assumptions were recorded."],
        frictionCandidates: ["The result cannot yet be compared with a later outcome."],
        nextAdjustmentCandidate: "Collect a later result before treating the approach as effective.",
        sourceSignals: signals,
      },
      selfReview: {
        doneWellCandidates: ["Scope and assumptions may have been made more explicit."],
        improvementCandidates: ["Separate immediate completion from verified long-term value."],
        unresolvedQuestions: ["What later evidence would falsify the current interpretation?"],
        sourceSignals: signals,
      },
      strengthWeaknessSignals: [
        {
          signalType: "strength" as const,
          observation: "The records may indicate attention to explicit review boundaries.",
          counterEvidenceNeeded: "Review time-separated examples where those boundaries were not maintained.",
          sourceSignals: signals,
        },
        {
          signalType: "weakness" as const,
          observation: "The records may indicate a risk of interpreting completion before outcome evidence exists.",
          counterEvidenceNeeded: "Review examples where delayed outcomes were explicitly checked before conclusions.",
          sourceSignals: signals,
        },
      ],
      mentorPerspectives: [{
        perspectiveType: "counterfactual" as const,
        observationCandidate: "A different review could begin by asking what evidence would reverse the current interpretation.",
        alternativeApproachCandidate: "Write the falsification condition before assessing what went well.",
        questionForOwner: "Which later observation would make this reflection no longer useful?",
        sourceSignals: signals,
      }],
      expertThinkingReferences: [{
        referenceTitle: "Generic first-principles review pattern",
        referenceLocator: null,
        thinkingPattern: "Separate assumptions, observations, and conclusions before comparing alternative explanations.",
        applicabilityQuestion: "Would this generic pattern expose an assumption hidden in the current review?",
        sourceSignals: signals,
      }],
      cognitiveElevations: [{
        currentFrameCandidate: "Completion may be treated as the main signal of progress.",
        alternativeFrameCandidate: "Progress may instead be evaluated through later falsifiable outcome evidence.",
        practiceExperiment: "Record one predicted outcome and review it after a defined delay.",
        evidenceNeeded: "A timestamped prediction and a later owner-reviewed outcome record.",
        sourceSignals: signals,
      }],
    };
  }

  function formalCounts(target = repository) {
    const count = (table: string) => Number(target.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
    return {
      profileFacts: count("profile_facts"), memories: count("user_memory_profile"), memoryCandidates: count("memory_candidates"),
      evidence: count("evidence_items"), growthNodes: count("growth_nodes"), growthCandidates: count("growth_evidence_candidates"),
      abilitySnapshots: count("ability_change_snapshots"), mastery: count("mastery_certifications"),
      goals: count("learning_goals"), missions: count("missions"), plans: count("daily_plans"), strategies: count("growth_strategies"),
    };
  }

  it("creates isolated daily reflection, self-review, strength, weakness, Mentor, expert-reference, and elevation candidates", () => {
    const signals = sourceSignals();
    const before = formalCounts();
    const snapshot = new PersonalReflectionMentorIntelligenceService(repository).createCandidate(input(signals)).snapshot;

    expect(snapshot.dailyReflectionCandidates).toHaveLength(1);
    expect(snapshot.selfReviewCandidates).toHaveLength(1);
    expect(snapshot.strengthWeaknessSignalCandidates).toHaveLength(2);
    expect(new Set(snapshot.strengthWeaknessSignalCandidates.map((item) => item.candidate.signalType)))
      .toEqual(new Set(["strength", "weakness"]));
    expect(snapshot.mentorPerspectiveCandidates).toHaveLength(1);
    expect(snapshot.expertThinkingReferenceCandidates).toHaveLength(1);
    expect(snapshot.cognitiveElevationCandidates).toHaveLength(1);
    expect(snapshot.intelligenceCandidates).toHaveLength(1);
    expect(formalCounts()).toEqual(before);
    expect(genesisCapabilityRegistry.map((item) => item.capability_id).sort())
      .toEqual([...GENESIS_REQUIRED_CAPABILITY_IDS].sort());
    expect(repository.db.prepare("SELECT name FROM schema_migrations WHERE name='0043_personal_reflection_mentor_intelligence.sql'").get()).toBeTruthy();
  });

  it("keeps reflection and Mentor output untrusted without final judgement or invented expert decisions", () => {
    const snapshot = new PersonalReflectionMentorIntelligenceService(repository)
      .createCandidate(input(sourceSignals())).snapshot;
    expect(snapshot.dailyReflectionCandidates[0]).toMatchObject({
      status: "pending", trustClass: "untrusted", finalJudgementAllowed: false,
      candidate: { finalDailyJudgement: false },
    });
    expect(snapshot.selfReviewCandidates[0]).toMatchObject({
      finalSelfAssessment: null, candidate: { finalSelfAssessment: null },
    });
    expect(snapshot.strengthWeaknessSignalCandidates.every((item) =>
      item.traitConclusionAllowed === false
      && item.candidate.stableTraitConclusion === false
      && item.candidate.abilityMutationAllowed === false
    )).toBe(true);
    expect(snapshot.mentorPerspectiveCandidates[0]).toMatchObject({
      userJudgementAllowed: false, candidate: { userJudgement: false, certainty: "candidate" },
    });
    expect(snapshot.expertThinkingReferenceCandidates[0]).toMatchObject({
      expertIdentityClaimAllowed: false, expertDecisionClaimAllowed: false,
      candidate: {
        attributionStatus: "reference_only_not_attributed",
        claimedExpertIdentity: null, claimedExpertDecision: false,
      },
    });
    expect(snapshot.cognitiveElevationCandidates[0]).toMatchObject({
      cognitiveGrowthClaimAllowed: false,
      candidate: { cognitiveGrowthClaim: false, masteryClaim: false },
    });
    expect(snapshot.intelligenceCandidates[0]).toMatchObject({
      finalUserJudgementAllowed: false, finalTruthAllowed: false, contextEligible: false,
      status: "pending", trustClass: "untrusted",
      candidate: {
        aggregationState: "candidate_only", finalUserJudgement: false,
        finalPersonalityConclusion: false, profileMutationAllowed: false,
        memoryWriteAllowed: false, abilityGrowthMutationAllowed: false,
        evidenceWriteAllowed: false, masteryMutationAllowed: false, contextEligible: false,
      },
    });
  });

  it("rejects missing, incomplete, undeclared, and one-sided reflection sources", () => {
    const service = new PersonalReflectionMentorIntelligenceService(repository);
    const signals = sourceSignals();
    const missing = input(signals.map((signal) => signal.signalType === "decision_intelligence_candidate"
      ? { ...signal, signalId: randomUUID() }
      : signal));
    expect(() => service.createCandidate(missing)).toThrow("REFLECTION_MENTOR_DECISION_CANDIDATE_REQUIRED");

    const incomplete = signals.filter((signal) => signal.signalType !== "knowledge_analysis_candidate");
    expect(() => service.createCandidate(input(incomplete))).toThrow("REFLECTION_MENTOR_SOURCE_DOMAINS_INCOMPLETE");

    const undeclared = input(signals);
    undeclared.mentorPerspectives[0].sourceSignals = [{ signalType: "verified_evidence", signalId: randomUUID() }];
    expect(() => service.createCandidate(undeclared)).toThrow("REFLECTION_MENTOR_SIGNAL_NOT_DECLARED");

    const oneSided = input(signals);
    oneSided.strengthWeaknessSignals[1].signalType = "strength";
    expect(() => service.createCandidate(oneSided)).toThrow("REFLECTION_STRENGTH_WEAKNESS_REQUIRED");
    expect(service.snapshot().candidateSets).toHaveLength(0);
  });

  it("blocks approval bypass and keeps every candidate out of ContextEngine and formal user truth", () => {
    const signals = sourceSignals();
    const context = new ContextEngine(repository);
    const packet = () => JSON.stringify(context.prepare({
      currentPage: "/digital-life", currentTask: "reflection mentor candidate boundary",
      currentQuestion: "What reflection information is approved?", currentChapter: null, currentConversation: [],
    }, "full").packet);
    const packetBefore = packet();
    const before = formalCounts();
    const service = new PersonalReflectionMentorIntelligenceService(repository);
    const created = service.createCandidate(input(signals));
    const snapshot = created.snapshot;
    const ids = [
      created.candidateSetId,
      snapshot.dailyReflectionCandidates[0].id,
      snapshot.selfReviewCandidates[0].id,
      snapshot.strengthWeaknessSignalCandidates[0].id,
      snapshot.mentorPerspectiveCandidates[0].id,
      snapshot.expertThinkingReferenceCandidates[0].id,
      snapshot.cognitiveElevationCandidates[0].id,
      created.intelligenceId,
    ];
    const updates = [
      ["personal_reflection_mentor_candidate_sets", ids[0], "status='approved'", "REFLECTION_MENTOR_CANDIDATE_SET_IMMUTABLE"],
      ["daily_reflection_intelligence_candidates", ids[1], "final_judgement_allowed=1", "DAILY_REFLECTION_INTELLIGENCE_IMMUTABLE"],
      ["self_review_candidates", ids[2], "final_self_assessment='excellent'", "SELF_REVIEW_CANDIDATE_IMMUTABLE"],
      ["reflection_strength_weakness_signal_candidates", ids[3], "trait_conclusion_allowed=1", "REFLECTION_SIGNAL_CANDIDATE_IMMUTABLE"],
      ["mentor_perspective_candidates", ids[4], "user_judgement_allowed=1", "MENTOR_PERSPECTIVE_CANDIDATE_IMMUTABLE"],
      ["expert_thinking_pattern_reference_candidates", ids[5], "expert_decision_claim_allowed=1", "EXPERT_THINKING_REFERENCE_IMMUTABLE"],
      ["cognitive_elevation_candidates", ids[6], "cognitive_growth_claim_allowed=1", "COGNITIVE_ELEVATION_CANDIDATE_IMMUTABLE"],
      ["personal_reflection_mentor_intelligence_candidates", ids[7], "context_eligible=1", "REFLECTION_MENTOR_INTELLIGENCE_IMMUTABLE"],
    ];
    for (const [table, id, assignment, error] of updates) {
      expect(() => repository.db.prepare(`UPDATE ${table} SET ${assignment} WHERE id=?`).run(id)).toThrow(error);
    }
    const packetAfter = packet();
    for (const id of ids) {
      expect(packetBefore).not.toContain(id);
      expect(packetAfter).not.toContain(id);
    }
    expect(packetAfter).not.toContain("reference_only_not_attributed");
    expect(formalCounts()).toEqual(before);
    expect(service.snapshot().meta).toEqual({
      deterministicFoundation: true, providerCall: false, approvalProjection: false, contextIntegration: false,
      finalUserJudgement: false, expertDecisionClaim: false, profileMutation: false,
      memoryMutation: false, evidenceMutation: false, abilityGrowthMutation: false,
      masteryMutation: false, aiSelfModification: false,
    });
  });

  it("is idempotent and restores candidates without promotion or user-state mutation", () => {
    const service = new PersonalReflectionMentorIntelligenceService(repository);
    const requestId = randomUUID();
    const candidateInput = input(sourceSignals(), requestId);
    const first = service.createCandidate(candidateInput);
    expect(service.createCandidate(candidateInput)).toMatchObject({
      duplicate: true, candidateSetId: first.candidateSetId,
    });

    const backup = new DataPortabilityService(repository).exportJson();
    const restored = new ProfileRepository(path.join(directory, "restored.db"));
    try {
      new DataPortabilityService(restored).import(backup);
      const snapshot = new PersonalReflectionMentorIntelligenceService(restored).snapshot();
      expect(snapshot.candidateSets).toHaveLength(1);
      expect(snapshot.intelligenceCandidates[0]).toMatchObject({
        status: "pending", trustClass: "untrusted",
        finalUserJudgementAllowed: false, finalTruthAllowed: false, contextEligible: false,
      });
      expect(restored.db.pragma("foreign_key_check")).toEqual([]);
      expect(formalCounts(restored)).toEqual(formalCounts(repository));
    } finally {
      restored.close();
    }
  });
});
