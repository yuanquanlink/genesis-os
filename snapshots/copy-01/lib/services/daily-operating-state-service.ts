import { dailyFollowUpCandidateSchema, dailyPlanSchema, type DailyPlan } from "@/lib/domain/personal-operating";
import { ApprovedContextReadService } from "@/lib/services/approved-context-read-service";
import type { ProfileRepository } from "@/lib/db/repository";

const DEFAULT_OWNER_ID = "genesis-owner";
type Row = Record<string, unknown>;

const parse = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value ?? "")) as T; } catch { return fallback; }
};

const text = (value: unknown) => String(value ?? "").trim();
const strings = (value: unknown) => {
  const parsed = parse<unknown[]>(value, []);
  return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
};

export function normalizeDailyPlan(raw: unknown): DailyPlan {
  const parsed = dailyPlanSchema.parse(raw);
  return {
    ...parsed,
    actions: parsed.actions.map((action, index) => ({
      ...action,
      blockId: action.blockId || `legacy-${index + 1}`,
    })),
  };
}

export class DailyOperatingStateService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly userId = DEFAULT_OWNER_ID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  day(value = this.clock()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  }

  private timeBudget() {
    const row = this.repository.db.prepare("SELECT * FROM daily_operating_preferences WHERE user_id=?").get(this.userId) as Row | undefined;
    if (!row) return null;
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: text(row.timezone) || "Asia/Shanghai",
      weekday: "short",
    }).format(this.clock());
    const weekend = weekday === "Sat" || weekday === "Sun";
    const availableMinutes = Number(weekend ? row.weekend_minutes : row.weekday_minutes);
    const targetUtilization = Number(row.target_utilization);
    return {
      availableMinutes,
      plannedMinutes: Math.floor(availableMinutes * targetUtilization),
      bufferMinutes: availableMinutes - Math.floor(availableMinutes * targetUtilization),
      targetUtilization,
      weeklyMaximumMinutes: Number(row.weekly_maximum_minutes),
      source: text(row.source) as "owner_pilot" | "owner_configured",
      timezone: text(row.timezone),
      dayType: weekend ? "weekend" as const : "weekday" as const,
    };
  }

  private planState(planRow: Row | undefined) {
    if (!planRow) return null;
    const plan = normalizeDailyPlan(parse(planRow.plan_json, {}));
    const events = this.repository.db.prepare(
      "SELECT * FROM daily_plan_block_events WHERE plan_id=? AND user_id=? ORDER BY event_sequence DESC",
    ).all(planRow.id, this.userId) as Row[];
    const latest = new Map<string, Row>();
    for (const event of events) if (!latest.has(text(event.block_id))) latest.set(text(event.block_id), event);
    const blocks = plan.actions.map((block) => {
      const event = latest.get(block.blockId || "");
      return {
        ...block,
        completionStatus: event?.event_type === "completed" ? "completed" as const : "pending" as const,
        actualMinutes: event?.event_type === "completed" && event.actual_minutes !== null ? Number(event.actual_minutes) : null,
        completionNote: event?.event_type === "completed" ? text(event.note) : "",
        lastEventAt: event ? text(event.created_at) : null,
      };
    });
    return {
      id: text(planRow.id),
      date: text(planRow.plan_date),
      status: text(planRow.status),
      sourceCandidateId: text(planRow.source_candidate_id),
      energy: Number(planRow.energy),
      plan,
      blocks,
      completedBlocks: blocks.filter((block) => block.completionStatus === "completed").length,
      totalBlocks: blocks.filter((block) => block.blockType !== "buffer").length,
      createdAt: text(planRow.created_at),
    };
  }

  read() {
    const db = this.repository.db;
    const date = this.day();
    const approvedContext = new ApprovedContextReadService(this.repository, this.userId, this.clock).read("daily_operation");
    const projection = (domain: string) => approvedContext.items.find((item) => item.sourceDomain === domain) ?? null;
    const strategyProjection = projection("strategy");
    const missionProjection = projection("mission");
    const goalProjection = projection("goal");
    const planProjection = projection("daily_plan");

    const activeMission = db.prepare(`SELECT id,title,description,strategy_id,priority,deadline,evidence_requirement,daily_tasks_json,status,updated_at
      FROM missions WHERE user_id=? AND status='active'
      ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,deadline LIMIT 1`).get(this.userId) as Row | undefined;
    const learningGoal = db.prepare(`SELECT * FROM learning_goals WHERE user_id=? AND data_kind='user' AND status='active' AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 1`).get(this.userId) as Row | undefined;
    const goalId = learningGoal ? text(learningGoal.id) : null;
    const learningMission = goalId ? db.prepare("SELECT * FROM daily_learning_missions WHERE goal_id=? AND mission_date=? ORDER BY updated_at DESC LIMIT 1").get(goalId, date) as Row | undefined : undefined;
    const activeStage = goalId ? db.prepare("SELECT * FROM learning_curriculum_phases WHERE goal_id=? AND status='active' ORDER BY phase_index LIMIT 1").get(goalId) as Row | undefined : undefined;
    const weakConceptRows = goalId ? db.prepare(`SELECT id,title,mastery,mastery_confidence,status FROM knowledge_nodes
      WHERE goal_id=? AND (status!='mastered' OR mastery<0.8) ORDER BY mastery ASC,position LIMIT 5`).all(goalId) as Row[] : [];
    const dueReviewRows = goalId ? db.prepare(`SELECT schedule.id,schedule.node_id,schedule.due_at,schedule.reason,node.title
      FROM review_schedule schedule JOIN knowledge_nodes node ON node.id=schedule.node_id
      WHERE schedule.goal_id=? AND schedule.status='scheduled' AND schedule.due_at<=? ORDER BY schedule.due_at LIMIT 6`).all(goalId, `${date}T23:59:59.999Z`) as Row[] : [];
    const masteryGapRows = goalId ? db.prepare(`SELECT attempt.gate_type,attempt.status,attempt.failure_reason,attempt.next_retry_at,attempt.score_optional
      FROM mastery_gate_attempts attempt JOIN mastery_certifications certification ON certification.id=attempt.certification_id
      WHERE certification.user_id=? AND certification.goal_id=? AND attempt.status IN ('failed','blocked','waiting')
        AND attempt.attempt_number=(SELECT MAX(latest.attempt_number) FROM mastery_gate_attempts latest WHERE latest.certification_id=attempt.certification_id AND latest.gate_type=attempt.gate_type)
      ORDER BY attempt.evaluated_at DESC LIMIT 8`).all(this.userId, goalId) as Row[] : [];
    const remediationRows = goalId ? db.prepare(`SELECT plan.id,plan.gate_type,plan.diagnosis,plan.reason,plan.target_concepts_json,plan.target_exercises_json,plan.retry_rules_json
      FROM mastery_remediation_plans plan JOIN mastery_certifications certification ON certification.id=plan.certification_id
      WHERE certification.user_id=? AND certification.goal_id=? AND plan.status='active' ORDER BY plan.created_at DESC LIMIT 6`).all(this.userId, goalId) as Row[] : [];
    const project = goalId ? db.prepare(`SELECT id,challenge_title,status,deadline,requirements_json,acceptance_criteria_json,required_tests_json
      FROM project_challenges WHERE user_id=? AND goal_id=? AND status IN ('active','submitted','verifying','defense','needs_work')
      ORDER BY updated_at DESC LIMIT 1`).get(this.userId, goalId) as Row | undefined : undefined;
    const estimate = goalId ? db.prepare(`SELECT realistic_minutes,estimated_min_hours,estimated_max_hours,actual_hours_so_far,calibration_status,confidence,weekly_capacity_minutes,target_utilization,created_at
      FROM learning_time_estimates WHERE goal_id=? ORDER BY created_at DESC LIMIT 1`).get(goalId) as Row | undefined : undefined;
    const reflectionToday = db.prepare("SELECT * FROM operating_reflections WHERE user_id=? AND reflection_date=?").get(this.userId, date) as Row | undefined;
    const previousReflection = db.prepare("SELECT * FROM operating_reflections WHERE user_id=? AND reflection_date<? ORDER BY reflection_date DESC LIMIT 1").get(this.userId, date) as Row | undefined;
    const planRow = db.prepare("SELECT * FROM daily_plans WHERE user_id=? AND plan_date=? AND status IN ('active','completed') ORDER BY created_at DESC LIMIT 1").get(this.userId, date) as Row | undefined;
    const planState = this.planState(planRow);
    const approvedPlan = planState ? { ...planState, contextProjected: planProjection?.sourceRecordId === planState.id } : null;
    const timeBudget = this.timeBudget();

    const missionStrategyRef = missionProjection?.provenanceRefs.find((ref) => ref.startsWith("strategy:"))?.slice("strategy:".length) ?? null;
    const alignmentConfirmed = Boolean(strategyProjection && missionProjection && missionStrategyRef === strategyProjection?.sourceRecordId);
    const strategyPlans = strategyProjection?.contextPayload.plans as Record<string, unknown> | undefined;
    const d7 = strategyPlans?.d7 as Record<string, unknown> | undefined;
    const d90 = strategyPlans?.d90 as Record<string, unknown> | undefined;
    const contextProjectionIds = approvedContext.items.map((item) => item.projectionId);
    const sourceRefs = [
      ...contextProjectionIds.map((id) => `CTX:${id}`),
      activeMission ? `MS:${text(activeMission.id)}` : null,
      learningGoal ? `GOAL:${text(learningGoal.id)}` : null,
      learningMission ? `LM:${text(learningMission.id)}` : null,
      approvedPlan ? `PLAN:${approvedPlan.id}` : null,
      ...dueReviewRows.map((row) => `REVIEW:${text(row.id)}`),
      ...remediationRows.map((row) => `REMEDIATION:${text(row.id)}`),
      project ? `PROJECT:${text(project.id)}` : null,
    ].filter((item): item is string => Boolean(item));

    const missingInputs = [
      !strategyProjection ? "approved_strategy_context" : null,
      !missionProjection ? "approved_mission_context" : null,
      !goalProjection ? "approved_learning_goal_context" : null,
      !activeMission ? "active_mission" : null,
      !learningGoal ? "active_learning_goal" : null,
      !approvedPlan ? "approved_daily_plan" : null,
      !reflectionToday ? "evening_reflection" : null,
      !timeBudget ? "owner_time_budget" : null,
    ].filter((item): item is string => Boolean(item));

    return {
      date,
      purpose: "daily_operation" as const,
      approvedContext: {
        projectionIds: contextProjectionIds,
        items: approvedContext.items,
      },
      strategicDirection: {
        value: text(d7?.goal || d90?.goal) || null,
        sourceProjectionId: strategyProjection?.projectionId ?? null,
      },
      alignment: {
        confirmed: alignmentConfirmed,
        strategyId: alignmentConfirmed ? strategyProjection?.sourceRecordId ?? null : null,
        missionId: alignmentConfirmed ? missionProjection?.sourceRecordId ?? null : null,
        reason: alignmentConfirmed
          ? "The active Mission projection preserves provenance to the approved Strategy projection."
          : "Strategy/Mission alignment is not claimed until both eligible projections and matching provenance exist.",
      },
      activeMission: activeMission ? {
        id: text(activeMission.id), title: text(activeMission.title), description: text(activeMission.description), priority: text(activeMission.priority),
        deadline: text(activeMission.deadline), evidenceRequirement: text(activeMission.evidence_requirement), dailyTasks: strings(activeMission.daily_tasks_json),
        contextProjected: missionProjection?.sourceRecordId === activeMission.id,
      } : null,
      learning: learningGoal ? {
        goalId, title: text(learningGoal.title), targetAbility: text(learningGoal.target_ability), deadline: learningGoal.deadline ? text(learningGoal.deadline) : null,
        contextProjected: goalProjection?.sourceRecordId === goalId,
        activeStage: activeStage ? { id: text(activeStage.id), key: text(activeStage.phase_key), title: text(activeStage.title), objective: text(activeStage.objective) } : null,
        todayMission: learningMission ? { id: text(learningMission.id), objective: text(learningMission.learning_objective), practiceTask: text(learningMission.practice_task), estimatedMinutes: Number(learningMission.estimated_minutes), status: text(learningMission.status) } : null,
        weakConcepts: weakConceptRows.map((row) => ({ id: text(row.id), title: text(row.title), mastery: Number(row.mastery), confidence: Number(row.mastery_confidence), status: text(row.status) })),
        masteryGaps: masteryGapRows.map((row) => ({ gateType: text(row.gate_type), status: text(row.status), reason: text(row.failure_reason), nextRetryAt: row.next_retry_at ? text(row.next_retry_at) : null, score: row.score_optional === null ? null : Number(row.score_optional) })),
        dueReviews: dueReviewRows.map((row) => ({ id: text(row.id), nodeId: text(row.node_id), title: text(row.title), dueAt: text(row.due_at), reason: text(row.reason) })),
        remediation: remediationRows.map((row) => ({ id: text(row.id), gateType: text(row.gate_type), diagnosis: text(row.diagnosis), reason: text(row.reason), targetConcepts: strings(row.target_concepts_json), targetExercises: strings(row.target_exercises_json), retryRules: parse(row.retry_rules_json, {}) })),
        projectChallenge: project ? { id: text(project.id), title: text(project.challenge_title), status: text(project.status), deadline: project.deadline ? text(project.deadline) : null, requirements: parse(project.requirements_json, []), acceptanceCriteria: parse(project.acceptance_criteria_json, []), requiredTests: parse(project.required_tests_json, []) } : null,
        estimate: estimate ? { realisticMinutes: Number(estimate.realistic_minutes), minHours: estimate.estimated_min_hours === null ? null : Number(estimate.estimated_min_hours), maxHours: estimate.estimated_max_hours === null ? null : Number(estimate.estimated_max_hours), actualHours: Number(estimate.actual_hours_so_far), calibrationStatus: text(estimate.calibration_status), confidence: Number(estimate.confidence) } : null,
        actualMinutesToday: Number(reflectionToday?.actual_learning_minutes ?? 0),
      } : null,
      approvedPlan,
      deadlines: [
        activeMission?.deadline ? { type: "mission" as const, id: text(activeMission.id), title: text(activeMission.title), deadline: text(activeMission.deadline) } : null,
        learningGoal?.deadline ? { type: "learning_goal" as const, id: text(learningGoal.id), title: text(learningGoal.title), deadline: text(learningGoal.deadline) } : null,
        project?.deadline ? { type: "project" as const, id: text(project.id), title: text(project.challenge_title), deadline: text(project.deadline) } : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
      constraints: {
        timeBudget,
        previousSelfReport: previousReflection ? {
          reflectionId: text(previousReflection.id), unfinishedReason: text(previousReflection.unfinished_reason),
          newProblems: text(previousReflection.new_problems), tomorrowAdjustment: text(previousReflection.tomorrow_adjustment),
        } : null,
      },
      missingInputs,
      sourceRefs: [...new Set(sourceRefs.length ? sourceRefs : ["SYSTEM:daily-operating-state"])],
      generatedAt: this.clock().toISOString(),
      deterministic: true,
      limitations: [
        "Missing inputs remain explicit and are not inferred.",
        "Candidate, revoked, stale, expired, or superseded Context is excluded by the Approved Context read boundary.",
        "Daily action completion is not Evidence, Ability, Growth, or Mastery.",
      ],
    };
  }

  dailyClose() {
    const state = this.read();
    const date = state.date;
    const db = this.repository.db;
    const reflection = db.prepare("SELECT * FROM operating_reflections WHERE user_id=? AND reflection_date=?").get(this.userId, date) as Row | undefined;
    const set = reflection ? db.prepare("SELECT * FROM daily_operating_follow_up_candidate_sets WHERE user_id=? AND reflection_id=?").get(this.userId, reflection.id) as Row | undefined : undefined;
    const candidates = set ? db.prepare("SELECT * FROM daily_operating_follow_up_candidates WHERE user_id=? AND candidate_set_id=? ORDER BY candidate_type").all(this.userId, set.id) as Row[] : [];
    const completedReviews = db.prepare(`SELECT count(*) AS count FROM review_schedule schedule JOIN learning_goals goal ON goal.id=schedule.goal_id
      WHERE goal.user_id=? AND schedule.status='completed' AND substr(schedule.updated_at,1,10)=?`).get(this.userId, date) as { count: number };
    const evidencePrepared = reflection?.evidence_item_id ? 1 : 0;
    const unresolved = [
      ...(state.approvedPlan?.blocks.filter((block) => block.completionStatus !== "completed").map((block) => block.title) ?? []),
      ...(state.learning?.masteryGaps.map((gap) => `${gap.gateType}: ${gap.reason || gap.status}`) ?? []),
      ...(state.learning?.remediation.map((item) => `${item.gateType}: ${item.reason}`) ?? []),
    ];
    return {
      date,
      facts: {
        plannedBlocks: state.approvedPlan?.totalBlocks ?? 0,
        completedBlocks: state.approvedPlan?.completedBlocks ?? 0,
        actualLearningMinutes: Number(reflection?.actual_learning_minutes ?? 0),
        missionStatus: state.activeMission ? "active" : "none",
        learningStatus: state.learning?.todayMission?.status ?? (state.learning ? "active_goal" : "none"),
        reviewsCompleted: Number(completedReviews.count),
        evidencePrepared,
        verifiedEvidenceCreatedByPlanCompletion: false,
        reflectionSubmitted: Boolean(reflection),
      },
      selfReport: reflection ? {
        actualHappened: text(reflection.actual_happened_text),
        completed: text(reflection.completed_text),
        notCompleted: text(reflection.unfinished_reason),
        harderThanExpected: text(reflection.harder_than_expected),
        learned: text(reflection.learned_text),
        decision: text(reflection.decision_text),
        tomorrowAdjustment: text(reflection.tomorrow_adjustment),
      } : null,
      aiInference: {
        available: Boolean(set && set.model_mode === "real" && !set.fallback_reason),
        generationMethod: set ? text(set.generation_method) : null,
        fallbackReason: set?.fallback_reason ? text(set.fallback_reason) : null,
        candidateSetId: set ? text(set.id) : null,
        candidates: candidates.map((row) => dailyFollowUpCandidateSchema.parse(parse(row.candidate_json, {}))),
        classification: "candidate_untrusted" as const,
      },
      unresolvedBlockers: [...new Set(unresolved)].slice(0, 12),
      sourceRefs: state.sourceRefs,
      limitations: ["事实、所有者自述与 AI／确定性推断会被明确分开。"],
    };
  }

  metrics() {
    const db = this.repository.db;
    const date = this.day();
    const briefs = db.prepare("SELECT count(*) total,SUM(CASE WHEN fallback_reason IS NULL THEN 1 ELSE 0 END) success,SUM(CASE WHEN fallback_reason IS NOT NULL THEN 1 ELSE 0 END) fallbacks FROM morning_briefs WHERE user_id=?").get(this.userId) as Row;
    const candidates = db.prepare("SELECT count(*) total,SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved FROM daily_plan_candidates WHERE user_id=?").get(this.userId) as Row;
    const reflectionCount = db.prepare("SELECT count(*) AS count FROM operating_reflections WHERE user_id=?").get(this.userId) as Row;
    const plan = this.read().approvedPlan;
    const delayed = db.prepare(`SELECT count(*) AS count FROM review_schedule schedule JOIN learning_goals goal ON goal.id=schedule.goal_id
      WHERE goal.user_id=? AND schedule.status='completed'`).get(this.userId) as Row;
    return {
      asOf: date,
      morningBriefs: Number(briefs.total ?? 0),
      morningBriefSuccesses: Number(briefs.success ?? 0),
      aiFallbackOccurrences: Number(briefs.fallbacks ?? 0),
      dailyPlanCandidates: Number(candidates.total ?? 0),
      dailyPlanApprovalRate: Number(candidates.total ?? 0) ? Number(candidates.approved ?? 0) / Number(candidates.total) : 0,
      currentPlanCompletionRate: plan?.totalBlocks ? plan.completedBlocks / plan.totalBlocks : 0,
      reflectionsSubmitted: Number(reflectionCount.count ?? 0),
      delayedReviewsCompleted: Number(delayed.count ?? 0),
      localOnly: true,
      rawPrivateContentRecordedInMetrics: false,
    };
  }
}
