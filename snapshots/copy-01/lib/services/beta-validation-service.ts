import { randomUUID } from "node:crypto";
import {
  betaValidationActionSchema,
  betaValidationCaptureSchema,
} from "@/lib/domain/beta-validation";
import type { ProfileRepository } from "@/lib/db/repository";

const DEFAULT_USER_ID = "genesis-owner";
const DAY1_REPORT_PATH = "docs/GENESIS_PHASE_4_STEP_10_DAY1_REPORT.md";
type Row = Record<string, unknown>;

function day(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai" }).format(new Date(value));
}
function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
function parseJson<T>(value: unknown, fallback: T): T { try { return JSON.parse(String(value)) as T; } catch { return fallback; } }
function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export type RealValidationRecord = {
  active: boolean;
  sessionId: string;
  localDate: string;
  stage: string;
  references: {
    approvedContextSnapshotRef: string | null;
    approvedContextProjectionIds: string[];
    morningBriefId: string | null;
    dailyPlanCandidateId: string | null;
    activeDailyPlanId: string | null;
    realTaskRefs: string[];
    taskType: string | null;
    artifactRefs: string[];
    evidenceExpectationRefs: string[];
    operatingReflectionId: string | null;
    reflectionCandidateSetId: string | null;
    dailyCloseRef: string | null;
  };
  facts: { dailyPlanGenerated: boolean; dailyPlanOwnerDecision: string; eveningReflectionSubmitted: boolean; followUpCandidateCreated: boolean };
  ownerActions: { approvedContextViewed: boolean; morningBriefViewed: boolean; realTaskStarted: boolean; realTaskCompletionState: string; actualTimeMinutes: number | null; dailyCloseViewed: boolean };
  feedback: Record<string, unknown> | null;
  defects: Array<{ severity: string; category?: string; summary: string }>;
  blockerRefs: string[];
  confirmedCapabilities: string[];
  ownerRealUseConfirmed: boolean;
  report: { targetPath: string; eligible: boolean; missingStages: string[] };
  startedAt: string | null;
  feedbackSubmittedAt: string | null;
  realUseConfirmedAt: string | null;
  closedAt: string | null;
};

export type BetaValidationSnapshot = {
  logs: Array<{ id: string; date: string; dailyLoopStatus: "not_started" | "in_progress" | "reflected"; missionStatus: "none" | "active" | "completed" | "mixed"; missionCompletedCount: number; evidenceAddedCount: number; memoryConfirmedCount: number; mentorCallCount: number; feedbackCount: number; createdAt: string; updatedAt: string; realValidation: RealValidationRecord | null }>;
  summary: { recordedDays: number; firstDate: string | null; lastDate: string | null; totalEvidenceAdded: number; totalMissionCompleted: number; totalMentorCalls: number; totalFeedback: number };
  health: { loopConsistency: number | null; evidenceQuality: number | null; missionCompletion: number | null; memoryStability: number | null; mentorValue: number | null };
};

export class BetaValidationService {
  constructor(private readonly repository: ProfileRepository, private readonly userId = DEFAULT_USER_ID) {}

  snapshot(): BetaValidationSnapshot {
    const db = this.repository.db;
    const logs = db.prepare("SELECT * FROM beta_validation_log WHERE user_id=? ORDER BY log_date DESC LIMIT 30").all(this.userId) as Row[];
    const allLogs = db.prepare("SELECT log_date,daily_loop_status,evidence_added_count,mission_completed_count,mentor_call_count,feedback_count FROM beta_validation_log WHERE user_id=? ORDER BY log_date ASC").all(this.userId) as Row[];
    const evidence = db.prepare("SELECT verification_status FROM evidence_items WHERE user_id=? AND data_kind='user'").all(this.userId) as Row[];
    const missions = db.prepare("SELECT status FROM missions WHERE user_id=?").all(this.userId) as Row[];
    const memories = db.prepare("SELECT status FROM user_memory_profile WHERE user_id=?").all(this.userId) as Row[];
    const mentor = db.prepare("SELECT source_refs_json FROM mentor_analyses WHERE user_id=?").all(this.userId) as Row[];
    const sourceBoundMentor = mentor.filter((item) => { const value = parseJson<unknown[]>(item.source_refs_json, []); return Array.isArray(value) && value.length > 0; }).length;
    const closedMissions = missions.filter((item) => ["completed", "failed", "archived"].includes(String(item.status)));
    const activeMemories = memories.filter((item) => String(item.status) === "active").length;
    const mappedLogs = logs.map((item) => ({
      id: String(item.id), date: String(item.log_date), dailyLoopStatus: String(item.daily_loop_status) as "not_started" | "in_progress" | "reflected", missionStatus: String(item.mission_status) as "none" | "active" | "completed" | "mixed",
      missionCompletedCount: Number(item.mission_completed_count), evidenceAddedCount: Number(item.evidence_added_count), memoryConfirmedCount: Number(item.memory_confirmed_count), mentorCallCount: Number(item.mentor_call_count), feedbackCount: Number(item.feedback_count), createdAt: String(item.created_at), updatedAt: String(item.updated_at),
      realValidation: Number(item.day1_mode) === 1 ? this.mapRealValidation(item) : null,
    }));
    return {
      logs: mappedLogs,
      summary: { recordedDays: allLogs.length, firstDate: allLogs.length ? String(allLogs[0].log_date) : null, lastDate: allLogs.length ? String(allLogs.at(-1)?.log_date) : null, totalEvidenceAdded: allLogs.reduce((sum, item) => sum + Number(item.evidence_added_count), 0), totalMissionCompleted: allLogs.reduce((sum, item) => sum + Number(item.mission_completed_count), 0), totalMentorCalls: allLogs.reduce((sum, item) => sum + Number(item.mentor_call_count), 0), totalFeedback: allLogs.reduce((sum, item) => sum + Number(item.feedback_count), 0) },
      health: { loopConsistency: ratio(allLogs.filter((item) => String(item.daily_loop_status) !== "not_started").length, allLogs.length), evidenceQuality: ratio(evidence.filter((item) => String(item.verification_status) === "verified").length, evidence.length), missionCompletion: ratio(closedMissions.filter((item) => String(item.status) === "completed").length, closedMissions.length), memoryStability: ratio(activeMemories, memories.length), mentorValue: ratio(sourceBoundMentor, mentor.length) },
    };
  }

  execute(raw: unknown) {
    const input = betaValidationActionSchema.parse(raw);
    if (input.action === "capture") return this.capture(input);
    const logDate = input.logDate || day(new Date());
    this.assertDate(logDate);
    const logId = this.ensureLog(logDate);
    const existing = this.repository.db.prepare("SELECT event_type FROM beta_validation_events WHERE user_id=? AND client_request_id=?").get(this.userId, input.clientRequestId) as Row | undefined;
    if (existing) return { duplicate: true, logId, snapshot: this.snapshot() };
    if (input.action !== "start_day1") this.requireStarted(logId);
    const timestamp = new Date().toISOString();
    this.repository.db.transaction(() => {
      if (input.action === "start_day1") {
        this.repository.db.prepare("UPDATE beta_validation_log SET day1_mode=1,validation_stage=CASE WHEN validation_stage='legacy' THEN 'day_started' ELSE validation_stage END,started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND user_id=?").run(timestamp, timestamp, logId, this.userId);
        this.event(logId, "day1_started", { sessionId: logId, localDate: logDate }, input.clientRequestId, timestamp);
      } else if (input.action === "refresh_day1") {
        this.refreshFacts(logId, logDate, timestamp);
        this.event(logId, "facts_refreshed", this.currentReferencePayload(logId), input.clientRequestId, timestamp);
      } else if (input.action === "record_view") {
        const payload = this.recordView(logId, logDate, input.surface, timestamp);
        this.event(logId, `${input.surface}_viewed`, payload, input.clientRequestId, timestamp);
      } else if (input.action === "record_task_state") {
        const grounded = this.assertTaskState(logDate, input.state);
        const taskRefs = unique([input.taskRef, ...grounded.taskRefs]);
        const artifactRefs = unique(input.artifactRefs);
        const expectationRefs = unique([...grounded.evidenceExpectationRefs, ...input.evidenceExpectationRefs]);
        const taskType = input.taskType ?? grounded.taskType ?? "other";
        this.repository.db.prepare(`UPDATE beta_validation_log
          SET real_task_started=1,real_task_completion_state=?,actual_time_minutes=?,blocker_refs_json=?,validation_stage='execution',
          active_daily_plan_id=?,real_task_refs_json=?,real_task_type=?,task_artifact_refs_json=?,evidence_expectation_refs_json=?,updated_at=?
          WHERE id=? AND user_id=?`)
          .run(input.state, input.actualTimeMinutes ?? null, JSON.stringify(input.blockerRefs), grounded.planId, JSON.stringify(taskRefs), taskType, JSON.stringify(artifactRefs), JSON.stringify(expectationRefs), timestamp, logId, this.userId);
        this.event(logId, "task_state_reported", { state: input.state, taskType, taskRefCount: taskRefs.length, artifactRefCount: artifactRefs.length, evidenceExpectationRefCount: expectationRefs.length, actualTimeSupplied: input.actualTimeMinutes !== undefined && input.actualTimeMinutes !== null, blockerCount: input.blockerRefs.length }, input.clientRequestId, timestamp);
      } else if (input.action === "submit_owner_feedback") {
        const contextFeedback = { contextCorrectness: input.feedback.contextCorrectness, trust: input.feedback.trust, ownerNotesPresent: Boolean(input.feedback.ownerNotes) };
        const morningFeedback = { morningBriefUsefulness: input.feedback.morningBriefUsefulness, strategicAlignment: input.feedback.strategicAlignment, ownerNotesPresent: Boolean(input.feedback.ownerNotes) };
        this.repository.db.prepare(`UPDATE beta_validation_log
          SET owner_feedback_json=?,context_inspection_feedback_json=?,morning_brief_feedback_json=?,defects_json=?,blocker_refs_json=?,
          owner_feedback_submitted_at=?,validation_stage='feedback_recorded',updated_at=? WHERE id=? AND user_id=?`)
          .run(JSON.stringify(input.feedback), JSON.stringify(contextFeedback), JSON.stringify(morningFeedback), JSON.stringify(input.defects), JSON.stringify(input.blockerRefs), timestamp, timestamp, logId, this.userId);
        this.event(logId, "owner_feedback_submitted", { ratingsProvided: 8, defectCounts: this.defectCounts(input.defects), blockerCount: input.blockerRefs.length }, input.clientRequestId, timestamp);
      } else {
        this.assertCapabilityEvidence(logDate, input.capabilities);
        this.repository.db.prepare("UPDATE beta_validation_log SET confirmed_capabilities_json=?,owner_real_use_confirmed=1,real_use_confirmed_at=?,closed_at=?,validation_stage='closed',updated_at=? WHERE id=? AND user_id=?")
          .run(JSON.stringify([...new Set(input.capabilities)]), timestamp, timestamp, timestamp, logId, this.userId);
        this.event(logId, "real_use_confirmed", { capabilities: [...new Set(input.capabilities)] }, input.clientRequestId, timestamp);
      }
    })();
    if (input.action !== "refresh_day1" && input.action !== "start_day1") this.refreshFacts(logId, logDate, timestamp);
    return { duplicate: false, logId, snapshot: this.snapshot() };
  }

  capture(raw: unknown) {
    const input = betaValidationCaptureSchema.parse(raw);
    const logDate = input.logDate || day(new Date());
    this.assertDate(logDate);
    const existing = this.repository.db.prepare("SELECT id FROM beta_validation_log WHERE user_id=? AND log_date=?").get(this.userId, logDate) as { id: string } | undefined;
    const id = this.ensureLog(logDate);
    this.refreshAggregate(id, logDate);
    const record = this.repository.db.prepare("SELECT daily_loop_status,mission_status,mission_completed_count,evidence_added_count,memory_confirmed_count,mentor_call_count,feedback_count FROM beta_validation_log WHERE id=? AND user_id=?").get(id, this.userId) as Row;
    this.repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(randomUUID(), this.userId, "beta.validation_logged", "beta_validation_log", id, null, JSON.stringify({ logDate, ...record }), new Date().toISOString());
    return { logId: id, duplicate: Boolean(existing), snapshot: this.snapshot() };
  }

  private ensureLog(logDate: string) {
    const existing = this.repository.db.prepare("SELECT id FROM beta_validation_log WHERE user_id=? AND log_date=?").get(this.userId, logDate) as { id: string } | undefined;
    if (existing) { this.refreshAggregate(existing.id, logDate); return existing.id; }
    const id = randomUUID(), at = new Date().toISOString();
    this.repository.db.prepare("INSERT INTO beta_validation_log (id,user_id,log_date,daily_loop_status,mission_status,mission_completed_count,evidence_added_count,memory_confirmed_count,mentor_call_count,feedback_count,created_at,updated_at) VALUES (?,? ,?,'not_started','none',0,0,0,0,0,?,?)").run(id, this.userId, logDate, at, at);
    this.refreshAggregate(id, logDate);
    return id;
  }

  private refreshAggregate(id: string, logDate: string) {
    const db = this.repository.db;
    const daily = db.prepare("SELECT (SELECT count(*) FROM morning_briefs WHERE user_id=? AND brief_date=?) briefs,(SELECT count(*) FROM daily_plans WHERE user_id=? AND plan_date=?) plans,(SELECT count(*) FROM operating_reflections WHERE user_id=? AND reflection_date=?) reflections").get(this.userId, logDate, this.userId, logDate, this.userId, logDate) as Row;
    const dailyLoopStatus = Number(daily.reflections) ? "reflected" : Number(daily.briefs) + Number(daily.plans) ? "in_progress" : "not_started";
    const countOnDay = (sql: string, field: string) => (db.prepare(sql).all(this.userId) as Row[]).filter((item) => item[field] && day(String(item[field])) === logDate).length;
    const completed = countOnDay("SELECT completed_at FROM missions WHERE user_id=? AND status='completed'", "completed_at");
    const active = Number((db.prepare("SELECT count(*) count FROM missions WHERE user_id=? AND status='active'").get(this.userId) as Row).count);
    const missionStatus = active && completed ? "mixed" : active ? "active" : completed ? "completed" : "none";
    const values = [dailyLoopStatus, missionStatus, completed, countOnDay("SELECT captured_at FROM evidence_items WHERE user_id=? AND data_kind='user'", "captured_at"), countOnDay("SELECT approved_at FROM memory_candidates WHERE user_id=? AND status='approved'", "approved_at"), countOnDay("SELECT created_at FROM ai_usage_logs WHERE user_id=? AND purpose IN ('ai_mentor','genesis_mentor_deep')", "created_at"), countOnDay("SELECT created_at FROM beta_feedback WHERE user_id=?", "created_at"), new Date().toISOString(), id, this.userId];
    db.prepare("UPDATE beta_validation_log SET daily_loop_status=?,mission_status=?,mission_completed_count=?,evidence_added_count=?,memory_confirmed_count=?,mentor_call_count=?,feedback_count=?,updated_at=? WHERE id=? AND user_id=?").run(...values);
  }

  private refreshFacts(id: string, logDate: string, at: string) {
    const db = this.repository.db;
    const candidate = db.prepare("SELECT id,status FROM daily_plan_candidates WHERE user_id=? AND plan_date=? ORDER BY created_at DESC LIMIT 1").get(this.userId, logDate) as Row | undefined;
    const plan = db.prepare("SELECT id,source_candidate_id FROM daily_plans WHERE user_id=? AND plan_date=? AND status IN ('active','completed') ORDER BY updated_at DESC LIMIT 1").get(this.userId, logDate) as Row | undefined;
    const brief = db.prepare("SELECT id FROM morning_briefs WHERE user_id=? AND brief_date=? ORDER BY created_at DESC LIMIT 1").get(this.userId, logDate) as Row | undefined;
    const projections = this.activeProjectionIds(at);
    let decision = plan ? "approved" : candidate?.status === "approved" ? "approved" : candidate?.status === "rejected" ? "rejected" : "none";
    if (candidate && candidate.status === "candidate") {
      const review = db.prepare("SELECT event_type FROM daily_plan_owner_review_events WHERE user_id=? AND candidate_id=? ORDER BY event_sequence DESC LIMIT 1").get(this.userId, candidate.id) as Row | undefined;
      if (review) decision = String(review.event_type);
    }
    const reflection = db.prepare("SELECT id FROM operating_reflections WHERE user_id=? AND reflection_date=? ORDER BY created_at DESC LIMIT 1").get(this.userId, logDate) as Row | undefined;
    const followUp = reflection ? db.prepare("SELECT id FROM daily_operating_follow_up_candidate_sets WHERE user_id=? AND reflection_id=?").get(this.userId, reflection.id) as Row | undefined : undefined;
    const current = db.prepare("SELECT * FROM beta_validation_log WHERE id=? AND user_id=?").get(id, this.userId) as Row;
    const planGenerated = Boolean(candidate || plan);
    const reflected = Boolean(reflection);
    let stage = String(current.validation_stage);
    if (stage !== "closed" && stage !== "feedback_recorded") {
      if (reflected) stage = "evening";
      else if (Number(current.real_task_started)) stage = "execution";
      else if (planGenerated) stage = "plan_review";
      else if (Number(current.morning_brief_viewed)) stage = "morning";
      else stage = "day_started";
    }
    db.prepare(`UPDATE beta_validation_log
      SET approved_context_snapshot_ref=?,approved_context_projection_refs_json=?,morning_brief_id=?,daily_plan_generated=?,
      daily_plan_candidate_id=?,active_daily_plan_id=?,daily_plan_owner_decision=?,evening_reflection_submitted=?,
      operating_reflection_id=?,follow_up_candidate_created=?,reflection_candidate_set_id=?,daily_close_ref=?,validation_stage=?,updated_at=?
      WHERE id=? AND user_id=?`)
      .run(this.contextSnapshotRef(logDate, projections), JSON.stringify(projections), brief ? String(brief.id) : null, planGenerated ? 1 : 0, candidate ? String(candidate.id) : plan?.source_candidate_id ? String(plan.source_candidate_id) : null, plan ? String(plan.id) : null, decision, reflected ? 1 : 0, reflection ? String(reflection.id) : null, followUp ? 1 : 0, followUp ? String(followUp.id) : null, reflection ? `daily_close:${logDate}:${reflection.id}` : null, stage, at, id, this.userId);
    this.refreshAggregate(id, logDate);
  }

  private recordView(id: string, logDate: string, surface: "approved_context" | "morning_brief" | "daily_close", at: string) {
    if (surface === "approved_context") {
      const projections = this.activeProjectionIds(at);
      if (!projections.length) throw new Error("BETA_VALIDATION_APPROVED_CONTEXT_REQUIRED");
      this.repository.db.prepare("UPDATE beta_validation_log SET approved_context_viewed=1,approved_context_snapshot_ref=?,approved_context_projection_refs_json=?,updated_at=? WHERE id=? AND user_id=?").run(this.contextSnapshotRef(logDate, projections), JSON.stringify(projections), at, id, this.userId);
      return { projectionCount: projections.length };
    }
    if (surface === "morning_brief") {
      const brief = this.repository.db.prepare("SELECT id FROM morning_briefs WHERE user_id=? AND brief_date=? ORDER BY created_at DESC LIMIT 1").get(this.userId, logDate) as Row | undefined;
      if (!brief) throw new Error("BETA_VALIDATION_MORNING_BRIEF_REQUIRED");
      this.repository.db.prepare("UPDATE beta_validation_log SET morning_brief_viewed=1,morning_brief_id=?,validation_stage='morning',updated_at=? WHERE id=? AND user_id=?").run(String(brief.id), at, id, this.userId);
      return { morningBriefId: String(brief.id) };
    }
    const reflection = this.repository.db.prepare("SELECT id FROM operating_reflections WHERE user_id=? AND reflection_date=? ORDER BY created_at DESC LIMIT 1").get(this.userId, logDate) as Row | undefined;
    if (!reflection) throw new Error("BETA_VALIDATION_REFLECTION_REQUIRED");
    const followUp = this.repository.db.prepare("SELECT id FROM daily_operating_follow_up_candidate_sets WHERE user_id=? AND reflection_id=?").get(this.userId, reflection.id) as Row | undefined;
    const dailyCloseRef = `daily_close:${logDate}:${reflection.id}`;
    this.repository.db.prepare("UPDATE beta_validation_log SET daily_close_viewed=1,operating_reflection_id=?,reflection_candidate_set_id=?,daily_close_ref=?,updated_at=? WHERE id=? AND user_id=?").run(String(reflection.id), followUp ? String(followUp.id) : null, dailyCloseRef, at, id, this.userId);
    return { operatingReflectionId: String(reflection.id), dailyCloseRef };
  }

  private assertTaskState(logDate: string, state: string) {
    const plan = this.repository.db.prepare("SELECT id,plan_json FROM daily_plans WHERE user_id=? AND plan_date=? AND status IN ('active','completed') ORDER BY updated_at DESC LIMIT 1").get(this.userId, logDate) as Row | undefined;
    if (!plan) throw new Error("BETA_VALIDATION_APPROVED_PLAN_REQUIRED");
    const planPayload = parseJson<Record<string, unknown>>(plan.plan_json, {});
    const actions = Array.isArray(planPayload.actions) ? planPayload.actions as Array<Record<string, unknown>> : [];
    const completedBlocks = this.repository.db.prepare("SELECT block_id FROM daily_plan_block_events WHERE user_id=? AND plan_id=? AND event_type='completed' ORDER BY event_sequence DESC").all(this.userId, plan.id) as Row[];
    if (["completed", "partially_completed"].includes(state) && !completedBlocks.length) throw new Error("BETA_VALIDATION_COMPLETED_PLAN_BLOCK_REQUIRED");
    const completedIds = new Set(completedBlocks.map((item) => String(item.block_id)));
    const selected = actions.find((block) => completedIds.has(String(block.blockId))) ?? actions[0] ?? null;
    const blockId = selected?.blockId ? String(selected.blockId) : null;
    return {
      planId: String(plan.id),
      taskRefs: unique([`daily_plan:${plan.id}`, blockId ? `daily_plan_block:${blockId}` : null]),
      taskType: selected?.blockType ? String(selected.blockType) : null,
      evidenceExpectationRefs: unique([blockId && (selected?.evidenceExpectation || selected?.verification) ? `daily_plan_block:${blockId}:evidence_expectation` : null]),
    };
  }

  private assertCapabilityEvidence(logDate: string, capabilities: string[]) {
    const row = this.repository.db.prepare("SELECT * FROM beta_validation_log WHERE user_id=? AND log_date=?").get(this.userId, logDate) as Row;
    if (!row.owner_feedback_json) throw new Error("BETA_VALIDATION_OWNER_FEEDBACK_REQUIRED");
    const checks: Record<string, boolean> = {
      approved_context_inspection: Number(row.approved_context_viewed) === 1,
      morning_brief: Number(row.morning_brief_viewed) === 1 && Boolean(this.repository.db.prepare("SELECT 1 FROM morning_briefs WHERE user_id=? AND brief_date=?").get(this.userId, logDate)),
      daily_plan: Boolean(this.repository.db.prepare("SELECT 1 FROM daily_plans WHERE user_id=? AND plan_date=?").get(this.userId, logDate)),
      evening_reflection: Boolean(this.repository.db.prepare("SELECT 1 FROM operating_reflections WHERE user_id=? AND reflection_date=?").get(this.userId, logDate)),
      daily_close: Number(row.daily_close_viewed) === 1 && Boolean(row.daily_close_ref),
    };
    for (const capability of capabilities) if (!checks[capability]) throw new Error(`BETA_VALIDATION_CAPABILITY_NOT_USED:${capability}`);
  }

  private activeProjectionIds(at: string) {
    const rows = this.repository.db.prepare(`SELECT projection.id FROM approved_context_projections projection
      WHERE projection.user_id=? AND projection.context_purpose='daily_operation'
      AND NOT EXISTS (SELECT 1 FROM approved_context_projection_events event WHERE event.projection_id=projection.id AND event.event_type IN ('revoked','superseded'))
      AND (projection.expires_at IS NULL OR projection.expires_at>?)
      ORDER BY projection.created_at ASC`).all(this.userId, at) as Row[];
    return rows.map((row) => String(row.id));
  }

  private contextSnapshotRef(logDate: string, projectionIds: string[]) {
    return projectionIds.length ? `approved_context:${logDate}:${projectionIds.join("|")}` : null;
  }

  private currentReferencePayload(logId: string) {
    const row = this.repository.db.prepare("SELECT approved_context_projection_refs_json,morning_brief_id,daily_plan_candidate_id,active_daily_plan_id,operating_reflection_id,reflection_candidate_set_id,daily_close_ref FROM beta_validation_log WHERE id=? AND user_id=?").get(logId, this.userId) as Row | undefined;
    return row ? {
      approvedContextProjectionCount: parseJson<string[]>(row.approved_context_projection_refs_json, []).length,
      morningBriefPresent: Boolean(row.morning_brief_id),
      dailyPlanCandidatePresent: Boolean(row.daily_plan_candidate_id),
      activeDailyPlanPresent: Boolean(row.active_daily_plan_id),
      reflectionPresent: Boolean(row.operating_reflection_id),
      reflectionCandidateSetPresent: Boolean(row.reflection_candidate_set_id),
      dailyClosePresent: Boolean(row.daily_close_ref),
    } : {};
  }

  private requireStarted(id: string) {
    const row = this.repository.db.prepare("SELECT day1_mode FROM beta_validation_log WHERE id=? AND user_id=?").get(id, this.userId) as Row | undefined;
    if (!row || Number(row.day1_mode) !== 1) throw new Error("BETA_VALIDATION_DAY1_NOT_STARTED");
  }

  private assertDate(value: string) { if (value > day(new Date())) throw new Error("BETA_VALIDATION_FUTURE_DATE"); }
  private event(logId: string, eventType: string, payload: Record<string, unknown>, requestId: string, at: string) { this.repository.db.prepare("INSERT INTO beta_validation_events (id,user_id,validation_log_id,event_type,payload_json,actor,client_request_id,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), this.userId, logId, eventType, JSON.stringify(payload), this.userId, requestId, at); }
  private defectCounts(defects: Array<{ severity: string }>) { return defects.reduce<Record<string, number>>((result, item) => ({ ...result, [item.severity]: (result[item.severity] ?? 0) + 1 }), {}); }

  private reportStatus(row: Row) {
    const missing: string[] = [];
    if (!Number(row.approved_context_viewed)) missing.push("approved_context_inspection");
    if (!Number(row.morning_brief_viewed)) missing.push("morning_brief_view");
    if (!row.active_daily_plan_id || String(row.daily_plan_owner_decision) !== "approved") missing.push("owner_confirmed_daily_plan");
    if (!Number(row.real_task_started) || String(row.real_task_completion_state) === "not_started") missing.push("real_task_state");
    if (!Number(row.evening_reflection_submitted) || !row.operating_reflection_id) missing.push("evening_reflection");
    if (!Number(row.daily_close_viewed) || !row.daily_close_ref) missing.push("daily_close_view");
    if (!row.owner_feedback_json) missing.push("owner_ratings");
    if (!Number(row.owner_real_use_confirmed)) missing.push("capability_scoped_real_use_confirmation");
    return { targetPath: DAY1_REPORT_PATH, eligible: missing.length === 0, missingStages: missing };
  }

  private mapRealValidation(row: Row): RealValidationRecord {
    return {
      active: true,
      sessionId: String(row.id),
      localDate: String(row.log_date),
      stage: String(row.validation_stage),
      references: {
        approvedContextSnapshotRef: row.approved_context_snapshot_ref ? String(row.approved_context_snapshot_ref) : null,
        approvedContextProjectionIds: parseJson(row.approved_context_projection_refs_json, []),
        morningBriefId: row.morning_brief_id ? String(row.morning_brief_id) : null,
        dailyPlanCandidateId: row.daily_plan_candidate_id ? String(row.daily_plan_candidate_id) : null,
        activeDailyPlanId: row.active_daily_plan_id ? String(row.active_daily_plan_id) : null,
        realTaskRefs: parseJson(row.real_task_refs_json, []),
        taskType: row.real_task_type ? String(row.real_task_type) : null,
        artifactRefs: parseJson(row.task_artifact_refs_json, []),
        evidenceExpectationRefs: parseJson(row.evidence_expectation_refs_json, []),
        operatingReflectionId: row.operating_reflection_id ? String(row.operating_reflection_id) : null,
        reflectionCandidateSetId: row.reflection_candidate_set_id ? String(row.reflection_candidate_set_id) : null,
        dailyCloseRef: row.daily_close_ref ? String(row.daily_close_ref) : null,
      },
      facts: { dailyPlanGenerated: Number(row.daily_plan_generated) === 1, dailyPlanOwnerDecision: String(row.daily_plan_owner_decision), eveningReflectionSubmitted: Number(row.evening_reflection_submitted) === 1, followUpCandidateCreated: Number(row.follow_up_candidate_created) === 1 },
      ownerActions: { approvedContextViewed: Number(row.approved_context_viewed) === 1, morningBriefViewed: Number(row.morning_brief_viewed) === 1, realTaskStarted: Number(row.real_task_started) === 1, realTaskCompletionState: String(row.real_task_completion_state), actualTimeMinutes: row.actual_time_minutes === null ? null : Number(row.actual_time_minutes), dailyCloseViewed: Number(row.daily_close_viewed) === 1 },
      feedback: row.owner_feedback_json ? parseJson<Record<string, unknown>>(row.owner_feedback_json, {}) : null,
      defects: parseJson(row.defects_json, []),
      blockerRefs: parseJson(row.blocker_refs_json, []),
      confirmedCapabilities: parseJson(row.confirmed_capabilities_json, []),
      ownerRealUseConfirmed: Number(row.owner_real_use_confirmed) === 1,
      report: this.reportStatus(row),
      startedAt: row.started_at ? String(row.started_at) : null,
      feedbackSubmittedAt: row.owner_feedback_submitted_at ? String(row.owner_feedback_submitted_at) : null,
      realUseConfirmedAt: row.real_use_confirmed_at ? String(row.real_use_confirmed_at) : null,
      closedAt: row.closed_at ? String(row.closed_at) : null,
    };
  }
}
