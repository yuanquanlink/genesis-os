import { generateDailyLearningReport } from "@/lib/ai/daily-learning-loop";
import { DAILY_LEARNING_REPORT_PROMPT_VERSION } from "@/lib/ai/prompt-versions";
import {
  DailyLearningRepository,
  type DailyPlanningState,
} from "@/lib/db/daily-learning-repository";
import { EvidenceRepository } from "@/lib/db/evidence-repository";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  dailyLearningLoopActionSchema,
  morningBriefSchema,
  type EveningReflectionInput,
} from "@/lib/domain/daily-learning-loop";

const text = (
  record: Record<string, unknown> | null,
  key: string,
  fallback = "",
) => String(record?.[key] ?? fallback).trim();

export class DailyLearningService {
  private readonly daily: DailyLearningRepository;
  private readonly evidence: EvidenceRepository;

  constructor(private readonly repository: ProfileRepository) {
    this.daily = new DailyLearningRepository(repository);
    this.evidence = new EvidenceRepository(repository);
  }

  snapshot(goalId?: string) {
    return this.daily.snapshot(goalId);
  }

  ensureMorningBrief(goalId: string, date = this.localDate()) {
    const state = this.daily.planningState(goalId, date);
    return this.daily.saveBrief(goalId, date, this.buildMorningBrief(state));
  }

  private buildMorningBrief(state: DailyPlanningState) {
    const strategy = this.approvedStrategy();
    const goal = text(state.goal, "title", "当前学习目标");
    const targetAbility = text(state.goal, "targetAbility", goal);
    const phase = text(state.phase, "title", "尚未生成五阶段课程");
    const weakest = text(state.weakestConcept, "title", "尚无已解锁概念数据");
    const missionTask = text(state.mission, "learningObjective");
    const firstReview = state.dueReviews[0];
    const challengeTitle = text(state.challenge, "challengeTitle");
    const challengeStatus = text(state.challenge, "status");
    const masteryFailed = state.masteryFailedGates[0];
    const masteryWaiting = text(state.masteryWaitingGate, "gateType");
    const primaryTask = masteryFailed
      ? `完成 Mastery ${masteryFailed} Gate 的定向补强，并保留新的可追溯 attempt`
      : missionTask ||
        (firstReview
          ? `完成“${text(firstReview, "nodeTitle")}”到期复习并保存原始回答`
          : challengeTitle && challengeStatus === "needs_work"
            ? `修复工程挑战“${challengeTitle}”的首个失败标准`
            : `生成今日学习任务，并围绕“${weakest}”完成一个可验收小闭环`);
    const previousStatus = text(
      state.previousMission,
      "resultStatus",
      text(state.previousMission, "status"),
    );
    const previousGap = !state.previousMission
      ? "没有可验证的昨日学习记录，今天不能假定昨日已掌握。"
      : previousStatus === "completed"
        ? text(state.previousMission, "misconception") ||
          "昨日学习任务已记录完成，但仍需延迟复习或迁移测试确认保持。"
        : `昨日学习任务状态为 ${previousStatus || "已计划"}，未形成完整验收闭环。`;
    const reviewTasks = [
      ...(masteryWaiting
        ? [
            `Mastery ${masteryWaiting} · 等待至 ${text(state.masteryWaitingGate, "nextRetryAt", "到期日")}`,
          ]
        : []),
      ...state.dueReviews.map(
        (item) =>
          `${text(item, "nodeTitle")} · 到期原因：${text(item, "reason", "按复习调度到期")}`,
      ),
    ].slice(0, 3);
    const challengeGap = challengeTitle
      ? state.challengeFailedCriteria.length
        ? `${state.challengeFailedCriteria.length} 项未通过：${state.challengeFailedCriteria.slice(0, 3).join("、")}`
        : `当前状态 ${challengeStatus || "active"}；${text(state.challenge, "resultStatus") === "pass" ? "机器、答辩和独立性已达标。" : "仍需提交并完成机器验收、答辩和独立性判断。"}`
      : "尚未创建工程挑战；基础与应用阶段可以先积累测试和实践证据。";
    const engineeringTask = challengeTitle
      ? `${challengeTitle} · ${challengeGap}`
      : `围绕“${targetAbility}”保留可运行产物、测试输出和失败路径。`;
    const latestEstimate = state.estimates[0];
    const previousEstimate = state.estimates[1];
    const latestMinutes = Number(latestEstimate?.realisticMinutes || 0);
    const previousMinutes = Number(previousEstimate?.realisticMinutes || 0);
    const estimateChange = latestEstimate
      ? previousEstimate
        ? `现实估时 ${previousMinutes} → ${latestMinutes} 分钟（${latestMinutes > previousMinutes ? "增加" : latestMinutes < previousMinutes ? "减少" : "不变"} ${Math.abs(latestMinutes - previousMinutes)} 分钟）。`
        : `当前现实估时 ${latestMinutes} 分钟，预计完成 ${text(latestEstimate, "estimatedFinishDate", "日期待校准")}。`
      : "尚无基于真实表现校准的学习工期。";
    const latestAction = text(state.latestAdjustment, "action");
    const largestRisk = state.masteryFailedGates.length
      ? `Mastery 仍有硬门槛未通过：${state.masteryFailedGates.join("、")}。高 aggregate 或课程完成不能绕过它们。`
      : state.recentCompletionRate < 0.5 && state.previousMission
        ? `近 7 条学习任务完成率仅 ${Math.round(state.recentCompletionRate * 100)}%，任务规模或时间承诺可能失真。`
        : latestAction &&
            latestAction !== "continue" &&
            latestAction !== "advance_phase"
          ? `最近课程调整为 ${latestAction}：${text(state.latestAdjustment, "reason", "需要先处理薄弱前置或增加练习")}`
          : state.challengeFailedCriteria.length
            ? `工程挑战仍有 ${state.challengeFailedCriteria.length} 个机器标准未通过，不能用学习时长替代交付结果。`
            : `“${weakest}”是当前已解锁概念中证据最弱的一项。`;
    const whyToday = masteryFailed
      ? `服务器端 Mastery Decision 将 ${masteryFailed} 标记为失败；今天只修复该弱项，不重置整门课程。`
      : missionTask
        ? `这是已持久化的今日学习任务；它对应当前阶段“${phase}”，并优先处理最弱概念“${weakest}”。`
        : firstReview
          ? `Review Scheduler 已将“${text(firstReview, "nodeTitle")}”标记到期；延迟检索比继续输入新内容更能验证保持。`
          : `当前没有到期复习，先用“${weakest}”产生一条可评估证据，再扩大学习范围。`;
    return morningBriefSchema.parse({
      currentGoal: `${goal} · ${targetAbility}${state.targetAbilityNode ? ` · 正式能力 ${Number(state.targetAbilityNode.currentLevel)}/5` : " · 尚无正式能力节点"}`,
      currentPhase: phase,
      primaryTask,
      whyToday: strategy
        ? `${whyToday} Current strategy focus: ${strategy.d7Action}. Avoid: ${strategy.avoidAction}.`
        : whyToday,
      previousGap,
      reviewTasks,
      engineeringTask,
      weakestConcept: weakest,
      challengeGap,
      estimateChange,
      largestRisk,
      estimatedMinutes: Number(
        state.mission?.estimatedMinutes || state.goal.dailyMinutes || 0,
      ),
      sourceRefs: [
        ...state.sourceRefs,
        ...(strategy ? [`STRATEGY:${strategy.id}`] : []),
      ],
      confidence: Math.min(
        0.9,
        0.52 +
          (state.mission ? 0.12 : 0) +
          (state.weakestConcept ? 0.08 : 0) +
          (state.estimates.length ? 0.06 : 0) +
          (state.challenge ? 0.06 : 0),
      ),
    });
  }

  private approvedStrategy() {
    const row = this.repository.db
      .prepare(
        "SELECT strategy.id,strategy.strategies_json FROM growth_strategies strategy JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id WHERE strategy.user_id=? AND candidate.status='approved' ORDER BY strategy.created_at DESC LIMIT 1",
      )
      .get("genesis-owner") as
      { id: string; strategies_json: string } | undefined;
    if (!row) return null;
    try {
      const plans = JSON.parse(row.strategies_json) as {
        d7?: { actions?: string[]; avoid?: string[] };
        d90?: { goal?: string };
      };
      return {
        id: row.id,
        d7Action: plans.d7?.actions?.[0] || "Finish one verifiable task.",
        avoidAction: plans.d7?.avoid?.[0] || "Do not expand scope.",
        d90Goal: plans.d90?.goal || "Complete a verifiable project.",
      };
    } catch {
      return null;
    }
  }

  async act(raw: unknown) {
    const input = dailyLearningLoopActionSchema.parse(raw);
    if (input.action === "refresh_morning")
      return this.ensureMorningBrief(input.goalId);
    return this.submitEvening(input);
  }

  private async submitEvening(input: EveningReflectionInput) {
    const reportDate = this.localDate();
    this.ensureMorningBrief(input.goalId, reportDate);
    const initialState = this.daily.planningState(input.goalId, reportDate);
    let reflection = this.daily.saveReflection(
      input,
      reportDate,
      initialState.sourceRefs,
    );
    const duplicate = Boolean(reflection.duplicate);
    const reflectionId = String(reflection.id);
    if (!reflection.timelineEntryId) {
      try {
        const entry = this.repository.createEntry({
          content: [
            `晚间学习复盘（${reportDate}）：实际学习 ${input.actualMinutes} 分钟。`,
            `完成：${input.completed}`,
            `卡住：${input.stuck || "未记录"}`,
            `最大收获：${input.biggestGain}`,
            `未完成：${input.unfinished || "无"}`,
            `原因：${input.unfinishedReason || "未记录"}`,
            `明日可用时间：${input.tomorrowAvailableMinutes} 分钟。`,
          ].join("\n"),
          category: "reflection",
          tags: [
            "Daily Learning Loop",
            text(initialState.goal, "title").slice(0, 24),
          ],
          importance: 4,
          occurredAt: new Date().toISOString(),
          allowAi: false,
          clientRequestId: input.clientRequestId,
          dataKind: "user",
        });
        this.daily.linkTimelineEntry(reflectionId, String(entry.id));
      } catch (error) {
        console.error(
          "[DailyLearningLoop] reflection timeline handoff failed",
          { reflectionId, error },
        );
      }
    }
    this.evidence.syncSources();
    reflection = this.daily.reflection(
      input.goalId,
      reportDate,
    ) as typeof reflection;
    let report = this.daily.report(input.goalId, reportDate);
    if (!report) {
      const state = this.daily.planningState(input.goalId, reportDate);
      const generated = await generateDailyLearningReport({
        state,
        reflection,
        repository: this.repository,
      });
      this.logAi(generated.meta);
      report = this.daily.saveReport(
        input.goalId,
        reflectionId,
        reportDate,
        generated.report,
        {
          provider: generated.meta.provider,
          model: generated.meta.model,
          modelMode: generated.meta.mode,
          promptVersion: DAILY_LEARNING_REPORT_PROMPT_VERSION,
        },
      );
    }
    const planDate = this.nextDate(reportDate);
    let plan = this.daily.nextPlan(input.goalId, planDate);
    if (!plan) {
      const nextState = this.daily.planningState(input.goalId, planDate);
      plan = this.daily.saveNextPlan(
        this.buildNextPlan(
          nextState,
          report as Record<string, unknown>,
          input,
          planDate,
        ),
      );
    }
    return {
      reflection,
      report,
      plan,
      duplicate,
      growthGraphUpdated: false,
      evidenceApprovalRequired: true,
      snapshot: this.snapshot(input.goalId),
    };
  }

  private buildNextPlan(
    state: DailyPlanningState,
    report: Record<string, unknown>,
    input: EveningReflectionInput,
    planDate: string,
  ) {
    const reportActions = Array.isArray(report.tomorrowActions)
      ? report.tomorrowActions.map(String)
      : [];
    const reviewAction = state.dueReviews[0]
      ? `复习“${text(state.dueReviews[0], "nodeTitle")}”，保存原始回答、用时、信心和提示次数。`
      : "";
    const challengeAction =
      state.challenge && state.challengeFailedCriteria[0]
        ? `修复工程挑战标准“${state.challengeFailedCriteria[0]}”，重新运行机器验收并保存差异。`
        : state.challenge
          ? `推进工程挑战“${text(state.challenge, "challengeTitle")}”的一项可机器验证交付。`
          : "";
    const actions = [
      reportActions[0],
      reviewAction || reportActions[1],
      challengeAction || reportActions[2],
    ]
      .filter(Boolean)
      .slice(0, 3);
    while (actions.length < 3)
      actions.push(
        `用 ${Math.max(10, Math.floor(input.tomorrowAvailableMinutes / 3))} 分钟完成一个可复现的小实践，并保存失败路径。`,
      );
    const adjustment = state.latestAdjustment
      ? `${text(state.latestAdjustment, "action")}：${text(state.latestAdjustment, "reason")}`
      : "暂无课程调整记录";
    const sourceRefs = [
      ...new Set([
        ...state.sourceRefs,
        `REPORT:${String(report.id)}`,
        ...state.dueReviews.map((item) => `REVIEW:${String(item.id)}`),
        ...(state.challenge ? [`CHALLENGE:${String(state.challenge.id)}`] : []),
      ]),
    ];
    return {
      goalId: input.goalId,
      reportId: String(report.id),
      planDate,
      primaryFocus: text(report, "tomorrowFocus", actions[0]),
      availableMinutes: input.tomorrowAvailableMinutes,
      actions,
      reviewTaskIds: state.dueReviews.map((item) => String(item.id)),
      challengeIds: state.challenge ? [String(state.challenge.id)] : [],
      completionRate: state.recentCompletionRate,
      rationale: `计划受 Review Scheduler、Adaptive Curriculum（${adjustment}）、Project Challenge、明日 ${input.tomorrowAvailableMinutes} 分钟和近 7 日 ${Math.round(state.recentCompletionRate * 100)}% 完成率共同约束。`,
      sourceRefs,
      confidence: Math.min(
        0.9,
        0.56 +
          (state.dueReviews.length ? 0.08 : 0) +
          (state.latestAdjustment ? 0.08 : 0) +
          (state.challenge ? 0.08 : 0),
      ),
    };
  }

  private logAi(meta: {
    provider: string;
    taskClass: string;
    requestId?: string | null;
    model: string;
    mode: "demo" | "real";
    latencyMs: number;
    providerSucceeded: boolean;
    fallbackReason?: string;
    inputTokens?: number;
    outputTokens?: number;
  }) {
    this.repository.logAi({
      purpose: "daily_learning_report",
      provider: meta.provider,
      taskClass: meta.taskClass,
      requestId: meta.requestId,
      promptVersion: DAILY_LEARNING_REPORT_PROMPT_VERSION,
      model: meta.model,
      mode: meta.mode,
      latencyMs: meta.latencyMs,
      success: meta.providerSucceeded,
      errorCode: meta.fallbackReason,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
    });
  }

  private localDate(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  private nextDate(date: string) {
    const value = new Date(`${date}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
  }
}
