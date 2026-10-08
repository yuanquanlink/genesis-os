import { randomUUID } from "node:crypto";
import { contentHash } from "@/lib/domain/fingerprint";
import { projectionConfirmationSchema, projectionPreviewInputSchema, projectionPreviewSchema, projectionReceiptSchema, type ProjectionPreview, type ProjectionReceipt } from "@/lib/domain/intelligence-projection";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";
import { PersonalKnowledgeService } from "@/lib/services/personal-knowledge-service";
import { LearningService } from "@/lib/services/learning-service";
import { LearningRepository } from "@/lib/db/learning-repository";
import { EvidenceService } from "@/lib/services/evidence-service";
import { PersonalMemoryService } from "@/lib/services/personal-memory-service";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

export class IntelligenceProjectionService {
  constructor(private readonly repository: ProfileRepository, private readonly userId = USER_ID) {}

  private source(reviewId: string, targetType: ProjectionPreview["targetType"], targetId?: string) {
    const envelope = new IntelligenceReviewReadService(this.repository, this.userId).get(reviewId);
    if (!envelope) throw new Error("INTELLIGENCE_REVIEW_NOT_FOUND");
    if (!envelope.allowedTargets.includes(targetType)) throw new Error("INTELLIGENCE_REVIEW_PROJECTION_FORBIDDEN");
    if (["rejected", "revision_requested", "revoked", "superseded"].includes(envelope.reviewState)) throw new Error("INTELLIGENCE_REVIEW_STATE_CONFLICT");
    if (targetType === "knowledge_approval" && envelope.candidateType !== "knowledge_object") throw new Error("INTELLIGENCE_REVIEW_TARGET_MISMATCH");
    if (["learning_goal_activation", "learning_path_activation"].includes(targetType) && !["learning_material", "personal_learning"].includes(envelope.candidateType)) throw new Error("INTELLIGENCE_REVIEW_TARGET_MISMATCH");
    if (targetType === "evidence_candidate_handoff" && !["personal_learning", "personal_ability"].includes(envelope.candidateType)) throw new Error("INTELLIGENCE_REVIEW_TARGET_MISMATCH");
    if (["profile_proposal", "memory_candidate"].includes(targetType) && !["digital_twin", "reflection_mentor"].includes(envelope.candidateType)) throw new Error("INTELLIGENCE_REVIEW_TARGET_MISMATCH");
    if (targetType === "user_review_record" && !["decision_intelligence", "reflection_mentor", "mission_life_strategy"].includes(envelope.candidateType)) throw new Error("INTELLIGENCE_REVIEW_TARGET_MISMATCH");
    return { envelope, targetId };
  }

  private evidencePreparation(envelope: NonNullable<ReturnType<IntelligenceReviewReadService["get"]>>) {
    let row: Row | undefined;
    if (envelope.candidateType === "personal_learning") {
      row = this.repository.db.prepare(`SELECT id,preparation_json FROM learning_progress_evidence_preparations
        WHERE user_id=? AND intelligence_candidate_id=? AND status='pending' AND trust_class='untrusted' AND handoff_status='not_submitted'
        ORDER BY created_at DESC LIMIT 1`).get(this.userId, envelope.sourceCandidateId) as Row | undefined;
    } else if (envelope.candidateType === "personal_ability") {
      row = this.repository.db.prepare(`SELECT preparation.id,preparation.preparation_json FROM ability_evidence_preparations preparation
        JOIN learning_progress_ability_candidate_links link ON link.id=preparation.progress_ability_link_id
        JOIN ability_dimension_candidates dimension ON dimension.id=link.ability_dimension_candidate_id
        WHERE preparation.user_id=? AND dimension.candidate_set_id=? AND preparation.status='pending'
          AND preparation.trust_class='untrusted' AND preparation.handoff_status='not_submitted'
        ORDER BY preparation.created_at DESC LIMIT 1`).get(this.userId, envelope.sourceCandidateId) as Row | undefined;
    }
    if (!row) throw new Error("EVIDENCE_PREPARATION_NOT_FOUND");
    const preparation = parse<Row>(row.preparation_json, {});
    const draft = preparation.evidenceDraft as Row | undefined;
    if (!draft || draft.action !== "create" || preparation.verificationStatus !== "unverified" || preparation.requiresExplicitEvidenceSubmission !== true) throw new Error("EVIDENCE_PREPARATION_INVALID");
    return { preparationId: String(row.id), draft };
  }

  private learningCandidate(envelope: ReturnType<IntelligenceReviewReadService["get"]>) {
    if (!envelope) throw new Error("INTELLIGENCE_REVIEW_NOT_FOUND");
    let goalId = envelope.sourceCandidateId;
    let pathId = envelope.sourceCandidateId;
    if (envelope.candidateType === "personal_learning") {
      const row = this.repository.db.prepare("SELECT aggregate_json FROM personal_learning_intelligence_candidates WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'").get(envelope.sourceCandidateId, this.userId) as Row | undefined;
      const aggregate = parse<Row>(row?.aggregate_json, {});
      const lineage = (aggregate.lineage ?? {}) as Row;
      goalId = String(lineage.goalCandidateId ?? "");
      pathId = String(lineage.pathCandidateId ?? "");
    }
    const goal = this.repository.db.prepare("SELECT * FROM material_learning_goal_candidates WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'").get(goalId, this.userId) as Row | undefined;
    const path = this.repository.db.prepare("SELECT * FROM material_learning_path_candidates WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'").get(pathId, this.userId) as Row | undefined;
    if (!goal || !path) throw new Error("LEARNING_PROJECTION_CANDIDATE_INCOMPLETE");
    const sourceIds = parse<string[]>(goal.related_source_ids_json, []);
    const placeholders = sourceIds.map(() => "?").join(",");
    const trusted = sourceIds.length && Number(this.repository.db.prepare(`SELECT count(*) FROM knowledge_objects WHERE user_id=? AND id IN (${placeholders}) AND archived_at IS NULL AND approval_status IN ('not_required','approved') AND validation_status!='invalid'`).pluck().get(this.userId, ...sourceIds)) === sourceIds.length;
    if (!trusted) throw new Error("LEARNING_PROJECTION_TRUSTED_SOURCE_REQUIRED");
    return { goal, path, sourceIds };
  }

  private personalModelCandidate(envelope: NonNullable<ReturnType<IntelligenceReviewReadService["get"]>>) {
    const row = this.repository.db.prepare(`SELECT aggregate_json AS payload_json,source_signal_refs_json AS source_ids_json
      FROM digital_twin_aggregation_candidates WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
      UNION ALL
      SELECT aggregate_json AS payload_json,source_signal_refs_json AS source_ids_json
      FROM personal_reflection_mentor_intelligence_candidates WHERE id=? AND user_id=? AND status='pending' AND trust_class='untrusted'
      LIMIT 1`).get(envelope.sourceCandidateId, this.userId, envelope.sourceCandidateId, this.userId) as Row | undefined;
    if (!row) throw new Error("PERSONAL_MODEL_CANDIDATE_NOT_PENDING");
    const payload = parse<Row>(row.payload_json, {});
    const parsedSourceIds = parse<unknown>(row.source_ids_json, []);
    const sourceIds = (Array.isArray(parsedSourceIds) ? parsedSourceIds : []).map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const knowledgeIds = sourceIds.filter((id) => Boolean(this.repository.db.prepare("SELECT 1 FROM knowledge_items WHERE id=? AND user_id=? AND data_kind='user'").get(id, this.userId)));
    return { payload, sourceIds, knowledgeIds };
  }

  preview(raw: unknown): ProjectionPreview {
    const input = projectionPreviewInputSchema.parse(raw);
    const { envelope, targetId } = this.source(input.reviewId, input.targetType, input.targetId);
    let actualTargetId = targetId ?? null;
    let targetVersion = "absent";
    let effects: ProjectionPreview["effects"] = [];
    const nonEffects = ["Memory", "Ability", "Growth", "Mastery", "Mission", "Strategy", "ContextEngine", ...(input.targetType === "evidence_candidate_handoff" ? [] : ["Evidence"])];
    if (input.targetType === "knowledge_approval") {
      const row = this.repository.db.prepare("SELECT approval_status,updated_at FROM knowledge_objects WHERE id=? AND user_id=? AND created_by='ai' AND approval_status='pending'").get(envelope.sourceCandidateId, this.userId) as Row | undefined;
      if (!row) throw new Error("KNOWLEDGE_CANDIDATE_NOT_PENDING");
      targetVersion = String(row.updated_at);
      effects = [{ field: "knowledge_objects.approval_status", before: "pending", after: "approved" }];
    } else if (input.targetType === "learning_goal_activation") {
      const learning = this.learningCandidate(envelope);
      effects = [{ field: "learning_goals", before: null, after: { title: learning.goal.target_capability, objective: learning.goal.learning_objective } }];
    } else if (input.targetType === "learning_path_activation") {
      if (!targetId) throw new Error("LEARNING_PATH_TARGET_REQUIRED");
      const path = this.repository.db.prepare("SELECT id,version,status FROM learning_paths WHERE goal_id=?").get(targetId) as Row | undefined;
      const linked = this.repository.db.prepare("SELECT target_id FROM intelligence_learning_projection_links WHERE user_id=? AND target_kind='learning_goal' AND target_id=?").get(this.userId, targetId) as Row | undefined;
      if (!linked) throw new Error("LEARNING_PATH_GOAL_NOT_PROJECTED");
      const learning = this.learningCandidate(envelope);
      const pathPayload = parse<Array<Record<string, unknown>>>(learning.path.stages_json, []);
      actualTargetId = targetId;
      targetVersion = path ? String(path.version) : "1";
      effects = [{ field: "learning_paths.rationale", before: path?.status ?? "absent", after: pathPayload.map((stage) => String(stage.title ?? stage.stage ?? "stage")).join(" -> ") }];
    } else if (input.targetType === "evidence_candidate_handoff") {
      const prepared = this.evidencePreparation(envelope);
      effects = [{ field: "evidence_items.verification_status", before: null, after: "pending" }, { field: "evidence_items.source", before: null, after: String(prepared.draft.source) }];
      actualTargetId = prepared.preparationId;
    } else if (input.targetType === "profile_proposal") {
      const model = this.personalModelCandidate(envelope);
      targetVersion = "absent";
      effects = [{ field: "profile_update_proposals.status", before: null, after: "pending" }, { field: "profile_update_proposals.source_candidate_id", before: null, after: envelope.sourceCandidateId }];
      actualTargetId = envelope.sourceCandidateId;
      if (!model.payload) throw new Error("PERSONAL_MODEL_CANDIDATE_INVALID");
    } else if (input.targetType === "memory_candidate") {
      const model = this.personalModelCandidate(envelope);
      if (!model.knowledgeIds.length) throw new Error("MEMORY_PROJECTION_KNOWLEDGE_SOURCE_REQUIRED");
      effects = [{ field: "memory_candidates.status", before: null, after: "pending" }, { field: "memory_candidates.source_knowledge_ids", before: null, after: model.knowledgeIds }];
      actualTargetId = envelope.sourceCandidateId;
    } else {
      const recordKind = envelope.candidateType === "decision_intelligence" ? "decision_review" : envelope.candidateType === "reflection_mentor" ? "reflection_review" : "alignment_review";
      effects = [{ field: "intelligence_user_review_records.status", before: null, after: "pending" }, { field: "intelligence_user_review_records.record_kind", before: null, after: recordKind }];
      actualTargetId = envelope.sourceCandidateId;
    }
    const effectHash = contentHash(JSON.stringify({ candidateHash: envelope.sourceCandidateHash, targetType: input.targetType, targetId: actualTargetId, targetVersion, effects }));
    return projectionPreviewSchema.parse({ reviewId: input.reviewId, candidateHash: envelope.sourceCandidateHash, targetType: input.targetType, targetId: actualTargetId, targetVersion, effects, nonEffects, effectHash, reversible: input.targetType !== "knowledge_approval", limitations: ["Preview is deterministic and must be explicitly confirmed.", "One confirmation affects one typed target only."] });
  }

  confirm(raw: unknown): ProjectionReceipt {
    const input = projectionConfirmationSchema.parse(raw);
    const preview = this.preview({ reviewId: input.reviewId, targetType: input.targetType, targetId: input.targetId });
    const sourceEnvelope = this.source(input.reviewId, input.targetType, input.targetId).envelope;
    if (preview.candidateHash !== input.candidateHash) throw new Error("STALE_CANDIDATE");
    if (preview.effectHash !== input.effectHash || preview.effectHash !== input.previewHash) throw new Error("STALE_PREVIEW");
    const event = this.repository.db.prepare("SELECT * FROM intelligence_review_events WHERE user_id=? AND review_id=? AND action='authorize_projection' AND source_candidate_hash=? AND target_type=? AND (target_id IS ? OR target_id=?) AND preview_hash=? ORDER BY event_sequence DESC LIMIT 1").get(this.userId, input.reviewId, input.candidateHash, input.targetType, input.targetId ?? null, input.targetId ?? null, input.effectHash) as Row | undefined;
    if (!event) throw new Error("PROJECTION_AUTHORIZATION_REQUIRED");
    const existing = this.repository.db.prepare("SELECT * FROM intelligence_projection_receipts WHERE user_id=? AND event_id=?").get(this.userId, event.id) as Row | undefined;
    if (existing) return this.receipt(existing);
    const timestamp = now();
    let targetId = preview.targetId ?? "";
    this.repository.db.transaction(() => {
      if (input.targetType === "knowledge_approval") {
        new PersonalKnowledgeService(this.repository).decide({ objectId: sourceEnvelope.sourceCandidateId, action: "approve", reason: "Owner confirmed through Personal Operating Layer." });
        targetId = sourceEnvelope.sourceCandidateId;
      } else if (input.targetType === "learning_goal_activation") {
        const learning = this.learningCandidate(sourceEnvelope);
        const created = new LearningService(this.repository).createGoal({ clientRequestId: randomUUID(), title: learning.goal.target_capability, purpose: learning.goal.learning_objective, currentBasis: "Reviewed Knowledge Candidate; baseline remains required.", finalGoal: learning.goal.expected_outcome, targetAbility: learning.goal.target_capability, currentLevel: 0, targetLevelScore: 4, motivation: learning.goal.learning_objective, targetLevel: "working", masteryLevel: 3, dailyMinutes: 30, weeklyDays: 5, deadline: null, engineeringOutcome: learning.goal.expected_outcome, fdeLinked: false, dataKind: "user" });
        targetId = String(created.id);
        this.repository.db.prepare("INSERT INTO intelligence_learning_projection_links (id,user_id,review_id,source_candidate_id,target_kind,target_id,source_candidate_hash,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), this.userId, input.reviewId, this.source(input.reviewId, input.targetType).envelope.sourceCandidateId, "learning_goal", targetId, input.candidateHash, timestamp);
      } else if (input.targetType === "learning_path_activation") {
        const learning = this.learningCandidate(sourceEnvelope);
        const path = new LearningRepository(this.repository.db).activatePath(input.targetId!, parse<Array<Record<string, unknown>>>(learning.path.stages_json, []).map((stage) => String(stage.title ?? stage.stage ?? "stage")).join(" -> "));
        targetId = path.id;
        this.repository.db.prepare("INSERT INTO intelligence_learning_projection_links (id,user_id,review_id,source_candidate_id,target_kind,target_id,source_candidate_hash,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), this.userId, input.reviewId, this.source(input.reviewId, input.targetType).envelope.sourceCandidateId, "learning_path", targetId, input.candidateHash, timestamp);
      } else if (input.targetType === "evidence_candidate_handoff") {
        const prepared = this.evidencePreparation(sourceEnvelope);
        new EvidenceService(this.repository).createManual(prepared.draft);
        const evidence = this.repository.db.prepare("SELECT id FROM evidence_items WHERE user_id=? AND source_type='manual' AND source_id=?").get(this.userId, prepared.draft.clientRequestId) as { id: string } | undefined;
        if (!evidence) throw new Error("EVIDENCE_HANDOFF_FAILED");
        targetId = evidence.id;
        this.repository.db.prepare("INSERT INTO intelligence_evidence_projection_links (id,user_id,review_id,source_candidate_id,preparation_id,evidence_item_id,source_candidate_hash,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), this.userId, input.reviewId, sourceEnvelope.sourceCandidateId, prepared.preparationId, targetId, input.candidateHash, timestamp);
      } else if (input.targetType === "user_review_record") {
        const recordKind = sourceEnvelope.candidateType === "decision_intelligence" ? "decision_review" : sourceEnvelope.candidateType === "reflection_mentor" ? "reflection_review" : "alignment_review";
        targetId = randomUUID();
        const record = {
          observations: sourceEnvelope.observations,
          inferences: sourceEnvelope.inferences,
          sourceIds: sourceEnvelope.sourceIds,
          limitations: sourceEnvelope.limitations,
          confidence: sourceEnvelope.confidence,
          ownerReviewRequired: true,
          finalJudgement: false,
        };
        this.repository.db.prepare(`INSERT INTO intelligence_user_review_records
          (id,user_id,review_id,source_candidate_type,source_candidate_id,source_candidate_hash,record_kind,record_json,status,trust_class,context_eligible,created_at)
          VALUES (?,?,?,?,?,?,?,?,'pending','untrusted',0,?)`).run(targetId, this.userId, input.reviewId, sourceEnvelope.candidateType, sourceEnvelope.sourceCandidateId, input.candidateHash, recordKind, JSON.stringify(record), timestamp);
      } else {
        const model = this.personalModelCandidate(sourceEnvelope);
        const sourceText = Object.values(model.payload).filter((value) => typeof value === "string").join("; ").slice(0, 480) || "Reviewed personal model signal";
        if (input.targetType === "profile_proposal") {
          const excerpt = `Reviewed personal model signal ${sourceEnvelope.sourceCandidateId}`;
          const entry = this.repository.createEntry({ content: `${excerpt}: ${sourceText}`.slice(0, 900), category: "state", tags: ["personal-model", "candidate"], importance: 2, occurredAt: timestamp, allowAi: false, clientRequestId: randomUUID(), dataKind: "test" });
          const created = this.repository.createProposalsDeduplicated(entry.id, [{ content: sourceText.slice(0, 480), factType: "pattern", evidenceExcerpt: excerpt, confidence: 0.25, possibleImpact: "Requires separate owner review before any Profile fact can exist." }], "demo", "deterministic");
          targetId = created.records[0]?.id ?? "";
          if (!targetId) throw new Error("PROFILE_PROJECTION_PROPOSAL_NOT_CREATED");
        } else {
          const created = new PersonalMemoryService(this.repository).createProjectionCandidate({ clientRequestId: randomUUID(), content: sourceText.slice(0, 600), reasoning: "Personal model signal is retained as a pending Memory Candidate and requires the existing Memory confirmation flow.", sourceKnowledgeIds: model.knowledgeIds, confidence: 0.25 });
          targetId = created.id;
        }
        this.repository.db.prepare("INSERT INTO intelligence_personal_model_projection_links (id,user_id,review_id,source_candidate_id,target_type,target_id,source_candidate_hash,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), this.userId, input.reviewId, sourceEnvelope.sourceCandidateId, input.targetType, targetId, input.candidateHash, timestamp);
      }
      this.repository.db.prepare("INSERT INTO intelligence_projection_receipts (id,user_id,review_id,event_id,target_type,target_id,candidate_hash,effect_hash,result,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), this.userId, input.reviewId, event.id, input.targetType, targetId, input.candidateHash, input.effectHash, "committed", timestamp);
    })();
    const receipt = this.repository.db.prepare("SELECT * FROM intelligence_projection_receipts WHERE event_id=?").get(event.id) as Row;
    return this.receipt(receipt);
  }

  private receipt(row: Row): ProjectionReceipt { return projectionReceiptSchema.parse({ id: row.id, reviewId: row.review_id, eventId: row.event_id, targetType: row.target_type, targetId: row.target_id, candidateHash: row.candidate_hash, effectHash: row.effect_hash, result: row.result, createdAt: row.created_at }); }
}
