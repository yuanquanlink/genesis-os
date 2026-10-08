import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import type {
  MasteryDecision,
  MasteryGateEvaluation,
  MasteryGateType,
  MasteryLifecycle,
} from "@/lib/domain/mastery-truth";

const USER_ID = "genesis-owner";
const json = (value: unknown) => JSON.stringify(value);
const parseJson = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};
const camel = (record: Record<string, unknown>) => Object.fromEntries(
  Object.entries(record).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]),
) as Record<string, unknown>;

export type MasteryPilotRecord = {
  id: string;
  slug: string;
  version: number;
  definitionId: string;
  title: string;
  description: string;
  conceptScope: string[];
  transferVariants: Array<Record<string, string>>;
  assessmentPolicy: Record<string, unknown>;
  projectPolicy: Record<string, unknown>;
  priorMinHours: number;
  priorMaxHours: number;
  priorConfidence: "low" | "medium" | "high";
  priorBasis: string;
  weeklyCapacityMinutes: number;
  targetUtilization: number;
  availabilityStatus: string;
  realUserVerified: boolean;
  sources: MasteryPilotSourceRecord[];
};

export type MasteryPilotSourceRecord = {
  id: string; pilotId: string; sourceKey: string; title: string; sourceUrl: string;
  sourceType: string; role: string; intakeStatus: string; contentStatus: string;
  copyrightNote: string; metadata: Record<string, unknown>; createdAt: string;
};

export type MasteryCertificationRecord = {
  id: string;
  goalId: string;
  definitionId: string;
  pilotId: string;
  lifecycleStatus: MasteryLifecycle;
  courseCompletedAt: string | null;
  latestDecisionId: string | null;
  startedAt: string;
  masteredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MasteryRequirementRecord = {
  id: string;
  definitionId: string;
  gateType: MasteryGateType;
  label: string;
  required: boolean;
  threshold: number;
  weight: number;
  retryDelayDays: number;
  policy: {
    acceptedEvidenceTypes?: string[];
    delayDays?: number;
    futureIntervals?: number[];
    maxCriticalAssistanceLevel?: number;
    requiresAllGateProvenance?: boolean;
    retryAction?: string;
  };
  position: number;
};

export class MasteryTruthRepository {
  constructor(private readonly repository: ProfileRepository) {}

  private get db() { return this.repository.db; }

  private audit(action: string, entityType: string, entityId: string, after: unknown, at: string) {
    this.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)",
    ).run(randomUUID(), USER_ID, action, entityType, entityId, json(after), at);
  }

  pilots(): MasteryPilotRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM mastery_pilots WHERE availability_status='available' ORDER BY title",
    ).all() as Array<Record<string, unknown>>;
    const sourceStatement = this.db.prepare("SELECT * FROM mastery_pilot_sources WHERE pilot_id=? ORDER BY source_key");
    return rows.map((row) => {
      const value = camel(row);
      return {
        id: String(value.id), slug: String(value.slug), version: Number(value.version),
        definitionId: String(value.definitionId), title: String(value.title), description: String(value.description),
        conceptScope: parseJson(row.concept_scope_json, []), transferVariants: parseJson(row.transfer_variants_json, []),
        assessmentPolicy: parseJson(row.assessment_policy_json, {}), projectPolicy: parseJson(row.project_policy_json, {}),
        priorMinHours: Number(value.priorMinHours), priorMaxHours: Number(value.priorMaxHours),
        priorConfidence: String(value.priorConfidence) as MasteryPilotRecord["priorConfidence"], priorBasis: String(value.priorBasis),
        weeklyCapacityMinutes: Number(value.weeklyCapacityMinutes), targetUtilization: Number(value.targetUtilization),
        availabilityStatus: String(value.availabilityStatus), realUserVerified: Boolean(value.realUserVerified),
        sources: (sourceStatement.all(value.id) as Array<Record<string, unknown>>).map((source) => ({
          ...camel(source), metadata: parseJson(source.metadata_json, {}),
        })) as MasteryPilotSourceRecord[],
      };
    });
  }

  pilot(slug: string) { return this.pilots().find((item) => item.slug === slug) ?? null; }

  certification(goalId: string): MasteryCertificationRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM mastery_certifications WHERE user_id=? AND goal_id=?",
    ).get(USER_ID, goalId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const value = camel(row);
    return {
      id: String(value.id), goalId: String(value.goalId), definitionId: String(value.definitionId), pilotId: String(value.pilotId),
      lifecycleStatus: String(value.lifecycleStatus) as MasteryLifecycle,
      courseCompletedAt: value.courseCompletedAt ? String(value.courseCompletedAt) : null,
      latestDecisionId: value.latestDecisionId ? String(value.latestDecisionId) : null,
      startedAt: String(value.startedAt), masteredAt: value.masteredAt ? String(value.masteredAt) : null,
      createdAt: String(value.createdAt), updatedAt: String(value.updatedAt),
    };
  }

  initialize(goalId: string, pilot: MasteryPilotRecord, at: string, rollingPlan: unknown) {
    return this.db.transaction(() => {
      const goal = this.db.prepare(
        "SELECT * FROM learning_goals WHERE id=? AND user_id=? AND deleted_at IS NULL",
      ).get(goalId, USER_ID) as Record<string, unknown> | undefined;
      if (!goal) throw new Error("LEARNING_GOAL_NOT_FOUND");
      const existing = this.certification(goalId);
      if (existing) return { certification: existing, duplicate: true };
      const id = randomUUID();
      this.db.prepare(
        `INSERT INTO mastery_certifications
         (id,user_id,goal_id,definition_id,pilot_id,lifecycle_status,started_at,created_at,updated_at)
         VALUES (?,?,?,?,?,'learning',?,?,?)`,
      ).run(id, USER_ID, goalId, pilot.definitionId, pilot.id, at, at, at);
      const lowMinutes = Math.round(pilot.priorMinHours * 60);
      const highMinutes = Math.round(pilot.priorMaxHours * 60);
      const realistic = Math.round((lowMinutes + highMinutes) / 2);
      this.db.prepare(
        `INSERT INTO learning_time_estimates
         (id,goal_id,diagnostic_id,optimistic_minutes,realistic_minutes,conservative_minutes,prerequisite_minutes,theory_minutes,practice_minutes,project_minutes,review_minutes,confidence,uncertainty_json,calibration_reason,realistic_min_minutes,realistic_max_minutes,estimated_finish_date,basis_json,previous_estimate_id,estimated_min_hours,estimated_max_hours,confidence_level,confidence_reason,prior_basis,sessions_used,actual_hours_so_far,calibration_status,last_recalculated_at,weekly_capacity_minutes,target_utilization,rolling_plan_json,created_at)
         VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,NULL,?,?,?,?,?,0,0,'prior_only',?,?,?,?,?)`,
      ).run(
        randomUUID(), goalId, lowMinutes, realistic, highMinutes,
        Math.round(realistic * 0.15), Math.round(realistic * 0.25), Math.round(realistic * 0.25), Math.round(realistic * 0.25), Math.round(realistic * 0.1),
        0.35, json(["No real session calibration yet", "Transfer and remediation time are uncertain"]),
        "Owner-approved Phase 1 prior; not a precise promise.", lowMinutes, highMinutes,
        json({ kind: "pilot_prior", pilotId: pilot.id }), pilot.priorMinHours, pilot.priorMaxHours, pilot.priorConfidence,
        "Insufficient persisted sessions for personal calibration.", pilot.priorBasis, at,
        pilot.weeklyCapacityMinutes, pilot.targetUtilization, json(rollingPlan), at,
      );
      this.audit("mastery.certification_initialized", "mastery_certification", id, {
        goalId, pilotId: pilot.id, lifecycleStatus: "learning", realUserVerified: false,
      }, at);
      return { certification: this.certification(goalId)!, duplicate: false };
    })();
  }

  markCourseCompleted(goalId: string, at: string) {
    const certification = this.certification(goalId);
    if (!certification) throw new Error("MASTERY_CERTIFICATION_NOT_FOUND");
    if (certification.courseCompletedAt)
      return { certification, duplicate: true };
    this.db.prepare(
      "UPDATE mastery_certifications SET lifecycle_status='course_completed',course_completed_at=?,updated_at=? WHERE id=?",
    ).run(at, at, certification.id);
    this.audit("mastery.course_completed", "mastery_certification", certification.id, {
      goalId, lifecycleStatus: "course_completed", autoMastered: false,
    }, at);
    return { certification: this.certification(goalId)!, duplicate: false };
  }

  requirements(definitionId: string): MasteryRequirementRecord[] {
    return (this.db.prepare(
      "SELECT * FROM mastery_gate_requirements WHERE definition_id=? ORDER BY position",
    ).all(definitionId) as Array<Record<string, unknown>>).map((row) => {
      const value = camel(row);
      return {
        id: String(value.id), definitionId: String(value.definitionId), gateType: String(value.gateType) as MasteryGateType,
        label: String(value.label), required: Boolean(value.required), threshold: Number(value.threshold), weight: Number(value.weight),
        retryDelayDays: Number(value.retryDelayDays), policy: parseJson(row.policy_json, {}), position: Number(value.position),
      };
    });
  }

  attempts(certificationId: string): Array<Record<string, unknown>> {
    return (this.db.prepare(
      "SELECT * FROM mastery_gate_attempts WHERE certification_id=? ORDER BY gate_type,attempt_number DESC",
    ).all(certificationId) as Array<Record<string, unknown>>).map((row) => ({
      ...camel(row),
      required: Boolean(row.required), retryAllowed: Boolean(row.retry_allowed),
      evidenceRefs: parseJson<string[]>(row.evidence_refs_json, []), sourceRefs: parseJson<string[]>(row.source_refs_json, []),
    })) as Array<Record<string, unknown>>;
  }

  latestAttempts(certificationId: string) {
    const latest = new Map<MasteryGateType, Record<string, unknown>>();
    for (const attempt of this.attempts(certificationId)) {
      const type = String(attempt.gateType) as MasteryGateType;
      if (!latest.has(type)) latest.set(type, attempt);
    }
    return latest;
  }

  saveAttempt(input: {
    certificationId: string; requirement: MasteryRequirementRecord; clientRequestId: string; score: number;
    status: MasteryGateEvaluation["status"]; evidenceRefs: string[]; sourceRefs: string[]; failureReason: string | null;
    nextRetryAt: string | null; assistanceMaxLevel: number; notes: string; metadataVersion: string; at: string;
  }) {
    return this.db.transaction(() => {
      const duplicate = this.db.prepare("SELECT * FROM mastery_gate_attempts WHERE client_request_id=?").get(input.clientRequestId) as Record<string, unknown> | undefined;
      if (duplicate) return { attempt: this.attempts(input.certificationId).find((item) => item.id === duplicate.id)!, duplicate: true };
      const attemptNumber = Number((this.db.prepare(
        "SELECT COALESCE(MAX(attempt_number),0)+1 next FROM mastery_gate_attempts WHERE certification_id=? AND gate_requirement_id=?",
      ).get(input.certificationId, input.requirement.id) as { next: number }).next);
      const id = randomUUID();
      const result = input.status === "passed" ? "pass" : input.status === "failed" ? "fail" : input.status;
      this.db.prepare(
        `INSERT INTO mastery_gate_attempts
         (id,certification_id,gate_requirement_id,client_request_id,attempt_number,gate_type,status,result,required,threshold,score_optional,evidence_refs_json,source_refs_json,evaluated_at,evaluator_type,failure_reason,retry_allowed,next_retry_at,assistance_max_level,notes,metadata_version,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'deterministic',?,1,?,?,?,?,?)`,
      ).run(
        id, input.certificationId, input.requirement.id, input.clientRequestId, attemptNumber, input.requirement.gateType,
        input.status, result, input.requirement.required ? 1 : 0, input.requirement.threshold, input.score,
        json(input.evidenceRefs), json(input.sourceRefs), input.at, input.failureReason, input.nextRetryAt,
        input.assistanceMaxLevel, input.notes, input.metadataVersion, input.at,
      );
      this.db.prepare(
        "UPDATE mastery_certifications SET lifecycle_status='mastery_pending',updated_at=? WHERE id=? AND lifecycle_status IN ('course_completed','mastery_pending','remediation_required')",
      ).run(input.at, input.certificationId);
      this.audit("mastery.gate_attempt_recorded", "mastery_gate_attempt", id, {
        gateType: input.requirement.gateType, attemptNumber, status: input.status, score: input.score,
        evidenceRefs: input.evidenceRefs, evaluatorType: "deterministic",
      }, input.at);
      return { attempt: this.attempts(input.certificationId).find((item) => item.id === id)!, duplicate: false };
    })();
  }

  recordAssistance(input: {
    certificationId: string; clientRequestId: string; gateType?: MasteryGateType; phase: "learning" | "final";
    level: number; critical: boolean; tool: string; detail: string; at: string;
  }) {
    const existing = this.db.prepare("SELECT * FROM mastery_assistance_events WHERE client_request_id=?").get(input.clientRequestId) as Record<string, unknown> | undefined;
    if (existing) return { event: camel(existing), duplicate: true };
    const id = randomUUID();
    this.db.prepare(
      "INSERT INTO mastery_assistance_events (id,certification_id,gate_type,client_request_id,phase,assistance_level,critical,tool,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).run(id, input.certificationId, input.gateType ?? null, input.clientRequestId, input.phase, input.level, input.critical ? 1 : 0, input.tool, input.detail, input.at);
    this.audit("mastery.assistance_recorded", "mastery_assistance_event", id, {
      phase: input.phase, level: input.level, critical: input.critical, gateType: input.gateType ?? null,
    }, input.at);
    return { event: camel(this.db.prepare("SELECT * FROM mastery_assistance_events WHERE id=?").get(id) as Record<string, unknown>), duplicate: false };
  }

  finalCriticalAssistanceSince(certificationId: string, since: string | null) {
    const row = this.db.prepare(
      `SELECT COALESCE(MAX(assistance_level),0) level FROM mastery_assistance_events
       WHERE certification_id=? AND phase='final' AND critical=1 AND (? IS NULL OR created_at>?)`,
    ).get(certificationId, since, since) as { level: number };
    return Number(row.level || 0);
  }

  assistance(certificationId: string) {
    return (this.db.prepare(
      "SELECT * FROM mastery_assistance_events WHERE certification_id=? ORDER BY created_at DESC",
    ).all(certificationId) as Array<Record<string, unknown>>).map((row) => ({ ...camel(row), critical: Boolean(row.critical) }));
  }

  definitionThreshold(definitionId: string) {
    const row = this.db.prepare("SELECT aggregate_threshold FROM mastery_definitions WHERE id=? AND status='active'").get(definitionId) as { aggregate_threshold: number } | undefined;
    if (!row) throw new Error("MASTERY_DEFINITION_NOT_FOUND");
    return Number(row.aggregate_threshold);
  }

  saveDecision(certification: MasteryCertificationRecord, decision: MasteryDecision, requirements: MasteryRequirementRecord[]) {
    return this.db.transaction(() => {
      const id = randomUUID();
      this.db.prepare(
        `INSERT INTO mastery_decisions
         (id,certification_id,overall_status,aggregate_score,hard_gate_summary_json,passed_gates_json,failed_gates_json,missing_gates_json,blocked_reasons_json,evidence_refs_json,decision_version,evaluated_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id, certification.id, decision.overallStatus, decision.aggregateScore, json(decision.hardGateSummary),
        json(decision.passedGates), json(decision.failedGates), json(decision.missingGates), json(decision.blockedReasons),
        json(decision.evidenceRefs), decision.decisionVersion, decision.evaluatedAt, decision.evaluatedAt,
      );
      this.db.prepare(
        `UPDATE mastery_certifications SET lifecycle_status=?,latest_decision_id=?,mastered_at=CASE WHEN ?='mastered' THEN ? ELSE mastered_at END,updated_at=? WHERE id=?`,
      ).run(decision.overallStatus, id, decision.overallStatus, decision.evaluatedAt, decision.evaluatedAt, certification.id);
      this.db.prepare(
        "UPDATE mastery_remediation_plans SET status='superseded',updated_at=? WHERE certification_id=? AND status='active'",
      ).run(decision.evaluatedAt, certification.id);
      const requirementByType = new Map(requirements.map((item) => [item.gateType, item]));
      for (const gateType of decision.failedGates) {
        const requirement = requirementByType.get(gateType)!;
        this.db.prepare(
          `INSERT INTO mastery_remediation_plans
           (id,certification_id,decision_id,gate_type,diagnosis,target_concepts_json,target_exercises_json,reason,failed_gate_refs_json,retry_rules_json,version,status,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,1,'active',?,?)`,
        ).run(
          randomUUID(), certification.id, id, gateType, `${requirement.label} gate did not satisfy its persisted threshold and policy.`,
          json([requirement.label]), json([requirement.policy.retryAction || `Retry ${requirement.label}`]),
          decision.blockedReasons.find((reason) => reason.toLowerCase().includes(gateType.split("_")[0])) || `${gateType} failed`,
          json([`${certification.id}:${gateType}`]), json({ retryAllowed: true, retryDelayDays: requirement.retryDelayDays }),
          decision.evaluatedAt, decision.evaluatedAt,
        );
      }
      this.audit("mastery.decision_created", "mastery_decision", id, {
        ...decision, formalAbilityUpdated: false, realUserVerified: false,
      }, decision.evaluatedAt);
      return { id, ...decision, evidenceItemId: null, growthCandidateId: null };
    })();
  }

  linkDecisionEvidence(decisionId: string, evidenceItemId: string, candidateId: string | null, at: string) {
    this.db.prepare(
      "UPDATE mastery_decisions SET evidence_item_id=?,growth_candidate_id=? WHERE id=?",
    ).run(evidenceItemId, candidateId, decisionId);
    this.audit("mastery.decision_evidence_candidate_linked", "mastery_decision", decisionId, {
      evidenceItemId, growthCandidateId: candidateId, formalAbilityUpdated: false,
    }, at);
  }

  decisions(certificationId: string) {
    return (this.db.prepare(
      "SELECT * FROM mastery_decisions WHERE certification_id=? ORDER BY evaluated_at DESC",
    ).all(certificationId) as Array<Record<string, unknown>>).map((row) => ({
      ...camel(row), hardGateSummary: parseJson(row.hard_gate_summary_json, {}), passedGates: parseJson(row.passed_gates_json, []),
      failedGates: parseJson(row.failed_gates_json, []), missingGates: parseJson(row.missing_gates_json, []),
      blockedReasons: parseJson(row.blocked_reasons_json, []), evidenceRefs: parseJson(row.evidence_refs_json, []),
    }));
  }

  remediation(certificationId: string) {
    return (this.db.prepare(
      "SELECT * FROM mastery_remediation_plans WHERE certification_id=? ORDER BY created_at DESC",
    ).all(certificationId) as Array<Record<string, unknown>>).map((row) => ({
      ...camel(row), targetConcepts: parseJson(row.target_concepts_json, []), targetExercises: parseJson(row.target_exercises_json, []),
      failedGateRefs: parseJson(row.failed_gate_refs_json, []), retryRules: parseJson(row.retry_rules_json, {}),
    }));
  }

  latestEstimate(goalId: string): Record<string, unknown> | null {
    const row = this.db.prepare("SELECT * FROM learning_time_estimates WHERE goal_id=? ORDER BY created_at DESC LIMIT 1").get(goalId) as Record<string, unknown> | undefined;
    return row ? { ...camel(row), rollingPlan: parseJson<unknown[]>(row.rolling_plan_json, []) } : null;
  }

  updateEstimate(goalId: string, values: {
    sessionsUsed: number; actualHours: number; confidence: "low" | "medium" | "high"; status: "prior_only" | "calibrating" | "calibrated";
    confidenceReason: string; rollingPlan: unknown; at: string;
  }) {
    const estimate = this.latestEstimate(goalId);
    if (!estimate) throw new Error("MASTERY_TIME_ESTIMATE_NOT_FOUND");
    this.db.prepare(
      "UPDATE learning_time_estimates SET sessions_used=?,actual_hours_so_far=?,confidence_level=?,confidence_reason=?,calibration_status=?,last_recalculated_at=?,rolling_plan_json=? WHERE id=?",
    ).run(values.sessionsUsed, values.actualHours, values.confidence, values.confidenceReason, values.status, values.at, json(values.rollingPlan), estimate.id);
    this.audit("mastery.time_estimate_recalibrated", "learning_time_estimate", String(estimate.id), {
      sessionsUsed: values.sessionsUsed, actualHours: values.actualHours, confidence: values.confidence, status: values.status,
    }, values.at);
    return this.latestEstimate(goalId);
  }

  snapshot(goalId?: string) {
    const pilots = this.pilots();
    if (!goalId) return { pilots, certification: null, requirements: [], gates: [], attempts: [], decisions: [], remediation: [], assistance: [], timeEstimate: null };
    const certification = this.certification(goalId);
    if (!certification) return { pilots, certification: null, requirements: [], gates: [], attempts: [], decisions: [], remediation: [], assistance: [], timeEstimate: this.latestEstimate(goalId) };
    return {
      pilots, certification, requirements: this.requirements(certification.definitionId), gates: [],
      attempts: this.attempts(certification.id), decisions: this.decisions(certification.id),
      remediation: this.remediation(certification.id), assistance: this.assistance(certification.id), timeEstimate: this.latestEstimate(goalId),
    };
  }
}
