"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, RefreshCw, ShieldCheck } from "lucide-react";

type PlanBlock = {
  blockId?: string;
  blockType:
    | "learning"
    | "review"
    | "project"
    | "mission"
    | "reflection"
    | "research"
    | "administrative"
    | "buffer";
  title: string;
  minutes: number;
  verification: string;
  reason: string;
  linkedMissionId: string | null;
  linkedLearningGoalId: string | null;
  evidenceExpectation: string | null;
  masteryRelationship: string | null;
  priority: string;
  completionStatus?: "pending" | "completed";
  actualMinutes?: number | null;
};
type PlanPayload = {
  title: string;
  actions: PlanBlock[];
  totalMinutes: number;
  rationale: string;
  risk: string;
  sourceRefs: string[];
  confidence: number;
  limitations: string[];
  timeBudget: {
    availableMinutes: number;
    plannedMinutes: number;
    bufferMinutes: number;
    targetUtilization: number;
    weeklyMaximumMinutes: number;
    source: string;
  } | null;
};
type Brief = {
  id: string;
  date: string;
  brief: {
    highestPriority: string;
    activeMission: string;
    learningGoal: string;
    riskReminder: string;
    strategicFocus: string;
    sourceRefs: string[];
    confidence: number;
    limitations: string[];
    todayDirection: string | null;
    strategicAlignment: string | null;
    learningFocus: string | null;
    priorityActions: string[];
    risks: string[];
    cognitivePrompt: string | null;
    intelligenceAvailable: boolean;
    contextProjectionIds: string[];
  };
  mode: string;
  fallbackReason: string | null;
};
type Candidate = {
  id: string;
  energy: number;
  status: "candidate" | "approved" | "rejected";
  plan: PlanPayload;
  fallbackReason: string | null;
  ownerReview: {
    eventType: string;
    reason: string;
    revisitAt: string | null;
  } | null;
};
type Plan = {
  id: string;
  energy: number;
  status: string;
  plan: PlanPayload;
  blocks: PlanBlock[];
  completedBlocks: number;
  totalBlocks: number;
};
type Reflection = {
  id: string;
  actualHappened: string;
  completed: string;
  unfinishedReason: string;
  newProblems: string;
  harderThanExpected: string;
  learned: string;
  decision: string;
  tomorrowAdjustment: string;
  actualLearningMinutes: number;
  evidenceId: string | null;
  growthCandidateId: string | null;
};
type DailyState = {
  strategicDirection: { value: string | null };
  alignment: { confirmed: boolean; reason: string };
  activeMission: {
    id: string;
    title: string;
    priority: string;
    deadline: string;
    evidenceRequirement: string;
    contextProjected: boolean;
  } | null;
  learning: {
    title: string;
    contextProjected: boolean;
    todayMission: {
      objective: string;
      practiceTask: string;
      status: string;
    } | null;
    weakConcepts: Array<{ title: string; mastery: number }>;
    masteryGaps: Array<{ gateType: string; reason: string; status: string }>;
    dueReviews: Array<{ id: string; title: string; dueAt: string }>;
    remediation: Array<{ gateType: string; reason: string }>;
    projectChallenge: { title: string; status: string } | null;
  } | null;
  deadlines: Array<{ type: string; title: string; deadline: string }>;
  constraints: {
    timeBudget: {
      availableMinutes: number;
      plannedMinutes: number;
      bufferMinutes: number;
      targetUtilization: number;
      weeklyMaximumMinutes: number;
      dayType: string;
    } | null;
  };
  approvedContext: { projectionIds: string[] };
  missingInputs: string[];
};
type DailyClose = {
  facts: {
    plannedBlocks: number;
    completedBlocks: number;
    actualLearningMinutes: number;
    missionStatus: string;
    learningStatus: string;
    reviewsCompleted: number;
    evidencePrepared: number;
    verifiedEvidenceCreatedByPlanCompletion: boolean;
    reflectionSubmitted: boolean;
  };
  selfReport: {
    actualHappened: string;
    completed: string;
    notCompleted: string;
    harderThanExpected: string;
    learned: string;
    decision: string;
    tomorrowAdjustment: string;
  } | null;
  aiInference: {
    available: boolean;
    generationMethod: string | null;
    fallbackReason: string | null;
    candidateSetId: string | null;
    candidates: Array<{
      candidateType: string;
      summary: string;
      suggestedNextStep: string;
    }>;
  };
  unresolvedBlockers: string[];
};
type Snapshot = {
  date: string;
  brief: Brief | null;
  candidates: Candidate[];
  plan: Plan | null;
  reflection: Reflection | null;
  activeMission: { id: string; title: string; priority: string } | null;
  dailyState: DailyState;
  dailyClose: DailyClose;
};

const candidateLabels: Record<string, string> = {
  reflection_review: "复盘审查",
  learning_adaptation: "学习调整",
  decision_review: "决策复盘",
  evidence_preparation: "证据准备",
  digital_twin_signal: "数字分身信号",
  strategy_alignment_observation: "战略一致性观察",
};
const blockTypeLabels: Record<string, string> = {
  learning: "学习",
  review: "复习",
  project: "项目",
  mission: "使命",
  reflection: "复盘",
  research: "研究",
  administrative: "整理",
  buffer: "缓冲",
};
const priorityLabels: Record<string, string> = {
  critical: "最高",
  high: "高",
  normal: "普通",
  low: "低",
};
const ownerReviewLabels: Record<string, string> = {
  deferred: "已延后",
  revision_requested: "已要求修改",
  approved: "已批准",
  rejected: "已拒绝",
};

export function PersonalOperatingLoop() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [energy, setEnergy] = useState(3);
  const [actualHappened, setActualHappened] = useState("");
  const [completed, setCompleted] = useState("");
  const [unfinishedReason, setUnfinishedReason] = useState("");
  const [newProblems, setNewProblems] = useState("");
  const [harderThanExpected, setHarderThanExpected] = useState("");
  const [learned, setLearned] = useState("");
  const [decision, setDecision] = useState("");
  const [tomorrowAdjustment, setTomorrowAdjustment] = useState("");
  const [actualLearningMinutes, setActualLearningMinutes] = useState(0);

  async function load() {
    const response = await fetch("/api/personal-operating", {
      cache: "no-store",
    });
    const data = (await response.json()) as Snapshot & { error?: string };
    if (!response.ok) throw new Error(data.error || "每日运行数据暂时不可用");
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setMessage(
            error instanceof Error ? error.message : "每日运行数据暂时不可用",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/personal-operating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        snapshot?: Snapshot;
        duplicate?: boolean;
        analysisPending?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "每日运行操作失败");
      if (data.snapshot) setSnapshot(data.snapshot);
      setMessage(
        data.analysisPending
          ? "原始复盘已保存，待确认分析将在稍后重试。"
          : data.duplicate
            ? "已返回今日现有记录。"
            : success,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "每日运行操作失败");
    } finally {
      setBusy(false);
    }
  }

  const candidate = snapshot?.candidates.find(
    (item) => item.status === "candidate",
  );
  const state = snapshot?.dailyState;
  if (!snapshot && !message)
    return (
      <section
        className="daily-life-panel full-span"
        aria-label="个人每日运行闭环"
      >
        <p>正在读取今日运行状态…</p>
      </section>
    );

  return (
    <section
      className="daily-life-panel full-span operating-command-center"
      aria-label="个人每日运行闭环"
    >
      <div className="section-heading">
        <div>
          <span className="section-kicker">
            个人每日运行 · {snapshot?.date || "今天"}
          </span>
          <h2>现在最重要的事、原因，以及下一步行动</h2>
        </div>
        <button
          className="icon-button"
          aria-label="刷新今日运行状态"
          title="刷新今日运行状态"
          disabled={busy}
          onClick={() =>
            void load()
              .then(setSnapshot)
              .catch((error: unknown) =>
                setMessage(error instanceof Error ? error.message : "刷新失败"),
              )
          }
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="operating-state-strip" aria-label="今日运行状态">
        <div>
          <span>长期方向</span>
          <strong>
            {state?.strategicDirection.value || "缺少已确认战略认知"}
          </strong>
        </div>
        <div>
          <span>当前使命</span>
          <strong>{state?.activeMission?.title || "暂无进行中的使命"}</strong>
          <small>
            {state?.alignment.confirmed
              ? "战略 → 使命来源关系已确认"
              : "当前未声明战略一致性"}
          </small>
        </div>
        <div>
          <span>学习重点</span>
          <strong>
            {state?.learning?.todayMission?.practiceTask ||
              state?.learning?.title ||
              "暂无进行中的学习重点"}
          </strong>
        </div>
        <div>
          <span>时间预算</span>
          <strong>
            {state?.constraints.timeBudget
              ? `计划 ${state.constraints.timeBudget.plannedMinutes} 分钟 / 可用 ${state.constraints.timeBudget.availableMinutes} 分钟`
              : "尚未配置"}
          </strong>
          <small>
            {state?.constraints.timeBudget
              ? `保留缓冲 ${state.constraints.timeBudget.bufferMinutes} 分钟 · 每周上限 ${state.constraints.timeBudget.weeklyMaximumMinutes} 分钟`
              : "缺失信息会明确显示"}
          </small>
        </div>
      </div>

      <div className="daily-life-grid operating-main-grid">
        <article className="morning-brief-vnext">
          <span>
            晨间 · <span>晨间简报</span>
          </span>
          {snapshot?.brief ? (
            <>
              <strong>
                {snapshot.brief.brief.todayDirection ||
                  snapshot.brief.brief.highestPriority}
              </strong>
              <p>
                <b>战略一致性：</b>{" "}
                {snapshot.brief.brief.strategicAlignment ||
                  snapshot.brief.brief.strategicFocus}
              </p>
              <p>
                <b>当前使命：</b> {snapshot.brief.brief.activeMission}
              </p>
              <p>
                <b>学习重点：</b>{" "}
                {snapshot.brief.brief.learningFocus ||
                  snapshot.brief.brief.learningGoal}
              </p>
              {snapshot.brief.brief.priorityActions.length ? (
                <ol>
                  {snapshot.brief.brief.priorityActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
              ) : null}
              {(snapshot.brief.brief.risks.length
                ? snapshot.brief.brief.risks
                : [snapshot.brief.brief.riskReminder]
              ).map((risk) => (
                <p className="operating-risk" key={risk}>
                  <b>风险：</b> {risk}
                </p>
              ))}
              {snapshot.brief.brief.cognitivePrompt ? (
                <blockquote>{snapshot.brief.brief.cognitivePrompt}</blockquote>
              ) : null}
              <small>
                {snapshot.brief.brief.intelligenceAvailable
                  ? "AI 智能可用"
                  : "确定性降级结果"}{" "}
                · 置信度 {Math.round(snapshot.brief.brief.confidence * 100)}% ·{" "}
                {snapshot.brief.brief.contextProjectionIds.length}{" "}
                条合格认知投影
              </small>
            </>
          ) : (
            <p>
              尚未生成晨间简报。生成过程只读，仅使用用途受限的已确认认知与确定性运行事实。
            </p>
          )}
          <div className="daily-life-links">
            <Link href="/missions">查看使命</Link>
            <Link href="/learning">进入学习</Link>
            <Link href="/evidence">审查证据</Link>
          </div>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void send(
                {
                  action: "generate_brief",
                  clientRequestId: crypto.randomUUID(),
                },
                "晨间简报已生成。",
              )
            }
          >
            生成晨间简报
          </button>
        </article>

        <article className="daily-plan-vnext">
          <span>今日 · 已确认日计划</span>
          {snapshot?.plan ? (
            <>
              <strong>{snapshot.plan.plan.title}</strong>
              <p>
                <b>精力：</b> {snapshot.plan.energy}/5 ·{" "}
                {snapshot.plan.plan.totalMinutes} 分钟 · 已完成{" "}
                {snapshot.plan.completedBlocks}/{snapshot.plan.totalBlocks}{" "}
                个任务块
              </p>
              {snapshot.plan.plan.timeBudget ? (
                <p>
                  <b>保护缓冲：</b>{" "}
                  {snapshot.plan.plan.timeBudget.bufferMinutes} 分钟 ·
                  目标利用率{" "}
                  {Math.round(
                    snapshot.plan.plan.timeBudget.targetUtilization * 100,
                  )}
                  %
                </p>
              ) : null}
              <div className="operating-block-list">
                {snapshot.plan.blocks.map((block) => (
                  <article
                    key={block.blockId || block.title}
                    data-status={block.completionStatus}
                  >
                    <header>
                      <span>{blockTypeLabels[block.blockType] || block.blockType}</span>
                      <b>{priorityLabels[block.priority] || block.priority}</b>
                      <small>{block.minutes} 分钟</small>
                    </header>
                    <strong>{block.title}</strong>
                    <p>{block.reason}</p>
                    {block.evidenceExpectation ? (
                      <p>
                        <b>预期证据：</b> {block.evidenceExpectation}
                      </p>
                    ) : null}
                    {block.masteryRelationship ? (
                      <p>
                        <b>掌握边界：</b> {block.masteryRelationship}
                      </p>
                    ) : null}
                    <button
                      className="secondary-button"
                      disabled={busy || !block.blockId}
                      onClick={() =>
                        void send(
                          {
                            action: "record_block_completion",
                            planId: snapshot.plan!.id,
                            blockId: block.blockId,
                            completed: block.completionStatus !== "completed",
                            actualMinutes:
                              block.completionStatus === "completed"
                                ? null
                                : block.minutes,
                            clientRequestId: crypto.randomUUID(),
                          },
                          block.completionStatus === "completed"
                            ? "任务块已重新打开。"
                            : "任务块完成状态已记录；未自动修改证据、能力或掌握状态。",
                        )
                      }
                    >
                      {block.completionStatus === "completed" ? (
                        <>
                          <CheckCircle2 size={14} />
                          重新打开
                        </>
                      ) : (
                        <>
                          <Circle size={14} />
                          标记完成
                        </>
                      )}
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : candidate ? (
            <>
              <strong>{candidate.plan.title}</strong>
              <p>
                <b>建议精力：</b> {candidate.energy}/5 ·{" "}
                {candidate.plan.totalMinutes} 分钟
              </p>
              {candidate.plan.actions.map((action) => (
                <p key={action.blockId || action.title}>
                  <b>
                    {blockTypeLabels[action.blockType] || action.blockType} ·{" "}
                    {action.minutes} 分钟：
                  </b>{" "}
                  {action.title}
                </p>
              ))}
              {candidate.ownerReview ? (
                <p>
                  <b>所有者审查：</b>{" "}
                  {ownerReviewLabels[candidate.ownerReview.eventType] ||
                    candidate.ownerReview.eventType}{" "}
                  ·{" "}
                  {candidate.ownerReview.reason}
                </p>
              ) : null}
              <div className="candidate-actions operating-candidate-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void send(
                      { action: "approve_plan", candidateId: candidate.id },
                      "今日计划已激活。",
                    )
                  }
                >
                  确认今日计划
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void send(
                      {
                        action: "defer_plan",
                        candidateId: candidate.id,
                        reason: "所有者延后处理此建议，未将其激活。",
                        revisitAt: null,
                        clientRequestId: crypto.randomUUID(),
                      },
                      "今日计划建议已延后，仍未激活。",
                    )
                  }
                >
                  稍后处理
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void send(
                      {
                        action: "request_plan_revision",
                        candidateId: candidate.id,
                        reason: "所有者要求缩小范围或改善一致性。",
                        clientRequestId: crypto.randomUUID(),
                      },
                      "已要求修改，当前建议仍未激活。",
                    )
                  }
                >
                  要求修改
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void send(
                      {
                        action: "reject_plan",
                        candidateId: candidate.id,
                        reason: "用户拒绝此今日计划建议。",
                      },
                      "今日计划建议已拒绝。",
                    )
                  }
                >
                  拒绝
                </button>
              </div>
            </>
          ) : (
            <p>
              先设置当前精力，再生成待确认建议；只有所有者明确确认后才会激活。
            </p>
          )}
          {!snapshot?.plan && !candidate ? (
            <label>
              今日精力 {energy}/5
              <select
                aria-label="今日精力"
                value={energy}
                onChange={(event) => setEnergy(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option value={value} key={value}>
                    {value}/5
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!snapshot?.plan && !candidate ? (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void send(
                  {
                    action: "generate_plan",
                    energy,
                    clientRequestId: crypto.randomUUID(),
                  },
                  "今日计划待确认建议已生成。",
                )
              }
            >
              生成今日计划建议
            </button>
          ) : null}
        </article>
      </div>

      <div className="operating-signal-grid">
        <article>
          <span>掌握阻塞项</span>
          {state?.learning?.masteryGaps.length ? (
            state.learning.masteryGaps.map((gap) => (
              <p key={gap.gateType}>
                <b>{gap.gateType}</b> · {gap.reason || gap.status}
              </p>
            ))
          ) : (
            <p>当前目标没有已记录的失败或等待中掌握门槛。</p>
          )}
        </article>
        <article>
          <span>到期复习</span>
          {state?.learning?.dueReviews.length ? (
            state.learning.dueReviews.map((review) => (
              <p key={review.id}>
                <b>{review.title}</b> · {review.dueAt.slice(0, 10)}
              </p>
            ))
          ) : (
            <p>当前没有逾期复习。</p>
          )}
        </article>
        <article>
          <span>证据与截止日期</span>
          <p>
            <b>预期：</b>{" "}
            {state?.activeMission?.evidenceRequirement ||
              "当前使命未记录证据要求。"}
          </p>
          {state?.deadlines.map((deadline) => (
            <p key={`${deadline.type}:${deadline.title}`}>
              {deadline.title} · {deadline.deadline.slice(0, 10)}
            </p>
          ))}
        </article>
      </div>

      <article className="growth-card evening-reflection-vnext">
        <span>晚间 · 晚间复盘</span>
        {snapshot?.reflection ? (
          <>
            <p>
              <b>实际发生：</b> {snapshot.reflection.actualHappened}
            </p>
            <p>
              <b>已完成：</b> {snapshot.reflection.completed}
            </p>
            <p>
              <b>未完成：</b> {snapshot.reflection.unfinishedReason}
            </p>
            <p>
              <b>超出预期的困难：</b> {snapshot.reflection.harderThanExpected}
            </p>
            <p>
              <b>今日所学：</b> {snapshot.reflection.learned}
            </p>
            <p>
              <b>关键决策：</b> {snapshot.reflection.decision}
            </p>
            <p>
              <b>明日调整：</b> {snapshot.reflection.tomorrowAdjustment}
            </p>
            <small>
              {snapshot.reflection.growthCandidateId
                ? `待确认成长证据建议：${snapshot.reflection.growthCandidateId}`
                : "复盘证据分析待处理。"}
            </small>
          </>
        ) : (
          <div className="reflection-form reflection-form-vnext">
            <label>
              今天实际发生了什么？
              <textarea
                aria-label="今天实际发生的事情"
                value={actualHappened}
                onChange={(event) => setActualHappened(event.target.value)}
              />
            </label>
            <label>
              今天完成了什么？
              <textarea
                aria-label="今天完成的内容"
                value={completed}
                onChange={(event) => setCompleted(event.target.value)}
              />
            </label>
            <label>
              未完成内容与原因
              <textarea
                aria-label="未完成内容与原因"
                value={unfinishedReason}
                onChange={(event) => setUnfinishedReason(event.target.value)}
              />
            </label>
            <label>
              出现的新问题
              <textarea
                aria-label="出现的新问题"
                value={newProblems}
                onChange={(event) => setNewProblems(event.target.value)}
              />
            </label>
            <label>
              哪些事情比预期更难？
              <textarea
                aria-label="超出预期的困难"
                value={harderThanExpected}
                onChange={(event) => setHarderThanExpected(event.target.value)}
              />
            </label>
            <label>
              今天学到了什么？
              <textarea
                aria-label="今天学到的内容"
                value={learned}
                onChange={(event) => setLearned(event.target.value)}
              />
            </label>
            <label>
              哪个决策最重要？
              <textarea
                aria-label="今天的重要决策"
                value={decision}
                onChange={(event) => setDecision(event.target.value)}
              />
            </label>
            <label>
              明日调整建议
              <textarea
                aria-label="明日调整建议"
                value={tomorrowAdjustment}
                onChange={(event) => setTomorrowAdjustment(event.target.value)}
              />
            </label>
            <label>
              实际学习分钟数
              <input
                aria-label="实际学习分钟数"
                type="number"
                min={0}
                max={720}
                value={actualLearningMinutes}
                onChange={(event) =>
                  setActualLearningMinutes(Number(event.target.value))
                }
              />
            </label>
            <button
              disabled={
                busy ||
                [
                  completed,
                  unfinishedReason,
                  newProblems,
                  tomorrowAdjustment,
                ].some((value) => value.trim().length < 3)
              }
              onClick={() =>
                void send(
                  {
                    action: "submit_reflection",
                    actualHappened: actualHappened || undefined,
                    completed,
                    unfinishedReason,
                    newProblems,
                    harderThanExpected: harderThanExpected || undefined,
                    learned: learned || undefined,
                    decision: decision || undefined,
                    tomorrowAdjustment,
                    actualLearningMinutes,
                    clientRequestId: crypto.randomUUID(),
                  },
                  "晚间复盘已保存，待确认后续建议与证据建议已可审查。",
                )
              }
            >
              提交晚间复盘
            </button>
          </div>
        )}
      </article>

      <article className="growth-card daily-close-panel" aria-label="今日总结">
        <div className="section-heading">
          <div>
            <span className="section-kicker">今日总结</span>
            <h3>系统事实、用户自述与待确认推断始终分开。</h3>
          </div>
          <ShieldCheck size={18} />
        </div>
        <div className="daily-close-grid">
          <section>
            <span>系统事实</span>
            <p>
              计划：
              <b>
                {snapshot?.dailyClose.facts.completedBlocks || 0}/
                {snapshot?.dailyClose.facts.plannedBlocks || 0}
              </b>
            </p>
            <p>
              实际学习：
              <b>
                {snapshot?.dailyClose.facts.actualLearningMinutes || 0} 分钟
              </b>
            </p>
            <p>
              完成复习：
              <b>{snapshot?.dailyClose.facts.reviewsCompleted || 0}</b>
            </p>
            <p>
              已准备证据：
              <b>{snapshot?.dailyClose.facts.evidencePrepared || 0}</b> ·
              自动验证：<b>否</b>
            </p>
          </section>
          <section>
            <span>所有者自述</span>
            {snapshot?.dailyClose.selfReport ? (
              <>
                <p>{snapshot.dailyClose.selfReport.actualHappened}</p>
                <p>
                  <b>明日：</b>{" "}
                  {snapshot.dailyClose.selfReport.tomorrowAdjustment}
                </p>
              </>
            ) : (
              <p>尚未提交晚间复盘。</p>
            )}
          </section>
          <section>
            <span>待确认推断</span>
            {snapshot?.dailyClose.aiInference.candidates.length ? (
              snapshot.dailyClose.aiInference.candidates.map((item) => (
                <details key={item.candidateType}>
                  <summary>
                    {candidateLabels[item.candidateType] || item.candidateType}
                  </summary>
                  <p>{item.summary}</p>
                  <small>{item.suggestedNextStep}</small>
                </details>
              ))
            ) : (
              <p>暂无后续待确认建议。</p>
            )}
            <small>
              {snapshot?.dailyClose.aiInference.available
                ? "AI 路由分析"
                : snapshot?.dailyClose.aiInference.generationMethod
                  ? "确定性候选降级"
                  : "AI 智能不可用"}{" "}
              · 不会自动进入正式认知
            </small>
          </section>
        </div>
        {snapshot?.dailyClose.unresolvedBlockers.length ? (
          <p className="operating-risk">
            <b>未解决阻塞：</b>{" "}
            {snapshot.dailyClose.unresolvedBlockers.join(" · ")}
          </p>
        ) : null}
      </article>
      {message ? (
        <p role="status" className="form-message">
          {message}
        </p>
      ) : null}
    </section>
  );
}
