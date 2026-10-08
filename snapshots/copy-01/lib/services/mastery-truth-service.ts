import type { ProfileRepository } from "@/lib/db/repository";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import { GrowthRepository } from "@/lib/db/growth-repository";
import {
  MasteryTruthRepository,
  type MasteryCertificationRecord,
  type MasteryRequirementRecord,
} from "@/lib/db/mastery-truth-repository";
import {
  MASTERY_METADATA_VERSION,
  evaluateMasteryTruth,
  masteryActionSchema,
  masteryGateTypes,
  type MasteryAction,
  type MasteryGateEvaluation,
  type MasteryGateType,
} from "@/lib/domain/mastery-truth";

const USER_ID = "genesis-owner";

export interface MasteryClock { now(): Date }
export class SystemMasteryClock implements MasteryClock { now() { return new Date(); } }

const iso = (date: Date) => date.toISOString();
const addDays = (value: string, days: number) => {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

export class MasteryTruthService {
  private readonly mastery: MasteryTruthRepository;

  constructor(
    private readonly repository: ProfileRepository,
    private readonly clock: MasteryClock = new SystemMasteryClock(),
  ) {
    this.mastery = new MasteryTruthRepository(repository);
  }

  snapshot(goalId?: string) {
    const snapshot = this.mastery.snapshot(goalId);
    if (!snapshot.certification) return snapshot;
    const latest = this.mastery.latestAttempts(snapshot.certification.id);
    return {
      ...snapshot,
      gates: snapshot.requirements.map((requirement) => this.gateFromAttempt(requirement, latest.get(requirement.gateType))),
    };
  }

  async act(raw: unknown) {
    const input = masteryActionSchema.parse(raw);
    switch (input.action) {
      case "initialize": return this.initialize(input);
      case "complete_course": return this.completeCourse(input.goalId);
      case "record_gate_attempt": return this.recordGateAttempt(input);
      case "record_assistance": return this.recordAssistance(input);
      case "evaluate": return this.evaluate(input.goalId);
      case "recalibrate_estimate": return this.recalibrateEstimate(input.goalId);
    }
  }

  private rollingPlan(start: Date, weeklyCapacityMinutes: number, targetUtilization: number) {
    const target = Math.floor(weeklyCapacityMinutes * targetUtilization);
    const capacities = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + offset);
      const weekend = [0, 6].includes(date.getUTCDay());
      return { date: date.toISOString().slice(0, 10), capacityMinutes: weekend ? 180 : 90 };
    });
    const rawCapacity = capacities.reduce((sum, item) => sum + item.capacityMinutes, 0);
    const scale = Math.min(1, target / Math.max(1, rawCapacity));
    return capacities.map((item) => {
      const plannedMinutes = Math.floor((item.capacityMinutes * scale) / 5) * 5;
      return { ...item, plannedMinutes, bufferMinutes: item.capacityMinutes - plannedMinutes };
    });
  }

  private initialize(input: Extract<MasteryAction, { action: "initialize" }>) {
    const pilot = this.mastery.pilot(input.pilotSlug);
    if (!pilot) throw new Error("MASTERY_PILOT_NOT_FOUND");
    const at = iso(this.clock.now());
    const result = this.mastery.initialize(
      input.goalId,
      pilot,
      at,
      this.rollingPlan(this.clock.now(), pilot.weeklyCapacityMinutes, pilot.targetUtilization),
    );
    return { ...result, snapshot: this.snapshot(input.goalId) };
  }

  private completeCourse(goalId: string) {
    const result = this.mastery.markCourseCompleted(goalId, iso(this.clock.now()));
    return { ...result, mastered: false, snapshot: this.snapshot(goalId) };
  }

  private certification(goalId: string): MasteryCertificationRecord {
    const certification = this.mastery.certification(goalId);
    if (!certification) throw new Error("MASTERY_CERTIFICATION_NOT_FOUND");
    return certification;
  }

  private requirement(certification: MasteryCertificationRecord, gateType: MasteryGateType) {
    const requirement = this.mastery.requirements(certification.definitionId).find((item) => item.gateType === gateType);
    if (!requirement) throw new Error("MASTERY_GATE_NOT_FOUND");
    return requirement;
  }

  private referenceParts(reference: string) {
    const separator = reference.indexOf(":");
    return { type: reference.slice(0, separator), id: reference.slice(separator + 1) };
  }

  private persistedReferenceExists(reference: string, certification: MasteryCertificationRecord) {
    const { type, id } = this.referenceParts(reference);
    if (type === "pilot_source") {
      return Boolean(this.repository.db.prepare(
        "SELECT 1 FROM mastery_pilot_sources WHERE pilot_id=? AND (id=? OR source_key=?)",
      ).get(certification.pilotId, id, id));
    }
    if (type === "learning_resource") {
      return Boolean(this.repository.db.prepare(
        "SELECT 1 FROM learning_resources WHERE id=? AND goal_id=? AND status IN ('ready','unsupported')",
      ).get(id, certification.goalId));
    }
    if (type === "resource_section") {
      return Boolean(this.repository.db.prepare(
        "SELECT 1 FROM resource_sections section JOIN learning_resources resource ON resource.id=section.resource_id WHERE section.id=? AND resource.goal_id=?",
      ).get(id, certification.goalId));
    }
    const goalId = certification.goalId;
    const queries: Record<string, { sql: string; args: unknown[] }> = {
      assessment_attempt: {
        sql: "SELECT 1 FROM assessment_attempts attempt JOIN assessments assessment ON assessment.id=attempt.assessment_id WHERE attempt.id=? AND assessment.goal_id=?",
        args: [id, goalId],
      },
      review_attempt: {
        sql: "SELECT 1 FROM review_attempts WHERE id=? AND goal_id=?",
        args: [id, goalId],
      },
      learning_session: {
        sql: "SELECT 1 FROM learning_sessions WHERE id=? AND goal_id=? AND status='completed'",
        args: [id, goalId],
      },
      project_submission: {
        sql: "SELECT 1 FROM project_submissions submission JOIN project_challenges challenge ON challenge.id=submission.challenge_id WHERE submission.id=? AND challenge.goal_id=? AND submission.status IN ('analyzed','verified')",
        args: [id, goalId],
      },
      verification_run: {
        sql: "SELECT 1 FROM project_verification_runs run JOIN project_submissions submission ON submission.id=run.submission_id JOIN project_challenges challenge ON challenge.id=submission.challenge_id WHERE run.id=? AND challenge.goal_id=? AND run.status IN ('pass','partial')",
        args: [id, goalId],
      },
      defense_session: {
        sql: "SELECT 1 FROM project_defense_sessions defense JOIN project_challenges challenge ON challenge.id=defense.challenge_id WHERE defense.id=? AND challenge.goal_id=? AND defense.status='evaluated'",
        args: [id, goalId],
      },
      independence_record: {
        sql: "SELECT 1 FROM project_independence_scores independence JOIN project_submissions submission ON submission.id=independence.submission_id JOIN project_challenges challenge ON challenge.id=submission.challenge_id WHERE independence.id=? AND challenge.goal_id=?",
        args: [id, goalId],
      },
      engineering_outcome: {
        sql: "SELECT 1 FROM engineering_outcomes WHERE id=? AND goal_id=? AND status='reviewed'",
        args: [id, goalId],
      },
      mastery_evidence: {
        sql: "SELECT 1 FROM mastery_evidence WHERE id=? AND goal_id=?",
        args: [id, goalId],
      },
      evidence_item: {
        sql: "SELECT 1 FROM evidence_items WHERE id=? AND verification_status='verified' AND user_id=?",
        args: [id, USER_ID],
      },
      assistance_event: {
        sql: "SELECT 1 FROM mastery_assistance_events WHERE id=? AND certification_id=?",
        args: [id, certification.id],
      },
    };
    const query = queries[type];
    return query ? Boolean(this.repository.db.prepare(query.sql).get(...query.args)) : false;
  }

  private evaluateProvenance(requirement: MasteryRequirementRecord, refs: string[], certification: MasteryCertificationRecord) {
    const accepted = new Set(requirement.policy.acceptedEvidenceTypes || []);
    const invalid: string[] = [];
    for (const reference of refs) {
      const { type } = this.referenceParts(reference);
      if (!accepted.has(type) || !this.persistedReferenceExists(reference, certification)) invalid.push(reference);
    }
    return invalid;
  }

  private recordGateAttempt(input: Extract<MasteryAction, { action: "record_gate_attempt" }>) {
    const certification = this.certification(input.goalId);
    if (!certification.courseCompletedAt) throw new Error("MASTERY_COURSE_NOT_COMPLETED");
    const requirement = this.requirement(certification, input.gateType);
    const now = this.clock.now();
    const at = iso(now);
    const invalidEvidence = this.evaluateProvenance(requirement, input.evidenceRefs, certification);
    const invalidSources = input.sourceRefs.filter((reference) => !this.persistedReferenceExists(reference, certification));
    let status: MasteryGateEvaluation["status"] = input.observedScore >= requirement.threshold ? "passed" : "failed";
    let failureReason: string | null = status === "failed"
      ? `${requirement.gateType} score ${input.observedScore.toFixed(2)} is below ${requirement.threshold.toFixed(2)}`
      : null;
    let nextRetryAt: string | null = requirement.retryDelayDays ? addDays(at, requirement.retryDelayDays) : null;
    let assistanceMaxLevel = 0;

    if (invalidEvidence.length || invalidSources.length) {
      status = "failed";
      failureReason = `Persisted provenance failed validation: ${[...invalidEvidence, ...invalidSources].join(", ")}`;
    }

    if (requirement.gateType === "delayed_recall") {
      const dueAt = addDays(certification.courseCompletedAt, requirement.policy.delayDays ?? requirement.retryDelayDays ?? 3);
      nextRetryAt = dueAt;
      if (now.getTime() < new Date(dueAt).getTime()) {
        status = "waiting";
        failureReason = `Delayed recall is not due until ${dueAt}`;
      }
    }

    if (requirement.gateType === "independence") {
      const previous = this.mastery.latestAttempts(certification.id).get("independence");
      assistanceMaxLevel = this.mastery.finalCriticalAssistanceSince(
        certification.id,
        previous?.evaluatedAt ? String(previous.evaluatedAt) : null,
      );
      if (assistanceMaxLevel >= 4) {
        status = "failed";
        failureReason = `Final critical assistance level ${assistanceMaxLevel} blocks independent mastery; a clean retake is allowed.`;
      }
    }

    if (requirement.gateType === "evidence") {
      const latest = this.mastery.latestAttempts(certification.id);
      const missing = masteryGateTypes
        .filter((type) => type !== "evidence")
        .filter((type) => {
          const attempt = latest.get(type);
          return !attempt || attempt.status !== "passed" || !Array.isArray(attempt.evidenceRefs) || !attempt.evidenceRefs.length;
        });
      if (missing.length) {
        status = "blocked";
        failureReason = `Evidence Gate requires passed persisted provenance for: ${missing.join(", ")}`;
      }
    }

    const result = this.mastery.saveAttempt({
      certificationId: certification.id, requirement, clientRequestId: input.clientRequestId, score: input.observedScore,
      status, evidenceRefs: input.evidenceRefs, sourceRefs: input.sourceRefs, failureReason, nextRetryAt,
      assistanceMaxLevel, notes: input.notes, metadataVersion: MASTERY_METADATA_VERSION, at,
    });
    return { ...result, serverDecision: status, mastered: false, snapshot: this.snapshot(input.goalId) };
  }

  private recordAssistance(input: Extract<MasteryAction, { action: "record_assistance" }>) {
    const certification = this.certification(input.goalId);
    const result = this.mastery.recordAssistance({
      certificationId: certification.id, clientRequestId: input.clientRequestId, gateType: input.gateType,
      phase: input.phase, level: input.level, critical: input.critical, tool: input.tool, detail: input.detail,
      at: iso(this.clock.now()),
    });
    return { ...result, formalAbilityUpdated: false, snapshot: this.snapshot(input.goalId) };
  }

  private gateFromAttempt(requirement: MasteryRequirementRecord, attempt?: Record<string, unknown>): MasteryGateEvaluation {
    return {
      gateId: requirement.id,
      gateType: requirement.gateType,
      status: attempt ? String(attempt.status) as MasteryGateEvaluation["status"] : "pending",
      required: requirement.required,
      threshold: requirement.threshold,
      score: attempt?.scoreOptional === null || attempt?.scoreOptional === undefined ? null : Number(attempt.scoreOptional),
      weight: requirement.weight,
      evidenceRefs: Array.isArray(attempt?.evidenceRefs) ? attempt.evidenceRefs.map(String) : [],
      sourceRefs: Array.isArray(attempt?.sourceRefs) ? attempt.sourceRefs.map(String) : [],
      attemptId: attempt?.id ? String(attempt.id) : null,
      evaluatedAt: attempt?.evaluatedAt ? String(attempt.evaluatedAt) : null,
      evaluatorType: "deterministic",
      failureReason: attempt?.failureReason ? String(attempt.failureReason) : null,
      retryAllowed: attempt ? Boolean(attempt.retryAllowed) : true,
      nextRetryAt: attempt?.nextRetryAt ? String(attempt.nextRetryAt) : null,
      metadataVersion: attempt?.metadataVersion ? String(attempt.metadataVersion) : MASTERY_METADATA_VERSION,
    };
  }

  async evaluate(goalId: string) {
    const certification = this.certification(goalId);
    if (!certification.courseCompletedAt) throw new Error("MASTERY_COURSE_NOT_COMPLETED");
    const requirements = this.mastery.requirements(certification.definitionId);
    const latest = this.mastery.latestAttempts(certification.id);
    const gates = requirements.map((requirement) => this.gateFromAttempt(requirement, latest.get(requirement.gateType)));
    const at = iso(this.clock.now());
    const decision = evaluateMasteryTruth({
      gates, aggregateThreshold: this.mastery.definitionThreshold(certification.definitionId), evaluatedAt: at,
    });
    const saved = this.mastery.saveDecision(certification, decision, requirements);
    if (decision.overallStatus === "mastered") await this.createEvidenceCandidate(goalId, certification, saved.id, decision, at);
    return {
      decision: this.mastery.decisions(certification.id)[0],
      formalAbilityUpdated: false,
      evidenceApprovalRequired: decision.overallStatus === "mastered",
      snapshot: this.snapshot(goalId),
    };
  }

  private async createEvidenceCandidate(
    goalId: string,
    certification: MasteryCertificationRecord,
    decisionId: string,
    decision: ReturnType<typeof evaluateMasteryTruth>,
    at: string,
  ) {
    const goal = this.repository.db.prepare(
      "SELECT title,target_ability,target_level_score,data_kind FROM learning_goals WHERE id=? AND user_id=?",
    ).get(goalId, USER_ID) as { title: string; target_ability: string; target_level_score: number; data_kind: "user" | "demo" | "test" };
    const evidence = new EvidenceRepository(this.repository).createLearningPhase2Evidence({
      sourceType: "mastery_decision",
      sourceId: decisionId,
      goalTitle: goal.title,
      description: `Mastery Truth ${decision.decisionVersion}: all eight required gates passed; aggregate ${Math.round(decision.aggregateScore * 100)}%. Formal Ability remains unchanged pending user approval.`,
      relatedAbility: goal.target_ability || goal.title,
      evidenceType: "learning",
      capturedAt: at,
      dataKind: goal.data_kind,
    });
    const evidenceRef = `EV:${evidence.id}`;
    const candidateByEvidence = new GrowthRepository(this.repository).saveCandidates([{
      nodeType: "ability",
      name: goal.target_ability || goal.title,
      proposedLevel: Math.max(0, Math.min(5, Number(goal.target_level_score || 0))),
      confidence: Math.min(0.85, decision.aggregateScore),
      nextImprovement: "User must review this Mastery Evidence Candidate before any formal Ability change.",
      relatedGoals: [goal.title],
      evidence: [{
        evidenceId: evidenceRef,
        excerpt: `All eight required Mastery Gates passed at aggregate ${Math.round(decision.aggregateScore * 100)}%.`,
        reason: "Deterministic Mastery Truth decision; formal Ability approval remains a user action.",
      }],
    }], {
      provider: "local",
      model: "deterministic-mastery-evidence-v1",
      modelMode: "demo",
      promptVersion: decision.decisionVersion,
      allowedEvidenceIds: new Set([evidenceRef]),
      candidateKind: "evidence_assessment",
    });
    this.mastery.linkDecisionEvidence(decisionId, evidence.id, candidateByEvidence.get(evidenceRef) ?? null, at);
  }

  recalibrateEstimate(goalId: string) {
    this.certification(goalId);
    const row = this.repository.db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM learning_sessions WHERE goal_id=? AND status='completed') completed_sessions,
         (SELECT COUNT(*) FROM evening_reflections WHERE goal_id=? AND actual_minutes>0) reflection_sessions,
         (SELECT COALESCE(SUM(actual_minutes),0) FROM evening_reflections WHERE goal_id=?) actual_minutes`,
    ).get(goalId, goalId, goalId) as { completed_sessions: number; reflection_sessions: number; actual_minutes: number };
    const sessionsUsed = Number(row.completed_sessions) + Number(row.reflection_sessions);
    const confidence = sessionsUsed >= 15 ? "high" : sessionsUsed >= 5 ? "medium" : "low";
    const status = sessionsUsed >= 15 ? "calibrated" : sessionsUsed > 0 ? "calibrating" : "prior_only";
    const estimate = this.mastery.latestEstimate(goalId);
    if (!estimate) throw new Error("MASTERY_TIME_ESTIMATE_NOT_FOUND");
    const at = iso(this.clock.now());
    const rollingPlan = this.rollingPlan(
      this.clock.now(), Number(estimate.weeklyCapacityMinutes || 810), Number(estimate.targetUtilization || 0.875),
    );
    return {
      estimate: this.mastery.updateEstimate(goalId, {
        sessionsUsed, actualHours: Math.round((Number(row.actual_minutes) / 60) * 100) / 100,
        confidence, status,
        confidenceReason: sessionsUsed
          ? `${sessionsUsed} persisted learning/reflection sessions are available for calibration.`
          : "No persisted learning/reflection sessions; the range remains an owner-approved prior.",
        rollingPlan, at,
      }),
      fabricatedSessions: 0,
      snapshot: this.snapshot(goalId),
    };
  }
}
