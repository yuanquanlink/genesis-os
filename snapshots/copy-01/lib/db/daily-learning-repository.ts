import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import type {
  DailyLearningReport,
  DailyLearningLoopSnapshot,
  EveningReflectionInput,
  MorningBrief,
} from "@/lib/domain/daily-learning-loop";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);
const parseJson = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};
const mapped = (record: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value,
  ])) as Record<string, unknown>;

export type DailyAIRecordMeta = {
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
};

export type DailyPlanningState = {
  goal: Record<string, unknown>;
  phase: Record<string, unknown> | null;
  mission: Record<string, unknown> | null;
  previousMission: Record<string, unknown> | null;
  dueReviews: Array<Record<string, unknown>>;
  weakestConcept: Record<string, unknown> | null;
  challenge: Record<string, unknown> | null;
  challengeFailedCriteria: string[];
  estimates: Array<Record<string, unknown>>;
  latestAdjustment: Record<string, unknown> | null;
  recentCompletionRate: number;
  todayEvidence: Array<Record<string, unknown>>;
  pendingCandidates: Array<Record<string, unknown>>;
  todayAbilityChanges: Array<Record<string, unknown>>;
  todayTimeline: Array<Record<string, unknown>>;
  targetAbilityNode: Record<string, unknown> | null;
  masteryCertification: Record<string, unknown> | null;
  masteryFailedGates: string[];
  masteryWaitingGate: Record<string, unknown> | null;
  sourceRefs: string[];
};

export class DailyLearningRepository {
  constructor(private readonly repository: ProfileRepository) {}

  private get db() { return this.repository.db; }

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)",
    ).run(randomUUID(), USER_ID, action, entityType, entityId, json(after), now());
  }

  private localDate(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  }

  planningState(goalId: string, date: string): DailyPlanningState {
    const goal = this.db.prepare(
      "SELECT * FROM learning_goals WHERE id=? AND user_id=? AND deleted_at IS NULL",
    ).get(goalId, USER_ID) as Record<string, unknown> | undefined;
    if (!goal) throw new Error("LEARNING_GOAL_NOT_FOUND");
    const phase = this.db.prepare(
      "SELECT * FROM learning_curriculum_phases WHERE goal_id=? AND status='active' ORDER BY phase_index LIMIT 1",
    ).get(goalId) as Record<string, unknown> | undefined;
    const mission = this.db.prepare(
      "SELECT * FROM daily_learning_missions WHERE goal_id=? AND mission_date=?",
    ).get(goalId, date) as Record<string, unknown> | undefined;
    const previousMission = this.db.prepare(
      `SELECT mission.*,result.completion_status result_status,result.assessment_score,
              json_extract(result.assessment_json,'$.misconception') misconception
       FROM daily_learning_missions mission
       LEFT JOIN learning_agent_results result ON result.mission_id=mission.id
       WHERE mission.goal_id=? AND mission.mission_date<?
       ORDER BY mission.mission_date DESC LIMIT 1`,
    ).get(goalId, date) as Record<string, unknown> | undefined;
    const reviews = this.db.prepare(
      `SELECT review.*,node.title node_title,node.mastery,node.learning_state
       FROM review_schedule review JOIN knowledge_nodes node ON node.id=review.node_id
       WHERE review.goal_id=? AND review.status='scheduled' ORDER BY review.due_at`,
    ).all(goalId) as Array<Record<string, unknown>>;
    const dueReviews = reviews.filter((review) => this.localDate(review.due_at) <= date).slice(0, 3);
    const weakestConcept = this.db.prepare(
      `SELECT * FROM knowledge_nodes WHERE goal_id=? AND learning_state<>'locked'
       ORDER BY mastery ASC,evidence_count ASC,position ASC LIMIT 1`,
    ).get(goalId) as Record<string, unknown> | undefined;
    const challenge = this.db.prepare(
      `SELECT challenge.*,result.status result_status,result.machine_score,result.code_review_score,
              result.defense_score,result.independence_score
       FROM project_challenges challenge
       LEFT JOIN project_challenge_results result ON result.challenge_id=challenge.id
       WHERE challenge.goal_id=? AND challenge.status<>'archived'
       ORDER BY CASE challenge.status WHEN 'needs_work' THEN 0 WHEN 'active' THEN 1 WHEN 'submitted' THEN 2 WHEN 'defense' THEN 3 ELSE 4 END,
                challenge.updated_at DESC LIMIT 1`,
    ).get(goalId) as Record<string, unknown> | undefined;
    const latestVerification = challenge ? this.db.prepare(
      `SELECT failed_criteria_json FROM project_verification_runs
       WHERE submission_id IN (SELECT id FROM project_submissions WHERE challenge_id=?)
       ORDER BY created_at DESC LIMIT 1`,
    ).get(challenge.id) as { failed_criteria_json?: string } | undefined : undefined;
    const estimates = this.db.prepare(
      "SELECT * FROM learning_time_estimates WHERE goal_id=? ORDER BY created_at DESC LIMIT 2",
    ).all(goalId) as Array<Record<string, unknown>>;
    const latestAdjustment = this.db.prepare(
      "SELECT * FROM curriculum_adjustments WHERE goal_id=? ORDER BY created_at DESC LIMIT 1",
    ).get(goalId) as Record<string, unknown> | undefined;
    const recentMissions = this.db.prepare(
      "SELECT id,status,mission_date FROM daily_learning_missions WHERE goal_id=? AND mission_date<=? ORDER BY mission_date DESC LIMIT 7",
    ).all(goalId, date) as Array<Record<string, unknown>>;
    const recentCompletionRate = recentMissions.length
      ? recentMissions.filter((item) => String(item.status) === "completed").length / recentMissions.length
      : 0;
    const todayEvidence = (this.db.prepare(
      "SELECT * FROM evidence_items WHERE user_id=? AND data_kind='user' ORDER BY captured_at DESC LIMIT 100",
    ).all(USER_ID) as Array<Record<string, unknown>>).filter((item) => this.localDate(item.captured_at) === date).slice(0, 12);
    const pendingCandidates = (this.db.prepare(
      "SELECT * FROM growth_evidence_candidates WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 100",
    ).all(USER_ID) as Array<Record<string, unknown>>).filter((item) => this.localDate(item.created_at) === date).slice(0, 10);
    const todayAbilityChanges = (this.db.prepare(
      `SELECT change.*,node.name ability_name FROM ability_change_snapshots change
       JOIN growth_nodes node ON node.id=change.ability_node_id
       WHERE change.user_id=? ORDER BY change.approved_at DESC LIMIT 100`,
    ).all(USER_ID) as Array<Record<string, unknown>>).filter((item) => this.localDate(item.approved_at) === date).slice(0, 10);
    const todayTimeline = (this.db.prepare(
      `SELECT id,title,summary,event_type,occurred_at FROM life_events
       WHERE user_id=? AND data_kind='user' AND is_primary=1 AND hidden_at IS NULL AND deleted_at IS NULL
       ORDER BY occurred_at DESC LIMIT 100`,
    ).all(USER_ID) as Array<Record<string, unknown>>).filter((item) => this.localDate(item.occurred_at) === date).slice(0, 12);
    const abilityName = String(goal.target_ability || goal.title || "").trim().toLocaleLowerCase("zh-CN");
    const abilityNodes = this.db.prepare(
      "SELECT * FROM growth_nodes WHERE user_id=? AND node_type='ability' AND status='confirmed' ORDER BY updated_at DESC LIMIT 100",
    ).all(USER_ID) as Array<Record<string, unknown>>;
    const targetAbilityNode = abilityNodes.find((node) => {
      const name = String(node.name || "").trim().toLocaleLowerCase("zh-CN");
      return name === abilityName || (name.length >= 2 && abilityName.includes(name)) || (abilityName.length >= 2 && name.includes(abilityName));
    });
    const masteryCertification = this.db.prepare(
      `SELECT certification.*,pilot.title pilot_title,decision.overall_status decision_status,decision.aggregate_score
       FROM mastery_certifications certification
       JOIN mastery_pilots pilot ON pilot.id=certification.pilot_id
       LEFT JOIN mastery_decisions decision ON decision.id=certification.latest_decision_id
       WHERE certification.goal_id=? AND certification.user_id=?`,
    ).get(goalId, USER_ID) as Record<string, unknown> | undefined;
    const masteryDecision = masteryCertification?.latest_decision_id ? this.db.prepare(
      "SELECT failed_gates_json FROM mastery_decisions WHERE id=?",
    ).get(masteryCertification.latest_decision_id) as { failed_gates_json?: string } | undefined : undefined;
    const masteryFailedGates = parseJson<string[]>(masteryDecision?.failed_gates_json, []);
    const masteryWaitingGate = masteryCertification ? this.db.prepare(
      `SELECT gate_type,status,next_retry_at,failure_reason FROM mastery_gate_attempts
       WHERE certification_id=? AND status='waiting' ORDER BY evaluated_at DESC LIMIT 1`,
    ).get(masteryCertification.id) as Record<string, unknown> | undefined : undefined;
    const sourceRefs = [
      `GOAL:${goalId}`,
      phase ? `PHASE:${String(phase.id)}` : null,
      mission ? `MISSION:${String(mission.id)}` : null,
      previousMission ? `MISSION:${String(previousMission.id)}` : null,
      ...dueReviews.map((item) => `REVIEW:${String(item.id)}`),
      weakestConcept ? `NODE:${String(weakestConcept.id)}` : null,
      challenge ? `CHALLENGE:${String(challenge.id)}` : null,
      ...todayEvidence.map((item) => `EV:${String(item.id)}`),
      ...pendingCandidates.map((item) => `CANDIDATE:${String(item.id)}`),
      ...todayAbilityChanges.map((item) => `ABILITY_CHANGE:${String(item.id)}`),
      ...todayTimeline.map((item) => `TIMELINE:${String(item.id)}`),
      latestAdjustment ? `ADJUSTMENT:${String(latestAdjustment.id)}` : null,
      targetAbilityNode ? `GG:${String(targetAbilityNode.id)}` : null,
      masteryCertification ? `MASTERY:${String(masteryCertification.id)}` : null,
      masteryCertification?.latest_decision_id ? `MASTERY_DECISION:${String(masteryCertification.latest_decision_id)}` : null,
    ].filter((item): item is string => Boolean(item));
    return {
      goal: mapped(goal),
      phase: phase ? mapped(phase) : null,
      mission: mission ? mapped(mission) : null,
      previousMission: previousMission ? mapped(previousMission) : null,
      dueReviews: dueReviews.map(mapped),
      weakestConcept: weakestConcept ? mapped(weakestConcept) : null,
      challenge: challenge ? mapped(challenge) : null,
      challengeFailedCriteria: parseJson(latestVerification?.failed_criteria_json, []),
      estimates: estimates.map(mapped),
      latestAdjustment: latestAdjustment ? Object.assign(mapped(latestAdjustment), {
        evidence: parseJson(latestAdjustment.evidence_json, {}),
      }) : null,
      recentCompletionRate,
      todayEvidence: todayEvidence.map(mapped),
      pendingCandidates: pendingCandidates.map(mapped),
      todayAbilityChanges: todayAbilityChanges.map(mapped),
      todayTimeline: todayTimeline.map(mapped),
      targetAbilityNode: targetAbilityNode ? mapped(targetAbilityNode) : null,
      masteryCertification: masteryCertification ? mapped(masteryCertification) : null,
      masteryFailedGates,
      masteryWaitingGate: masteryWaitingGate ? mapped(masteryWaitingGate) : null,
      sourceRefs: [...new Set(sourceRefs)],
    };
  }

  brief(goalId: string, briefDate: string): Record<string, unknown> | null {
    const row = this.db.prepare(
      "SELECT * FROM daily_learning_briefs WHERE user_id=? AND goal_id=? AND brief_date=?",
    ).get(USER_ID, goalId, briefDate) as Record<string, unknown> | undefined;
    return row ? this.mapBrief(row) : null;
  }

  saveBrief(goalId: string, briefDate: string, brief: MorningBrief): Record<string, unknown> {
    const existing = this.brief(goalId, briefDate);
    if (existing) {
      const comparable = (value: Record<string, unknown>) => json({
        currentGoal: value.currentGoal, currentPhase: value.currentPhase,
        primaryTask: value.primaryTask, whyToday: value.whyToday,
        previousGap: value.previousGap, reviewTasks: value.reviewTasks,
        engineeringTask: value.engineeringTask, weakestConcept: value.weakestConcept,
        challengeGap: value.challengeGap, estimateChange: value.estimateChange,
        largestRisk: value.largestRisk, estimatedMinutes: value.estimatedMinutes,
        sourceRefs: value.sourceRefs, confidence: value.confidence,
      });
      if (comparable(existing) === comparable(brief as unknown as Record<string, unknown>))
        return { ...existing, duplicate: true };
      this.db.prepare(
        `UPDATE daily_learning_briefs SET current_goal=?,current_phase=?,primary_task=?,why_today=?,previous_gap=?,review_tasks_json=?,engineering_task=?,weakest_concept=?,challenge_gap=?,estimate_change=?,largest_risk=?,estimated_minutes=?,source_refs_json=?,confidence=?,updated_at=? WHERE id=?`,
      ).run(brief.currentGoal, brief.currentPhase, brief.primaryTask, brief.whyToday, brief.previousGap, json(brief.reviewTasks), brief.engineeringTask, brief.weakestConcept, brief.challengeGap, brief.estimateChange, brief.largestRisk, brief.estimatedMinutes, json(brief.sourceRefs), brief.confidence, now(), existing.id);
      this.audit("daily_learning.morning_brief_refreshed", "daily_learning_brief", String(existing.id), { goalId, briefDate, sourceRefs: brief.sourceRefs });
      return { ...this.brief(goalId, briefDate), duplicate: false, refreshed: true };
    }
    const id = randomUUID();
    const timestamp = now();
    this.db.prepare(
      `INSERT INTO daily_learning_briefs
       (id,user_id,goal_id,brief_date,current_goal,current_phase,primary_task,why_today,previous_gap,review_tasks_json,engineering_task,weakest_concept,challenge_gap,estimate_change,largest_risk,estimated_minutes,source_refs_json,confidence,provider,model,model_mode,prompt_version,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'deterministic-morning-brief-v1','demo','morning-brief-v1',?,?)`,
    ).run(id, USER_ID, goalId, briefDate, brief.currentGoal, brief.currentPhase, brief.primaryTask, brief.whyToday, brief.previousGap, json(brief.reviewTasks), brief.engineeringTask, brief.weakestConcept, brief.challengeGap, brief.estimateChange, brief.largestRisk, brief.estimatedMinutes, json(brief.sourceRefs), brief.confidence, "local", timestamp, timestamp);
    this.audit("daily_learning.morning_brief_created", "daily_learning_brief", id, { goalId, briefDate, sourceRefs: brief.sourceRefs });
    return { ...this.brief(goalId, briefDate), duplicate: false };
  }

  private mapBrief(row: Record<string, unknown>): Record<string, unknown> {
    return { ...mapped(row), reviewTasks: parseJson<string[]>(row.review_tasks_json, []), sourceRefs: parseJson<string[]>(row.source_refs_json, []) };
  }

  reflectionByRequest(clientRequestId: string): Record<string, unknown> | null {
    const row = this.db.prepare("SELECT * FROM evening_reflections WHERE client_request_id=?").get(clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.mapReflection(row) : null;
  }

  reflection(goalId: string, reflectionDate: string): Record<string, unknown> | null {
    const row = this.db.prepare(
      "SELECT * FROM evening_reflections WHERE user_id=? AND goal_id=? AND reflection_date=?",
    ).get(USER_ID, goalId, reflectionDate) as Record<string, unknown> | undefined;
    return row ? this.mapReflection(row) : null;
  }

  saveReflection(input: EveningReflectionInput, reflectionDate: string, sourceRefs: string[]): Record<string, unknown> {
    const existing = this.reflectionByRequest(input.clientRequestId) || this.reflection(input.goalId, reflectionDate);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    this.db.prepare(
      `INSERT INTO evening_reflections
       (id,user_id,goal_id,reflection_date,client_request_id,actual_minutes,completed_text,stuck_text,biggest_gain,unfinished_text,unfinished_reason,tomorrow_available_minutes,source_refs_json,strategy_alignment,strategy_adjustment,strategy_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, USER_ID, input.goalId, reflectionDate, input.clientRequestId, input.actualMinutes, input.completed, input.stuck, input.biggestGain, input.unfinished, input.unfinishedReason, input.tomorrowAvailableMinutes, json(sourceRefs), input.strategyAlignment, input.strategyAdjustment, this.approvedStrategyId(), timestamp, timestamp);
    this.audit("daily_learning.evening_reflection_saved", "evening_reflection", id, { goalId: input.goalId, reflectionDate, actualMinutes: input.actualMinutes });
    return { ...this.reflection(input.goalId, reflectionDate), duplicate: false };
  }

  linkTimelineEntry(reflectionId: string, entryId: string) {
    this.db.prepare("UPDATE evening_reflections SET timeline_entry_id=?,updated_at=? WHERE id=? AND timeline_entry_id IS NULL").run(entryId, now(), reflectionId);
  }

  private mapReflection(row: Record<string, unknown>): Record<string, unknown> {
    return { ...mapped(row), sourceRefs: parseJson<string[]>(row.source_refs_json, []) };
  }

  private approvedStrategyId() {
    const row = this.db.prepare("SELECT strategy.id FROM growth_strategies strategy JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id WHERE strategy.user_id=? AND candidate.status='approved' ORDER BY strategy.created_at DESC LIMIT 1").get(USER_ID) as { id: string } | undefined;
    return row?.id || null;
  }

  report(goalId: string, reportDate: string): Record<string, unknown> | null {
    const row = this.db.prepare(
      "SELECT * FROM daily_learning_reports WHERE user_id=? AND goal_id=? AND report_date=?",
    ).get(USER_ID, goalId, reportDate) as Record<string, unknown> | undefined;
    return row ? this.mapReport(row) : null;
  }

  saveReport(goalId: string, reflectionId: string, reportDate: string, report: DailyLearningReport, meta: DailyAIRecordMeta): Record<string, unknown> {
    const existing = this.report(goalId, reportDate);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    this.db.prepare(
      `INSERT INTO daily_learning_reports
       (id,user_id,goal_id,reflection_id,report_date,facts_json,learning_quality,new_evidence_json,ability_change_candidates_json,largest_problem,alternative_explanation,fde_relationship,keep_doing,stop_doing,tomorrow_focus,tomorrow_actions_json,thinking_question,source_refs_json,confidence,provider,model,model_mode,prompt_version,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, USER_ID, goalId, reflectionId, reportDate, json(report.facts), report.learningQuality, json(report.newEvidence), json(report.abilityChangeCandidates), report.largestProblem, report.alternativeExplanation, report.fdeRelationship, report.keepDoing, report.stopDoing, report.tomorrowFocus, json(report.tomorrowActions), report.thinkingQuestion, json(report.sourceRefs), report.confidence, meta.provider, meta.model, meta.modelMode, meta.promptVersion, timestamp, timestamp);
    this.audit("daily_learning.report_created", "daily_learning_report", id, { goalId, reportDate, provider: meta.provider, sourceRefs: report.sourceRefs });
    return { ...this.report(goalId, reportDate), duplicate: false };
  }

  private mapReport(row: Record<string, unknown>): Record<string, unknown> {
    return {
      ...mapped(row),
      facts: parseJson<unknown[]>(row.facts_json, []),
      newEvidence: parseJson<unknown[]>(row.new_evidence_json, []),
      abilityChangeCandidates: parseJson<unknown[]>(row.ability_change_candidates_json, []),
      tomorrowActions: parseJson<string[]>(row.tomorrow_actions_json, []),
      sourceRefs: parseJson<string[]>(row.source_refs_json, []),
    };
  }

  nextPlan(goalId: string, planDate: string): Record<string, unknown> | null {
    const row = this.db.prepare(
      "SELECT * FROM daily_next_plans WHERE user_id=? AND goal_id=? AND plan_date=?",
    ).get(USER_ID, goalId, planDate) as Record<string, unknown> | undefined;
    return row ? this.mapPlan(row) : null;
  }

  saveNextPlan(input: {
    goalId: string; reportId: string; planDate: string; primaryFocus: string;
    availableMinutes: number; actions: string[]; reviewTaskIds: string[];
    challengeIds: string[]; completionRate: number; rationale: string;
    sourceRefs: string[]; confidence: number;
  }): Record<string, unknown> {
    const existing = this.nextPlan(input.goalId, input.planDate);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    this.db.prepare(
      `INSERT INTO daily_next_plans
       (id,user_id,goal_id,report_id,plan_date,primary_focus,available_minutes,actions_json,review_task_ids_json,challenge_ids_json,completion_rate,rationale,source_refs_json,confidence,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, USER_ID, input.goalId, input.reportId, input.planDate, input.primaryFocus, input.availableMinutes, json(input.actions), json(input.reviewTaskIds), json(input.challengeIds), input.completionRate, input.rationale, json(input.sourceRefs), input.confidence, timestamp, timestamp);
    this.audit("daily_learning.next_plan_created", "daily_next_plan", id, { goalId: input.goalId, planDate: input.planDate, completionRate: input.completionRate });
    return { ...this.nextPlan(input.goalId, input.planDate), duplicate: false };
  }

  private mapPlan(row: Record<string, unknown>): Record<string, unknown> {
    return {
      ...mapped(row),
      actions: parseJson<string[]>(row.actions_json, []),
      reviewTaskIds: parseJson<string[]>(row.review_task_ids_json, []),
      challengeIds: parseJson<string[]>(row.challenge_ids_json, []),
      sourceRefs: parseJson<string[]>(row.source_refs_json, []),
    };
  }

  snapshot(goalId?: string): DailyLearningLoopSnapshot {
    const where = goalId ? " AND goal_id=?" : "";
    const args = goalId ? [USER_ID, goalId] : [USER_ID];
    const briefs = (this.db.prepare(`SELECT * FROM daily_learning_briefs WHERE user_id=?${where} ORDER BY brief_date DESC`).all(...args) as Array<Record<string, unknown>>).map((row) => this.mapBrief(row));
    const reflections = (this.db.prepare(`SELECT * FROM evening_reflections WHERE user_id=?${where} ORDER BY reflection_date DESC`).all(...args) as Array<Record<string, unknown>>).map((row) => this.mapReflection(row));
    const reports = (this.db.prepare(`SELECT * FROM daily_learning_reports WHERE user_id=?${where} ORDER BY report_date DESC`).all(...args) as Array<Record<string, unknown>>).map((row) => this.mapReport(row));
    const plans = (this.db.prepare(`SELECT * FROM daily_next_plans WHERE user_id=?${where} ORDER BY plan_date DESC`).all(...args) as Array<Record<string, unknown>>).map((row) => this.mapPlan(row));
    return { briefs, reflections, reports, plans } as unknown as DailyLearningLoopSnapshot;
  }
}
