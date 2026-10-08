import { randomUUID } from "node:crypto";
import { ContextEngine } from "@/lib/ai/context-engine";
import { EvidenceService } from "@/lib/services/evidence-service";
import {
  dailyFollowUpBundleSchema,
  dailyPlanSchema,
  operatingBriefSchema,
  personalOperatingActionSchema,
  type DailyFollowUpBundle,
  type DailyPlan,
  type DailyPlanBlock,
  type OperatingBrief,
} from "@/lib/domain/personal-operating";
import {
  DailyOperatingStateService,
  normalizeDailyPlan,
} from "@/lib/services/daily-operating-state-service";
import type { ProfileRepository } from "@/lib/db/repository";

const DEFAULT_OWNER_ID = "genesis-owner";
type Row = Record<string, unknown>;
type ReflectionInput = Omit<
  Extract<
    ReturnType<typeof personalOperatingActionSchema.parse>,
    { action: "submit_reflection" }
  >,
  "action"
>;

const parse = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
};
const text = (value: unknown) => String(value ?? "").trim();

export class PersonalOperatingService {
  private readonly stateService: DailyOperatingStateService;

  constructor(
    private readonly repository: ProfileRepository,
    private readonly userId = DEFAULT_OWNER_ID,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.stateService = new DailyOperatingStateService(
      repository,
      userId,
      clock,
    );
  }

  private now() {
    return this.clock().toISOString();
  }
  private day() {
    return this.stateService.day();
  }

  private briefSourceRefs(
    state: ReturnType<DailyOperatingStateService["read"]>,
  ) {
    const allowedOperationalPrefixes = [
      "CTX:",
      "REVIEW:",
      "REMEDIATION:",
      "PROJECT:",
    ];
    const refs = state.sourceRefs.filter((ref) =>
      allowedOperationalPrefixes.some((prefix) => ref.startsWith(prefix)),
    );
    return refs.length ? refs : ["SYSTEM:daily-operating-state"];
  }

  private fallbackBrief(
    state: ReturnType<DailyOperatingStateService["read"]>,
  ): OperatingBrief {
    const refs = this.briefSourceRefs(state);
    const projectedMission = state.activeMission?.contextProjected
      ? state.activeMission
      : null;
    const learning = state.learning;
    const firstRemediation = learning?.remediation[0];
    const firstReview = learning?.dueReviews[0];
    const missionAction =
      projectedMission?.dailyTasks[0] || projectedMission?.title;
    const direction = firstRemediation
      ? `修复 ${firstRemediation.gateType} 补救项：${firstRemediation.reason}`
      : firstReview
        ? `完成逾期复习：${firstReview.title}`
        : missionAction ||
          state.strategicDirection.value ||
          "先审查缺失的已批准每日上下文，再承诺新工作。";
    const learningFocus = learning?.contextProjected
      ? learning.todayMission?.practiceTask ||
        learning.todayMission?.objective ||
        learning.weakConcepts[0]?.title ||
        learning.title
      : firstRemediation?.diagnosis ||
        firstReview?.reason ||
        "当前没有投影到每日运行场景的学习目标。";
    const risks = [
      firstRemediation ? `${firstRemediation.gateType} 补救项仍在进行。` : null,
      firstReview ? `复习到期：${firstReview.title}。` : null,
      state.deadlines[0]
        ? `截止时间：${state.deadlines[0].title}，${state.deadlines[0].deadline}。`
        : null,
      state.constraints.previousSelfReport?.unfinishedReason
        ? `上次自述：${state.constraints.previousSelfReport.unfinishedReason}`
        : null,
      ...state.missingInputs.slice(0, 2).map((item) => `缺失输入：${item}。`),
    ]
      .filter((item): item is string => Boolean(item))
      .slice(0, 6);
    return operatingBriefSchema.parse({
      highestPriority: direction,
      activeMission: projectedMission
        ? `${projectedMission.title}（${projectedMission.priority}；截止 ${projectedMission.deadline.slice(0, 10)}）`
        : state.activeMission
          ? `${state.activeMission.title}（${state.activeMission.priority}；正式使命存在，但尚未投影到每日运行场景）`
          : "没有用户确认的进行中使命，也没有符合条件的使命投影。",
      learningGoal: learningFocus,
      riskReminder:
        risks[0] || "当前没有记录已验证的阻塞；保留缓冲时间和证据要求。",
      strategicFocus:
        state.strategicDirection.value ||
        "当前没有投影到每日运行场景的合格战略。",
      sourceRefs: refs,
      confidence: Math.min(
        0.82,
        0.36 +
          (state.strategicDirection.value ? 0.12 : 0) +
          (projectedMission ? 0.14 : 0) +
          (learning?.contextProjected ? 0.1 : 0) +
          (firstReview || firstRemediation ? 0.08 : 0),
      ),
      limitations: [
        "当前使用确定性降级结果；AI 每日智能不可用，且不会修改任何正式状态。",
      ],
      briefVersion: "v2",
      todayDirection: direction,
      strategicAlignment: state.alignment.confirmed
        ? `${projectedMission?.title || "已投影使命"} 与已批准战略存在可追溯关联。`
        : "没有匹配且合格的投影时，不声明战略与使命一致。",
      learningFocus,
      priorityActions: [
        direction,
        firstReview ? `复习 ${firstReview.title}。` : null,
        firstRemediation ? `准备 ${firstRemediation.gateType} 补救。` : null,
      ]
        .filter((item): item is string => Boolean(item))
        .slice(0, 3),
      risks: risks.length
        ? risks
        : ["没有记录阻塞；控制计划范围，并保留执行证据要求。"],
      cognitivePrompt: firstRemediation
        ? "什么可观察结果能证明未通过的门槛已经修复，而不是简单重复？"
        : "推进今日已批准方向的最小可检查结果是什么？",
      intelligenceAvailable: false,
      contextProjectionIds: state.approvedContext.projectionIds,
    });
  }

  private planCapacity(
    state: ReturnType<DailyOperatingStateService["read"]>,
    energy: number,
  ) {
    const budget = state.constraints.timeBudget;
    if (!budget)
      return {
        available: 60,
        planned: Math.floor(60 * 0.85),
        buffer: 9,
        utilization: 0.85,
        weeklyMaximum: 420,
        source: "owner_configured" as const,
      };
    const energyFactor = [0.65, 0.8, 1, 1, 1][energy - 1];
    const planned = Math.max(
      10,
      Math.floor(budget.plannedMinutes * energyFactor),
    );
    return {
      available: budget.availableMinutes,
      planned,
      buffer: budget.availableMinutes - planned,
      utilization: budget.targetUtilization,
      weeklyMaximum: budget.weeklyMaximumMinutes,
      source: budget.source,
    };
  }

  private fallbackPlan(
    state: ReturnType<DailyOperatingStateService["read"]>,
    energy: number,
  ): DailyPlan {
    const capacity = this.planCapacity(state, energy);
    const projections = state.approvedContext.projectionIds;
    const blocks: Array<Omit<DailyPlanBlock, "minutes" | "blockId">> = [];
    const learning = state.learning;
    const remediation = learning?.remediation[0];
    const review = learning?.dueReviews[0];

    if (remediation)
      blocks.push({
        blockType: "review",
        title: `修复 ${remediation.gateType}：${remediation.targetExercises[0] || remediation.diagnosis}`,
        verification:
          "记录重试结果并保留失败门槛的来源；完成任务不等于通过掌握门槛。",
        reason: remediation.reason,
        linkedGoalId: learning?.goalId ?? null,
        linkedStrategyId: state.alignment.strategyId,
        linkedMissionId: state.alignment.missionId,
        linkedLearningGoalId: learning?.goalId ?? null,
        evidenceExpectation:
          "后续评估或重试记录可以准备为证据审查材料；本计划不负责验证。",
        masteryRelationship: `${remediation.gateType} 补救；正式掌握仍由全部必需门槛共同约束。`,
        priority: "critical",
        dependencies: remediation.targetConcepts,
        sourceContextIds: projections,
      });
    if (review)
      blocks.push({
        blockType: "review",
        title: `延迟复习：${review.title}`,
        verification: "完成现有复习流程，并保留带评分的复习尝试。",
        reason: review.reason,
        linkedGoalId: learning?.goalId ?? null,
        linkedStrategyId: state.alignment.strategyId,
        linkedMissionId: state.alignment.missionId,
        linkedLearningGoalId: learning?.goalId ?? null,
        evidenceExpectation: "通过现有学习引擎准备复习尝试。",
        masteryRelationship:
          "只有现有评估器接受已持久化证据后，才可能支持延迟回忆门槛。",
        priority: remediation ? "high" : "critical",
        dependencies: [],
        sourceContextIds: projections,
      });
    if (learning?.projectChallenge)
      blocks.push({
        blockType: "project",
        title: `${learning.projectChallenge.title}：完成下一个可检查的实现或验证节点。`,
        verification: "运行挑战已有的测试与检查，并保留真实产物或输出。",
        reason: "进行中的工程挑战是当前工程成果路径。",
        linkedGoalId: learning.goalId,
        linkedStrategyId: state.alignment.strategyId,
        linkedMissionId: state.alignment.missionId,
        linkedLearningGoalId: learning.goalId,
        evidenceExpectation: "项目产物、测试输出或答辩准备；仍须经过证据审批。",
        masteryRelationship:
          "项目活动可以支持产物或应用门槛，但不能单独建立掌握状态。",
        priority: "high",
        dependencies: [],
        sourceContextIds: projections,
      });
    if (learning && blocks.length < 3)
      blocks.push({
        blockType: "learning",
        title:
          learning.todayMission?.practiceTask ||
          learning.todayMission?.objective ||
          (learning.weakConcepts[0]
            ? `用一道迁移练习训练 ${learning.weakConcepts[0].title}。`
            : `用一项有来源的应用任务推进 ${learning.title}。`),
        verification: "在现有学习流程中保存真实练习、解释、代码或评估结果。",
        reason:
          learning.todayMission?.objective ||
          "推进当前正式学习目标，但不声明已经掌握。",
        linkedGoalId: learning.goalId,
        linkedStrategyId: state.alignment.strategyId,
        linkedMissionId: state.alignment.missionId,
        linkedLearningGoalId: learning.goalId,
        evidenceExpectation: "真实学习产出可以在之后准备为证据。",
        masteryRelationship: learning.masteryGaps[0]
          ? `当前阻塞：${learning.masteryGaps[0].gateType}。`
          : "学习活动本身不会通过掌握门槛。",
        priority: blocks.length ? "normal" : "high",
        dependencies: learning.weakConcepts
          .slice(0, 2)
          .map((item) => item.title),
        sourceContextIds: projections,
      });
    if (state.activeMission && blocks.length < 3)
      blocks.push({
        blockType: "mission",
        title: state.activeMission.dailyTasks[0] || state.activeMission.title,
        verification:
          state.activeMission.evidenceRequirement ||
          "保留具体结果，以供后续证据审查。",
        reason: state.activeMission.contextProjected
          ? "服务于已投影的进行中使命。"
          : "正式使命正在进行；上下文投影合格前不声明战略一致。",
        linkedGoalId: null,
        linkedStrategyId: state.alignment.strategyId,
        linkedMissionId: state.activeMission.id,
        linkedLearningGoalId: null,
        evidenceExpectation: state.activeMission.evidenceRequirement || null,
        masteryRelationship: null,
        priority: state.activeMission.priority as DailyPlanBlock["priority"],
        dependencies: [],
        sourceContextIds: state.activeMission.contextProjected
          ? projections
          : [],
      });
    if (!blocks.length)
      blocks.push({
        blockType: "administrative",
        title:
          "审查缺失的已批准上下文，并选择一项范围明确、由所有者提出的优先事项。",
        verification:
          "通过已有且已批准的目标、战略、使命或学习流程记录所选优先事项。",
        reason: "每日运行状态没有可安全排期的合格方向，系统不会编造。",
        linkedGoalId: null,
        linkedStrategyId: null,
        linkedMissionId: null,
        linkedLearningGoalId: null,
        evidenceExpectation: null,
        masteryRelationship: null,
        priority: "normal",
        dependencies: state.missingInputs,
        sourceContextIds: projections,
      });

    const chosen = blocks.slice(0, 3);
    const minutesEach = Math.max(
      10,
      Math.floor(capacity.planned / chosen.length),
    );
    const actions = chosen.map((block, index) => ({
      ...block,
      blockId: randomUUID(),
      minutes:
        index === chosen.length - 1
          ? capacity.planned - minutesEach * (chosen.length - 1)
          : minutesEach,
    }));
    const totalMinutes = actions.reduce((sum, block) => sum + block.minutes, 0);
    return dailyPlanSchema.parse({
      title: `待所有者审查的今日计划候选（执行负荷 ${totalMinutes} 分钟）`,
      actions,
      totalMinutes,
      rationale: `${capacity.available} 分钟的${state.constraints.timeBudget?.dayType || "每日"}预算按 ${Math.round(capacity.utilization * 100)}% 目标利用率封顶，并结合自述精力 ${energy}/5 调整。`,
      risk:
        state.learning?.masteryGaps[0]?.reason ||
        state.constraints.previousSelfReport?.unfinishedReason ||
        "不要把完成任务直接转换为证据、能力或掌握状态。",
      sourceRefs: state.sourceRefs,
      confidence: Math.min(
        0.82,
        0.42 +
          (state.approvedContext.projectionIds.length ? 0.18 : 0) +
          (state.learning ? 0.08 : 0) +
          (state.activeMission ? 0.08 : 0),
      ),
      limitations: ["仅为候选。激活前必须由所有者确认；缓冲时间有意不排期。"],
      planVersion: "v2",
      timeBudget: {
        availableMinutes: capacity.available,
        plannedMinutes: totalMinutes,
        bufferMinutes: Math.max(0, capacity.available - totalMinutes),
        targetUtilization: capacity.utilization,
        weeklyMaximumMinutes: capacity.weeklyMaximum,
        source: capacity.source,
      },
    });
  }

  private validateRefs(value: { sourceRefs: string[] }, allowed: Set<string>) {
    if (value.sourceRefs.some((ref) => !allowed.has(ref)))
      throw new Error("OPERATING_INVALID_REFERENCE");
  }

  private validatePlan(
    plan: DailyPlan,
    fallback: DailyPlan,
    state: ReturnType<DailyOperatingStateService["read"]>,
  ) {
    const normalized = normalizeDailyPlan({
      ...plan,
      planVersion: "v2",
      timeBudget: fallback.timeBudget,
    });
    const total = normalized.actions.reduce(
      (sum, block) => sum + block.minutes,
      0,
    );
    if (
      total !== normalized.totalMinutes ||
      !normalized.timeBudget ||
      total > normalized.timeBudget.plannedMinutes
    )
      throw new Error("OPERATING_PLAN_BUDGET_INVALID");
    const contextIds = new Set(state.approvedContext.projectionIds);
    if (
      normalized.actions.some((block) =>
        block.sourceContextIds.some((id) => !contextIds.has(id)),
      )
    )
      throw new Error("OPERATING_INVALID_CONTEXT_REFERENCE");
    return normalized;
  }

  private mapBrief(row: Row) {
    return {
      id: text(row.id),
      date: text(row.brief_date),
      brief: operatingBriefSchema.parse(parse(row.brief_json, {})),
      provider: text(row.provider),
      model: text(row.model),
      mode: text(row.model_mode),
      fallbackReason: row.fallback_reason ? text(row.fallback_reason) : null,
      createdAt: text(row.created_at),
    };
  }

  private mapCandidate(row: Row) {
    const ownerReview = this.repository.db
      .prepare(
        "SELECT event_type,reason,revisit_at,created_at FROM daily_plan_owner_review_events WHERE candidate_id=? AND user_id=? ORDER BY event_sequence DESC LIMIT 1",
      )
      .get(row.id, this.userId) as Row | undefined;
    return {
      id: text(row.id),
      date: text(row.plan_date),
      energy: Number(row.energy),
      plan: normalizeDailyPlan(parse(row.plan_json, {})),
      status: text(row.status) as "candidate" | "approved" | "rejected",
      provider: text(row.provider),
      model: text(row.model),
      mode: text(row.model_mode),
      fallbackReason: row.fallback_reason ? text(row.fallback_reason) : null,
      ownerReview: ownerReview
        ? {
            eventType: text(ownerReview.event_type),
            reason: text(ownerReview.reason),
            revisitAt: ownerReview.revisit_at
              ? text(ownerReview.revisit_at)
              : null,
            createdAt: text(ownerReview.created_at),
          }
        : null,
      createdAt: text(row.created_at),
    };
  }

  snapshot() {
    const db = this.repository.db;
    const date = this.day();
    const brief = db
      .prepare("SELECT * FROM morning_briefs WHERE user_id=? AND brief_date=?")
      .get(this.userId, date) as Row | undefined;
    const candidates = db
      .prepare(
        "SELECT * FROM daily_plan_candidates WHERE user_id=? AND plan_date=? ORDER BY created_at DESC",
      )
      .all(this.userId, date) as Row[];
    const reflection = db
      .prepare(
        "SELECT * FROM operating_reflections WHERE user_id=? AND reflection_date=?",
      )
      .get(this.userId, date) as Row | undefined;
    const dailyState = this.stateService.read();
    const dailyClose = this.stateService.dailyClose();
    return {
      date,
      brief: brief ? this.mapBrief(brief) : null,
      candidates: candidates.map((row) => this.mapCandidate(row)),
      plan: dailyState.approvedPlan,
      reflection: reflection
        ? {
            id: text(reflection.id),
            actualHappened: text(reflection.actual_happened_text),
            completed: text(reflection.completed_text),
            unfinishedReason: text(reflection.unfinished_reason),
            newProblems: text(reflection.new_problems),
            harderThanExpected: text(reflection.harder_than_expected),
            learned: text(reflection.learned_text),
            decision: text(reflection.decision_text),
            tomorrowAdjustment: text(reflection.tomorrow_adjustment),
            actualLearningMinutes: Number(reflection.actual_learning_minutes),
            evidenceId: reflection.evidence_item_id
              ? text(reflection.evidence_item_id)
              : null,
            growthCandidateId: reflection.growth_candidate_id
              ? text(reflection.growth_candidate_id)
              : null,
            createdAt: text(reflection.created_at),
          }
        : null,
      activeMission: dailyState.activeMission
        ? {
            id: dailyState.activeMission.id,
            title: dailyState.activeMission.title,
            priority: dailyState.activeMission.priority,
          }
        : null,
      dailyState,
      dailyClose,
      metrics: this.stateService.metrics(),
    };
  }

  async generateBrief(clientRequestId: string) {
    const existing = this.repository.db
      .prepare("SELECT * FROM morning_briefs WHERE user_id=? AND brief_date=?")
      .get(this.userId, this.day()) as Row | undefined;
    if (existing)
      return {
        duplicate: true,
        brief: this.mapBrief(existing),
        snapshot: this.snapshot(),
      };
    const state = this.stateService.read();
    const fallback = this.fallbackBrief(state);
    const context = new ContextEngine(this.repository);
    let brief = fallback;
    let provider = "demo",
      model = "deterministic-daily-operating-v2",
      mode: "demo" | "real" = "demo",
      fallbackReason: string | null = null;
    if (context.isRealConfigured()) {
      try {
        const prepared = context.prepare(
          {
            currentPage: "/today",
            currentTask: "生成新版晨间简报",
            currentQuestion: "今天最有价值且已经批准的方向是什么？",
            currentChapter: null,
            currentConversation: [],
          },
          "full",
          { purpose: "daily_operation", approvedOnly: true },
        );
        const operationalFacts = {
          date: state.date,
          dueReviews: state.learning?.dueReviews ?? [],
          masteryGaps: state.learning?.masteryGaps ?? [],
          remediation: state.learning?.remediation ?? [],
          projectChallenge: state.learning?.projectChallenge ?? null,
          deadlines: state.deadlines,
          missingInputs: state.missingInputs,
          timeBudget: state.constraints.timeBudget,
        };
        const result = await context.complete({
          module: "personal_operating_morning_brief_v2",
          taskClass: "cheap_daily",
          maxOutputTokens: 1_600,
          temperature: 0.1,
          reasoningMode: "standard",
          schema: operatingBriefSchema,
          schemaName: "operatingBriefV2",
          preparedContext: prepared,
          workingMemory: prepared.packet!.memory.working,
          messages: [
            {
              role: "system",
              content: `返回符合 operatingBriefV2 的 JSON。只使用 purpose=daily_operation 的已批准上下文和下方确定性运行事实。只能引用这些 sourceRefs：${this.briefSourceRefs(state).join(",")}。不要加入空泛鼓励，不要修改任何正式状态。`,
            },
            {
              role: "user",
              content: `生成今日方向、一致性、学习重点、不超过四项行动、阻塞和一个认知问题。运行事实：${JSON.stringify(operationalFacts)}`,
            },
          ],
        });
        brief = operatingBriefSchema.parse({
          ...result.parsed,
          briefVersion: "v2",
          intelligenceAvailable: true,
          contextProjectionIds: state.approvedContext.projectionIds,
        });
        provider = result.provider;
        model = result.model;
        mode = "real";
      } catch {
        brief = fallback;
        fallbackReason = "provider_failed";
      }
    }
    this.validateRefs(brief, new Set(this.briefSourceRefs(state)));
    if (
      brief.contextProjectionIds.some(
        (id) => !state.approvedContext.projectionIds.includes(id),
      )
    )
      throw new Error("OPERATING_INVALID_CONTEXT_REFERENCE");
    const id = randomUUID(),
      timestamp = this.now();
    this.repository.db
      .prepare(
        "INSERT INTO morning_briefs (id,user_id,brief_date,brief_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,fallback_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        this.userId,
        this.day(),
        JSON.stringify(brief),
        JSON.stringify(brief.sourceRefs),
        brief.confidence,
        provider,
        model,
        mode,
        "personal-operating-v2",
        fallbackReason,
        timestamp,
        timestamp,
      );
    this.audit("operating.morning_brief_v2_created", "morning_brief", id, {
      clientRequestId,
      sourceRefs: brief.sourceRefs,
      contextProjectionIds: brief.contextProjectionIds,
      intelligenceAvailable: brief.intelligenceAvailable,
      fallbackReason,
    });
    return {
      duplicate: false,
      brief: this.mapBrief(
        this.repository.db
          .prepare("SELECT * FROM morning_briefs WHERE id=?")
          .get(id) as Row,
      ),
      snapshot: this.snapshot(),
    };
  }

  async generatePlan(energy: number, clientRequestId: string) {
    const db = this.repository.db;
    const existing = db
      .prepare(
        "SELECT * FROM daily_plan_candidates WHERE user_id=? AND (client_request_id=? OR (plan_date=? AND status='candidate')) ORDER BY created_at DESC LIMIT 1",
      )
      .get(this.userId, clientRequestId, this.day()) as Row | undefined;
    if (existing)
      return {
        duplicate: true,
        candidate: this.mapCandidate(existing),
        snapshot: this.snapshot(),
      };
    const state = this.stateService.read();
    const fallback = this.fallbackPlan(state, energy);
    const context = new ContextEngine(this.repository);
    let plan = fallback;
    let provider = "demo",
      model = "deterministic-daily-plan-v2",
      mode: "demo" | "real" = "demo",
      fallbackReason: string | null = null;
    if (context.isRealConfigured()) {
      try {
        const prepared = context.prepare(
          {
            currentPage: "/today",
            currentTask: "生成今日计划候选",
            currentQuestion: "在已批准方向和时间预算内，我今天应该做什么？",
            currentChapter: null,
            currentConversation: [],
          },
          "full",
          { purpose: "daily_operation", approvedOnly: true },
        );
        const operationalFacts = {
          date: state.date,
          activeMission: state.activeMission,
          learning: state.learning,
          deadlines: state.deadlines,
          timeBudget: fallback.timeBudget,
          missingInputs: state.missingInputs,
          alignment: state.alignment,
        };
        const result = await context.complete({
          module: "personal_operating_daily_plan_v2",
          taskClass: "cheap_daily",
          maxOutputTokens: 2_200,
          temperature: 0.1,
          reasoningMode: "standard",
          schema: dailyPlanSchema,
          schemaName: "dailyPlanV2",
          preparedContext: prepared,
          workingMemory: prepared.packet!.memory.working,
          messages: [
            {
              role: "system",
              content: `返回符合 dailyPlanV2 的候选。所有者精力=${energy}/5。只能引用这些 sourceRefs：${state.sourceRefs.join(",")}。只使用 purpose=daily_operation 的已批准上下文和提供的确定性运行事实。绝不激活计划，也不声明证据、能力、成长或掌握状态。`,
            },
            {
              role: "user",
              content: `在计划时间预算内生成分类型任务块，并让缓冲时间保持未排期。运行事实：${JSON.stringify(operationalFacts)}`,
            },
          ],
        });
        plan = this.validatePlan(
          dailyPlanSchema.parse(result.parsed),
          fallback,
          state,
        );
        provider = result.provider;
        model = result.model;
        mode = "real";
      } catch {
        plan = fallback;
        fallbackReason = "provider_failed";
      }
    }
    this.validateRefs(plan, new Set(state.sourceRefs));
    const id = randomUUID(),
      timestamp = this.now();
    db.prepare(
      "INSERT INTO daily_plan_candidates (id,user_id,plan_date,client_request_id,energy,plan_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,fallback_reason,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'candidate',?)",
    ).run(
      id,
      this.userId,
      this.day(),
      clientRequestId,
      energy,
      JSON.stringify(plan),
      JSON.stringify(plan.sourceRefs),
      plan.confidence,
      provider,
      model,
      mode,
      "personal-operating-v2",
      fallbackReason,
      timestamp,
    );
    return {
      duplicate: false,
      candidate: this.mapCandidate(
        db
          .prepare("SELECT * FROM daily_plan_candidates WHERE id=?")
          .get(id) as Row,
      ),
      snapshot: this.snapshot(),
    };
  }

  approvePlan(candidateId: string) {
    const db = this.repository.db;
    return db.transaction(() => {
      const candidate = db
        .prepare("SELECT * FROM daily_plan_candidates WHERE id=? AND user_id=?")
        .get(candidateId, this.userId) as Row | undefined;
      if (!candidate) throw new Error("DAILY_PLAN_CANDIDATE_NOT_FOUND");
      if (text(candidate.status) !== "candidate")
        throw new Error("DAILY_PLAN_CANDIDATE_NOT_PENDING");
      const timestamp = this.now(),
        planId = randomUUID();
      const updated = db
        .prepare(
          "UPDATE daily_plan_candidates SET status='approved',approved_at=?,approved_by=? WHERE id=? AND user_id=? AND status='candidate'",
        )
        .run(timestamp, this.userId, candidateId, this.userId);
      if (!updated.changes) throw new Error("DAILY_PLAN_CANDIDATE_NOT_PENDING");
      db.prepare(
        "INSERT INTO daily_plans (id,user_id,plan_date,source_candidate_id,plan_json,energy,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)",
      ).run(
        planId,
        this.userId,
        candidate.plan_date,
        candidateId,
        candidate.plan_json,
        candidate.energy,
        timestamp,
        timestamp,
      );
      this.audit(
        "operating.daily_plan_approved",
        "daily_plan_candidate",
        candidateId,
        { status: "approved", planId },
      );
      return { candidateId, planId, snapshot: this.snapshot() };
    })();
  }

  rejectPlan(candidateId: string, reason: string) {
    const timestamp = this.now();
    const changed = this.repository.db
      .prepare(
        "UPDATE daily_plan_candidates SET status='rejected',rejected_at=?,rejected_by=?,reject_reason=? WHERE id=? AND user_id=? AND status='candidate'",
      )
      .run(timestamp, this.userId, reason, candidateId, this.userId);
    if (!changed.changes) throw new Error("DAILY_PLAN_CANDIDATE_NOT_PENDING");
    return { candidateId, snapshot: this.snapshot() };
  }

  recordPlanOwnerReview(
    input: Extract<
      ReturnType<typeof personalOperatingActionSchema.parse>,
      { action: "defer_plan" | "request_plan_revision" }
    >,
  ) {
    const db = this.repository.db;
    const existing = db
      .prepare(
        "SELECT * FROM daily_plan_owner_review_events WHERE user_id=? AND client_request_id=?",
      )
      .get(this.userId, input.clientRequestId) as Row | undefined;
    if (existing)
      return {
        duplicate: true,
        eventId: text(existing.id),
        snapshot: this.snapshot(),
      };
    const candidate = db
      .prepare(
        "SELECT id FROM daily_plan_candidates WHERE id=? AND user_id=? AND status='candidate'",
      )
      .get(input.candidateId, this.userId);
    if (!candidate) throw new Error("DAILY_PLAN_CANDIDATE_NOT_PENDING");
    const id = randomUUID(),
      timestamp = this.now();
    db.prepare(
      `INSERT INTO daily_plan_owner_review_events
      (id,user_id,candidate_id,event_type,reason,revisit_at,actor,client_request_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      this.userId,
      input.candidateId,
      input.action === "defer_plan" ? "deferred" : "revision_requested",
      input.reason,
      input.action === "defer_plan" ? (input.revisitAt ?? null) : null,
      this.userId,
      input.clientRequestId,
      timestamp,
    );
    this.audit(
      "operating.daily_plan_owner_reviewed",
      "daily_plan_candidate",
      input.candidateId,
      {
        eventId: id,
        eventType:
          input.action === "defer_plan" ? "deferred" : "revision_requested",
        ownerAuthorized: true,
        candidateStillInactive: true,
      },
    );
    return { duplicate: false, eventId: id, snapshot: this.snapshot() };
  }

  recordBlockCompletion(
    input: Extract<
      ReturnType<typeof personalOperatingActionSchema.parse>,
      { action: "record_block_completion" }
    >,
  ) {
    const db = this.repository.db;
    const existing = db
      .prepare(
        "SELECT * FROM daily_plan_block_events WHERE user_id=? AND client_request_id=?",
      )
      .get(this.userId, input.clientRequestId) as Row | undefined;
    if (existing)
      return {
        duplicate: true,
        eventId: text(existing.id),
        snapshot: this.snapshot(),
      };
    const row = db
      .prepare(
        "SELECT * FROM daily_plans WHERE id=? AND user_id=? AND status='active'",
      )
      .get(input.planId, this.userId) as Row | undefined;
    if (!row) throw new Error("DAILY_PLAN_ACTIVE_OWNER_REQUIRED");
    const plan = normalizeDailyPlan(parse(row.plan_json, {}));
    if (!plan.actions.some((block) => block.blockId === input.blockId))
      throw new Error("DAILY_PLAN_BLOCK_NOT_FOUND");
    const id = randomUUID(),
      timestamp = this.now();
    db.prepare(
      `INSERT INTO daily_plan_block_events
      (id,user_id,plan_id,block_id,event_type,actual_minutes,note,actor,client_request_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      this.userId,
      input.planId,
      input.blockId,
      input.completed ? "completed" : "reopened",
      input.actualMinutes ?? null,
      input.note ?? "",
      this.userId,
      input.clientRequestId,
      timestamp,
    );
    this.audit(
      "operating.daily_plan_block_recorded",
      "daily_plan_block_event",
      id,
      {
        planId: input.planId,
        blockId: input.blockId,
        completed: input.completed,
        formalTruthMutation: false,
      },
    );
    return { duplicate: false, eventId: id, snapshot: this.snapshot() };
  }

  private fallbackFollowUp(
    reflectionId: string,
    input: ReflectionInput,
    state: ReturnType<DailyOperatingStateService["read"]>,
  ): DailyFollowUpBundle {
    const refs = [
      `OR:${reflectionId}`,
      ...state.approvedContext.projectionIds.map((id) => `CTX:${id}`),
    ];
    const limit = [
      "仅为待处理且不可信的候选；必须由所有者审查，不会修改任何正式状态。",
    ];
    return dailyFollowUpBundleSchema.parse({
      candidates: [
        {
          candidateType: "reflection_review",
          summary: input.actualHappened || input.completed,
          suggestedNextStep: input.tomorrowAdjustment,
          sourceRefs: refs,
          confidence: 0.5,
          candidateOnly: true,
          limitations: limit,
        },
        {
          candidateType: "learning_adaptation",
          summary: input.learned || `自述学习内容：${input.completed}`,
          suggestedNextStep: input.harderThanExpected || input.unfinishedReason,
          sourceRefs: refs,
          confidence: 0.42,
          candidateOnly: true,
          limitations: limit,
        },
        {
          candidateType: "decision_review",
          summary: input.decision || "本次复盘没有明确记录重要决策。",
          suggestedNextStep: "先审查决策及其实际结果，再形成稳定的模式结论。",
          sourceRefs: refs,
          confidence: 0.35,
          candidateOnly: true,
          limitations: limit,
        },
        {
          candidateType: "evidence_preparation",
          summary: `根据所有者自述准备的可能证据：${input.completed}`,
          suggestedNextStep:
            "通过现有证据审批流程附加真实产物、评估、测试输出或其他来源。",
          sourceRefs: refs,
          confidence: 0.45,
          candidateOnly: true,
          limitations: ["准备项不是已验证证据，不能更新能力或掌握状态。"],
        },
        {
          candidateType: "digital_twin_signal",
          summary: `单日自述信号：${input.harderThanExpected || input.unfinishedReason}`,
          suggestedNextStep:
            "在提出任何画像解释前，先寻找重复且由所有者确认的观察。",
          sourceRefs: refs,
          confidence: 0.3,
          candidateOnly: true,
          limitations: ["单日自述不能建立稳定特征，也不能更新数字分身。"],
        },
        {
          candidateType: "strategy_alignment_observation",
          summary: state.alignment.confirmed
            ? "今天存在来源匹配且合格的战略与使命投影。"
            : "合格且匹配的投影尚未建立战略与使命一致性。",
          suggestedNextStep: state.alignment.confirmed
            ? "在所有者审查时，将实际执行与已批准方向进行比较。"
            : "先通过现有所有者授权流程投影正式战略与使命，再声明一致性。",
          sourceRefs: refs,
          confidence: state.alignment.confirmed ? 0.55 : 0.4,
          candidateOnly: true,
          limitations: ["这条观察不会修改战略、使命或身份事实。"],
        },
      ],
    });
  }

  private async createFollowUpCandidates(
    reflectionId: string,
    input: ReflectionInput,
    state: ReturnType<DailyOperatingStateService["read"]>,
  ) {
    const context = new ContextEngine(this.repository);
    let bundle = this.fallbackFollowUp(reflectionId, input, state);
    let generationMethod: "ai_router" | "deterministic_v1" = "deterministic_v1";
    let provider = "demo",
      model = "deterministic-daily-close-v1",
      mode: "demo" | "real" = "demo",
      fallbackReason: string | null = null;
    if (context.isRealConfigured()) {
      try {
        const prepared = context.prepare(
          {
            currentPage: "/today",
            currentTask: "把所有者填写的晚间复盘分析为候选",
            currentQuestion: "哪些暂定后续事项需要所有者审查？",
            currentChapter: null,
            currentConversation: [],
          },
          "full",
          { purpose: "reflection", approvedOnly: true },
        );
        const result = await context.complete({
          module: "personal_operating_reflection_candidates_v2",
          taskClass: "cheap_daily",
          maxOutputTokens: 2_200,
          temperature: 0.1,
          reasoningMode: "standard",
          schema: dailyFollowUpBundleSchema,
          schemaName: "dailyFollowUpBundle",
          preparedContext: prepared,
          workingMemory: prepared.packet!.memory.working,
          messages: [
            {
              role: "system",
              content:
                "准确返回六条待处理候选，每种必需类型各一条。严格区分用户自述与推断。不得写入或声明正式记忆、画像、战略、使命、证据、能力、成长、数字分身或掌握事实。",
            },
            {
              role: "user",
              content: `复盘 ${reflectionId}：${JSON.stringify({ actualHappened: input.actualHappened, completed: input.completed, notCompleted: input.unfinishedReason, harderThanExpected: input.harderThanExpected, learned: input.learned, decision: input.decision, tomorrowAdjustment: input.tomorrowAdjustment })}`,
            },
          ],
        });
        bundle = dailyFollowUpBundleSchema.parse(result.parsed);
        generationMethod = "ai_router";
        provider = result.provider;
        model = result.model;
        mode = "real";
      } catch {
        fallbackReason = "provider_failed";
      }
    }
    const allowed = new Set([
      `OR:${reflectionId}`,
      ...state.approvedContext.projectionIds.map((id) => `CTX:${id}`),
    ]);
    if (
      bundle.candidates.some((candidate) =>
        candidate.sourceRefs.some((ref) => !allowed.has(ref)),
      )
    )
      throw new Error("OPERATING_INVALID_REFERENCE");
    const candidateSetId = randomUUID(),
      timestamp = this.now();
    this.repository.db.transaction(() => {
      this.repository.db
        .prepare(
          `INSERT INTO daily_operating_follow_up_candidate_sets
        (id,user_id,reflection_id,client_request_id,source_refs_json,generation_method,provider,model,model_mode,fallback_reason,status,trust_class,context_eligible,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'pending','untrusted',0,?)`,
        )
        .run(
          candidateSetId,
          this.userId,
          reflectionId,
          randomUUID(),
          JSON.stringify([...allowed]),
          generationMethod,
          provider,
          model,
          mode,
          fallbackReason,
          timestamp,
        );
      for (const candidate of bundle.candidates)
        this.repository.db
          .prepare(
            `INSERT INTO daily_operating_follow_up_candidates
        (id,user_id,candidate_set_id,candidate_type,candidate_json,confidence,status,trust_class,context_eligible,formal_mutation_allowed,created_at)
        VALUES (?,?,?,?,?,?,'pending','untrusted',0,0,?)`,
          )
          .run(
            randomUUID(),
            this.userId,
            candidateSetId,
            candidate.candidateType,
            JSON.stringify(candidate),
            candidate.confidence,
            timestamp,
          );
    })();
    return { candidateSetId, generationMethod, fallbackReason };
  }

  async submitReflection(input: ReflectionInput) {
    const db = this.repository.db,
      date = this.day();
    const existing = db
      .prepare(
        "SELECT * FROM operating_reflections WHERE user_id=? AND (client_request_id=? OR reflection_date=?)",
      )
      .get(this.userId, input.clientRequestId, date) as Row | undefined;
    if (existing)
      return {
        duplicate: true,
        reflection: this.snapshot().reflection,
        snapshot: this.snapshot(),
      };
    const state = this.stateService.read(),
      id = randomUUID(),
      timestamp = this.now();
    const actualHappened = input.actualHappened || input.completed;
    const harder = input.harderThanExpected || input.unfinishedReason;
    const learned = input.learned || input.newProblems;
    const decision = input.decision || "没有记录重要决策。";
    db.prepare(
      `INSERT INTO operating_reflections
      (id,user_id,reflection_date,client_request_id,completed_text,unfinished_reason,new_problems,tomorrow_adjustment,source_refs_json,created_at,updated_at,
       actual_happened_text,harder_than_expected,learned_text,decision_text,actual_learning_minutes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      this.userId,
      date,
      input.clientRequestId,
      input.completed,
      input.unfinishedReason,
      input.newProblems,
      input.tomorrowAdjustment,
      JSON.stringify(state.sourceRefs),
      timestamp,
      timestamp,
      actualHappened,
      harder,
      learned,
      decision,
      input.actualLearningMinutes ?? 0,
    );

    const evidenceService = new EvidenceService(this.repository);
    evidenceService.createManual({
      action: "create",
      evidenceType: "self_reflection",
      source: "个人运行闭环晚间复盘",
      description: `实际发生：${actualHappened}\n已完成：${input.completed}\n未完成：${input.unfinishedReason}\n比预期困难：${harder}\n学到：${learned}\n决策：${decision}\n明日调整：${input.tomorrowAdjustment}`,
      relatedAbility: "个人运行纪律",
      capturedAt: timestamp,
      dataKind: "user",
      clientRequestId: input.clientRequestId,
    });
    const evidence = db
      .prepare(
        "SELECT id FROM evidence_items WHERE user_id=? AND source_type='manual' AND source_id=? ORDER BY created_at DESC LIMIT 1",
      )
      .get(this.userId, input.clientRequestId) as { id: string } | undefined;
    if (!evidence) throw new Error("OPERATING_REFLECTION_EVIDENCE_NOT_CREATED");
    db.prepare(
      "UPDATE operating_reflections SET evidence_item_id=?,updated_at=? WHERE id=? AND user_id=?",
    ).run(evidence.id, this.now(), id, this.userId);

    let evidenceAnalysisPending = false;
    try {
      await evidenceService.analyze();
    } catch {
      evidenceAnalysisPending = true;
    }
    const growth = db
      .prepare(
        "SELECT candidate_id FROM evidence_evaluations WHERE evidence_item_id=? ORDER BY created_at DESC LIMIT 1",
      )
      .get(evidence.id) as { candidate_id: string | null } | undefined;
    if (growth?.candidate_id)
      db.prepare(
        "UPDATE operating_reflections SET growth_candidate_id=?,updated_at=? WHERE id=? AND user_id=?",
      ).run(growth.candidate_id, this.now(), id, this.userId);

    let followUpPending = false;
    let followUpCandidateSetId: string | null = null;
    try {
      followUpCandidateSetId = (
        await this.createFollowUpCandidates(id, input, state)
      ).candidateSetId;
    } catch {
      followUpPending = true;
    }
    return {
      duplicate: false,
      analysisPending: evidenceAnalysisPending || followUpPending,
      followUpPending,
      followUpCandidateSetId,
      reflection: this.snapshot().reflection,
      snapshot: this.snapshot(),
    };
  }

  private audit(
    action: string,
    entityType: string,
    entityId: string,
    after: unknown,
  ) {
    this.repository.db
      .prepare(
        "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        this.userId,
        action,
        entityType,
        entityId,
        null,
        JSON.stringify(after),
        this.now(),
      );
  }

  async execute(raw: unknown) {
    const input = personalOperatingActionSchema.parse(raw);
    if (input.action === "generate_brief")
      return this.generateBrief(input.clientRequestId);
    if (input.action === "generate_plan")
      return this.generatePlan(input.energy, input.clientRequestId);
    if (input.action === "approve_plan")
      return this.approvePlan(input.candidateId);
    if (input.action === "reject_plan")
      return this.rejectPlan(input.candidateId, input.reason);
    if (
      input.action === "defer_plan" ||
      input.action === "request_plan_revision"
    )
      return this.recordPlanOwnerReview(input);
    if (input.action === "record_block_completion")
      return this.recordBlockCompletion(input);
    return this.submitReflection(input);
  }
}
