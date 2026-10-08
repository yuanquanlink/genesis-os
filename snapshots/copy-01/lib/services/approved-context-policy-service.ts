import { contentHash } from "@/lib/domain/fingerprint";
import {
  APPROVED_CONTEXT_SCHEMA_VERSION,
  type ContextProjectionSourceDomain,
  type ContextPurpose,
  type ContextTrustClass,
} from "@/lib/domain/approved-context-projection";
import type { ProfileRepository } from "@/lib/db/repository";

type Row = Record<string, unknown>;

export type ApprovedContextSource = {
  ownerId: string;
  sourceDomain: ContextProjectionSourceDomain;
  sourceRecordId: string;
  sourceVersion: string;
  sourceType: string;
  sourceTruthStatus: "approved" | "active" | "completed" | "verified" | "mastered";
  trustClass: ContextTrustClass;
  allowedPurposes: readonly ContextPurpose[];
  contextPayload: Record<string, unknown>;
  evidenceRefs: string[];
  provenanceRefs: string[];
  approvedAt: string;
  limitations: string[];
  contextSchemaVersion: typeof APPROVED_CONTEXT_SCHEMA_VERSION;
};

const PURPOSE_POLICY: Record<ContextProjectionSourceDomain, readonly ContextPurpose[]> = {
  knowledge: ["mentor", "learning", "research"],
  memory: ["mentor", "learning", "strategy", "daily_operation", "reflection"],
  goal: ["mentor", "learning", "strategy", "daily_operation"],
  strategy: ["mentor", "strategy", "daily_operation"],
  mission: ["mentor", "learning", "strategy", "daily_operation"],
  evidence: ["mentor", "learning", "strategy", "reflection"],
  mastery: ["mentor", "learning"],
  daily_plan: ["mentor", "daily_operation"],
};

const parseObject = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const parseStrings = (value: unknown): string[] => {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 24) : [];
  } catch {
    return [];
  }
};

const compact = (value: unknown, limit = 900) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit);

function sourceVersion(source: Omit<ApprovedContextSource, "sourceVersion">) {
  return contentHash(JSON.stringify({
    ownerId: source.ownerId,
    sourceDomain: source.sourceDomain,
    sourceRecordId: source.sourceRecordId,
    sourceType: source.sourceType,
    sourceTruthStatus: source.sourceTruthStatus,
    trustClass: source.trustClass,
    contextPayload: source.contextPayload,
    evidenceRefs: source.evidenceRefs,
    provenanceRefs: source.provenanceRefs,
    approvedAt: source.approvedAt,
    contextSchemaVersion: source.contextSchemaVersion,
  }));
}

function complete(source: Omit<ApprovedContextSource, "sourceVersion" | "allowedPurposes" | "contextSchemaVersion">): ApprovedContextSource {
  const base = {
    ...source,
    allowedPurposes: PURPOSE_POLICY[source.sourceDomain],
    contextSchemaVersion: APPROVED_CONTEXT_SCHEMA_VERSION,
  } as Omit<ApprovedContextSource, "sourceVersion">;
  return { ...base, sourceVersion: sourceVersion(base) };
}

export function loadApprovedContextSource(
  repository: ProfileRepository,
  ownerId: string,
  sourceDomain: ContextProjectionSourceDomain,
  sourceRecordId: string,
): ApprovedContextSource {
  const db = repository.db;

  if (sourceDomain === "strategy") {
    const row = db.prepare(`SELECT strategy.*,candidate.approved_at,candidate.decided_at,candidate.created_at candidate_created_at
      FROM growth_strategies strategy
      JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id AND candidate.user_id=strategy.user_id
      WHERE strategy.id=? AND strategy.user_id=? AND candidate.status='approved'`).get(sourceRecordId, ownerId) as Row | undefined;
    if (!row) throw new Error("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    const diagnosis = parseObject(row.diagnosis_json);
    const strategies = parseObject(row.strategies_json);
    return complete({ ownerId, sourceDomain, sourceRecordId, sourceType: "approved_strategy", sourceTruthStatus: "approved", trustClass: "approved_personal_state", contextPayload: {
      currentPosition: compact(diagnosis.currentPosition, 400), targetPosition: compact(diagnosis.targetPosition, 400),
      priorityRanking: Array.isArray(diagnosis.priorityRanking) ? diagnosis.priorityRanking.map((value) => compact(value, 180)).slice(0, 6) : [],
      plans: strategies,
    }, evidenceRefs: parseStrings(row.evidence_ids_json), provenanceRefs: [`strategy_candidate:${String(row.source_candidate_id)}`], approvedAt: String(row.approved_at ?? row.decided_at ?? row.candidate_created_at), limitations: ["仅限当前用途的已批准战略状态；决策模拟和待处理战略建议不会进入。"] });
  }

  if (sourceDomain === "mission") {
    const row = db.prepare(`SELECT mission.*,candidate.approved_at,candidate.created_at candidate_created_at,candidate.evidence_ids_json
      FROM missions mission
      JOIN mission_candidates candidate ON candidate.id=mission.source_candidate_id AND candidate.user_id=mission.user_id
      WHERE mission.id=? AND mission.user_id=? AND candidate.status='approved' AND mission.status IN ('active','completed')`).get(sourceRecordId, ownerId) as Row | undefined;
    if (!row) throw new Error("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    return complete({ ownerId, sourceDomain, sourceRecordId, sourceType: "approved_mission", sourceTruthStatus: String(row.status) === "completed" ? "completed" : "active", trustClass: "approved_personal_state", contextPayload: {
      title: compact(row.title, 240), description: compact(row.description, 700), sourceGoal: compact(row.source_goal, 300), status: row.status,
      priority: row.priority, deadline: row.deadline, evidenceRequirement: compact(row.evidence_requirement, 500), dailyTasks: parseStrings(row.daily_tasks_json).slice(0, 8),
    }, evidenceRefs: parseStrings(row.evidence_ids_json), provenanceRefs: [`mission_candidate:${String(row.source_candidate_id)}`, `strategy:${String(row.strategy_id)}`], approvedAt: String(row.approved_at ?? row.candidate_created_at), limitations: ["只有由已批准使命建议创建、且状态为进行中或已完成的使命才符合条件。"] });
  }

  if (sourceDomain === "memory") {
    const row = db.prepare(`SELECT memory.*,candidate.status candidate_status,candidate.approved_at
      FROM user_memory_profile memory
      JOIN memory_candidates candidate ON candidate.id=memory.source_candidate_id AND candidate.user_id=memory.user_id
      WHERE memory.id=? AND memory.user_id=? AND memory.status='active' AND candidate.status='approved'`).get(sourceRecordId, ownerId) as Row | undefined;
    if (!row) throw new Error("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    return complete({ ownerId, sourceDomain, sourceRecordId, sourceType: `confirmed_memory:${String(row.memory_type)}`, sourceTruthStatus: "active", trustClass: "verified_personal_truth", contextPayload: {
      memoryType: row.memory_type, content: compact(row.content, 900), importance: Number(row.importance), confidence: Number(row.confidence),
    }, evidenceRefs: parseStrings(row.source_knowledge_ids_json).map((id) => `knowledge:${id}`), provenanceRefs: [`memory_candidate:${String(row.source_candidate_id)}`], approvedAt: String(row.confirmed_at ?? row.approved_at), limitations: ["仅使用当前已确认记忆；待处理、已拒绝、已归档或已被替代的记忆不会进入。"] });
  }

  if (sourceDomain === "mastery") {
    const row = db.prepare(`SELECT certification.*,decision.overall_status,decision.aggregate_score,decision.passed_gates_json,
      decision.evidence_refs_json,decision.decision_version,decision.evaluated_at,goal.title goal_title,definition.aggregate_threshold
      FROM mastery_certifications certification
      JOIN mastery_decisions decision ON decision.id=certification.latest_decision_id AND decision.certification_id=certification.id
      JOIN learning_goals goal ON goal.id=certification.goal_id AND goal.user_id=certification.user_id
      JOIN mastery_definitions definition ON definition.id=certification.definition_id AND definition.status='active'
      WHERE certification.id=? AND certification.user_id=? AND certification.lifecycle_status='mastered' AND decision.overall_status='mastered'`).get(sourceRecordId, ownerId) as Row | undefined;
    if (!row) throw new Error("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    const requiredGates = db.prepare("SELECT gate_type,threshold FROM mastery_gate_requirements WHERE definition_id=? AND required=1 ORDER BY position").all(row.definition_id) as Row[];
    const passedGates = parseStrings(row.passed_gates_json);
    const allHardGatesPassed = requiredGates.length > 0 && requiredGates.every((gate) => {
      if (!passedGates.includes(String(gate.gate_type))) return false;
      const attempt = db.prepare(`SELECT result,status,score_optional FROM mastery_gate_attempts
        WHERE certification_id=? AND gate_type=? ORDER BY attempt_number DESC LIMIT 1`).get(sourceRecordId, gate.gate_type) as Row | undefined;
      return attempt?.result === "pass" && attempt.status === "passed" && Number(attempt.score_optional ?? 0) >= Number(gate.threshold);
    });
    if (!allHardGatesPassed || Number(row.aggregate_score) < Number(row.aggregate_threshold)) throw new Error("APPROVED_CONTEXT_MASTERY_GATES_REQUIRED");
    return complete({ ownerId, sourceDomain, sourceRecordId, sourceType: "deterministic_mastery_truth", sourceTruthStatus: "mastered", trustClass: "system_derived_deterministic", contextPayload: {
      goalTitle: compact(row.goal_title, 300), lifecycleStatus: "mastered", aggregateScore: Number(row.aggregate_score),
      passedGates, decisionVersion: row.decision_version,
    }, evidenceRefs: parseStrings(row.evidence_refs_json), provenanceRefs: [`mastery_decision:${String(row.latest_decision_id)}`, `learning_goal:${String(row.goal_id)}`], approvedAt: String(row.mastered_at ?? row.evaluated_at), limitations: ["课程完成不等于真正掌握；这里只投影最新的确定性掌握结论。"] });
  }

  if (sourceDomain === "evidence") {
    const row = db.prepare(`SELECT * FROM evidence_items WHERE id=? AND user_id=? AND data_kind='user' AND verification_status='verified'`).get(sourceRecordId, ownerId) as Row | undefined;
    if (!row) throw new Error("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    return complete({ ownerId, sourceDomain, sourceRecordId, sourceType: `verified_evidence:${String(row.evidence_type)}`, sourceTruthStatus: "verified", trustClass: "verified_evidence", contextPayload: {
      evidenceType: row.evidence_type, description: compact(row.description, 800), relatedAbility: compact(row.related_ability, 240),
      source: compact(row.source, 300), confidence: Number(row.confidence), capturedAt: row.captured_at,
    }, evidenceRefs: [`evidence:${sourceRecordId}`], provenanceRefs: [`${String(row.source_type)}:${String(row.source_id)}`], approvedAt: String(row.updated_at), limitations: ["已验证证据本身不会直接形成正式能力或成长变化。"] });
  }

  if (sourceDomain === "goal") {
    const row = db.prepare(`SELECT * FROM learning_goals WHERE id=? AND user_id=? AND data_kind='user' AND status IN ('active','completed') AND deleted_at IS NULL`).get(sourceRecordId, ownerId) as Row | undefined;
    if (!row) throw new Error("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    return complete({ ownerId, sourceDomain, sourceRecordId, sourceType: "authoritative_learning_goal", sourceTruthStatus: String(row.status) === "completed" ? "completed" : "active", trustClass: "approved_personal_state", contextPayload: {
      title: compact(row.title, 300), purpose: compact(row.purpose, 600), currentBasis: compact(row.current_basis, 600), finalGoal: compact(row.final_goal, 600),
      targetLevel: row.target_level, status: row.status, deadline: row.deadline,
    }, evidenceRefs: [], provenanceRefs: [`learning_goal:${sourceRecordId}`], approvedAt: String(row.created_at), limitations: ["这里只投影正式目标状态；目标建议和已归档目标不会进入。"] });
  }

  if (sourceDomain === "daily_plan") {
    const row = db.prepare(`SELECT plan.*,candidate.approved_at,candidate.created_at candidate_created_at
      FROM daily_plans plan
      JOIN daily_plan_candidates candidate ON candidate.id=plan.source_candidate_id AND candidate.user_id=plan.user_id
      WHERE plan.id=? AND plan.user_id=? AND candidate.status='approved' AND plan.status IN ('active','completed')`).get(sourceRecordId, ownerId) as Row | undefined;
    if (!row) throw new Error("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
    const plan = parseObject(row.plan_json);
    return complete({ ownerId, sourceDomain, sourceRecordId, sourceType: "approved_daily_plan", sourceTruthStatus: String(row.status) === "completed" ? "completed" : "active", trustClass: "approved_personal_state", contextPayload: {
      planDate: row.plan_date, status: row.status, energy: Number(row.energy), title: compact(plan.title, 300),
      actions: Array.isArray(plan.actions) ? plan.actions.slice(0, 8) : [],
    }, evidenceRefs: parseStrings(plan.sourceRefs), provenanceRefs: [`daily_plan_candidate:${String(row.source_candidate_id)}`], approvedAt: String(row.approved_at ?? row.candidate_created_at), limitations: ["只有当前已批准的今日计划，才能用于导师或每日运行。"] });
  }

  const object = db.prepare(`SELECT * FROM knowledge_objects WHERE id=? AND user_id=? AND approval_status='approved'
    AND validation_status IN ('valid','partial','needs_review') AND archived_at IS NULL`).get(sourceRecordId, ownerId) as Row | undefined;
  if (!object) throw new Error("APPROVED_CONTEXT_FORMAL_SOURCE_REQUIRED");
  let payload: Record<string, unknown> = { objectType: object.object_type, validationStatus: object.validation_status };
  const provenanceRefs = [`knowledge_object:${sourceRecordId}`];
  if (object.object_type === "source") {
    const row = db.prepare("SELECT * FROM knowledge_sources WHERE id=?").get(sourceRecordId) as Row | undefined;
    payload = { ...payload, title: compact(row?.title, 300), sourceType: row?.source_type, ownership: row?.ownership, originalLocator: compact(row?.original_locator, 500) };
    provenanceRefs.push(...parseStrings(row?.provenance_json));
  } else if (object.object_type === "unit") {
    const row = db.prepare("SELECT * FROM knowledge_units WHERE id=?").get(sourceRecordId) as Row | undefined;
    payload = { ...payload, unitType: row?.unit_type, title: compact(row?.title, 300), content: compact(row?.content, 1_200), originalLocator: compact(row?.original_locator, 500) };
    if (row?.source_id) provenanceRefs.push(`knowledge_source:${String(row.source_id)}`);
  } else if (object.object_type === "collection") {
    const row = db.prepare("SELECT * FROM knowledge_collections WHERE id=?").get(sourceRecordId) as Row | undefined;
    payload = { ...payload, collectionType: row?.collection_type, title: compact(row?.title, 300), description: compact(row?.description, 900) };
  } else {
    throw new Error("APPROVED_CONTEXT_KNOWLEDGE_TYPE_NOT_ENABLED");
  }
  const decision = db.prepare("SELECT created_at,decided_by FROM knowledge_approval_decisions WHERE object_id=? AND user_id=? AND decision='approved'").get(sourceRecordId, ownerId) as Row | undefined;
  return complete({ ownerId, sourceDomain: "knowledge", sourceRecordId, sourceType: `approved_knowledge:${String(object.object_type)}`, sourceTruthStatus: "approved", trustClass: "approved_reference", contextPayload: payload, evidenceRefs: [], provenanceRefs, approvedAt: String(decision?.created_at ?? object.updated_at), limitations: ["初始阶段只启用已批准、未归档的知识来源、知识单元与知识集合。"] });
}

export function isPurposeAllowed(source: ApprovedContextSource, purpose: ContextPurpose) {
  return source.allowedPurposes.includes(purpose);
}
