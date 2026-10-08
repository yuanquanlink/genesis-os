"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type DailyLife = {
  date: string;
  morning: {
    highestPriority: string;
    activeMission: {
      id: string;
      title: string;
      priority: string;
      deadline: string;
      dailyTasks: string[];
      evidenceRequirement: string;
    } | null;
    currentStrategy: string;
    learningTask: string;
    projectTask: string;
    knowledgePrompt: string;
    growthFocus: string;
    proactiveNextStep: string;
    risks: string[];
    yesterdayCarryover: string;
  };
  evening: {
    completed: string[];
    learningGain: string;
    projectProgress: string;
    unfinishedReason: string;
    strategicAlignment: string;
    adjustment: string;
    abilityChanges: string[];
    newEvidence: Array<{
      id: string;
      description: string;
      status: string;
      ability: string;
    }>;
    missionCompletion: string;
  };
};

const priorityLabels: Record<string, string> = {
  critical: "最高",
  high: "高",
  normal: "普通",
  low: "低",
};
const alignmentLabels: Record<string, string> = {
  aligned: "一致",
  partial: "部分一致",
  off_track: "偏离",
  not_assessed: "尚未评估",
};
const evidenceStatusLabels: Record<string, string> = {
  pending: "待分析",
  needs_review: "需审查",
  verified: "已验证",
  rejected: "已拒绝",
};

export function DailyLifeLoop() {
  const [state, setState] = useState<DailyLife | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const response = await fetch("/api/daily-life", { cache: "no-store" });
      const data = (await response.json()) as DailyLife & { error?: string };
      if (!response.ok)
        throw new Error(data.error || "每日生活闭环数据暂时不可用");
      setState(data);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "每日生活闭环数据暂时不可用",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/daily-life", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as DailyLife & { error?: string };
        if (!response.ok)
          throw new Error(data.error || "每日生活闭环数据暂时不可用");
        return data;
      })
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "每日生活闭环数据暂时不可用",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!state && !error)
    return (
      <section className="daily-life-panel full-span" aria-label="每日生活闭环">
        <p>正在读取每日生活闭环…</p>
      </section>
    );
  return (
    <section className="daily-life-panel full-span" aria-label="每日生活闭环">
      <div className="section-heading">
        <div>
          <span className="section-kicker">
            每日生活闭环 · {state?.date || "今天"}
          </span>
          <h2>今天要形成可追溯证据，而不只是完成活动。</h2>
        </div>
        <button
          className="icon-button"
          aria-label="刷新每日生活闭环"
          title="刷新每日生活闭环"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
      {state ? (
        <div className="daily-life-grid">
          <article>
            <span>最高优先级</span>
            <strong>{state.morning.highestPriority}</strong>
            {state.morning.activeMission ? (
              <>
                <p>
                  <b>当前使命：</b> {state.morning.activeMission.title}（
                  {priorityLabels[state.morning.activeMission.priority] ||
                    state.morning.activeMission.priority}）
                </p>
                <p>
                  <b>使命任务：</b>{" "}
                  {state.morning.activeMission.dailyTasks.join("；")}
                </p>
                <p>
                  <b>所需证据：</b>{" "}
                  {state.morning.activeMission.evidenceRequirement}
                </p>
                <p>
                  <b>使命截止：</b>{" "}
                  {new Date(
                    state.morning.activeMission.deadline,
                  ).toLocaleDateString("zh-CN")}
                </p>
              </>
            ) : (
              <p>
                <b>当前使命：</b>暂无用户确认的使命。
              </p>
            )}
            <p>
              <b>战略：</b> {state.morning.currentStrategy}
            </p>
            <p>
              <b>学习：</b> {state.morning.learningTask}
            </p>
            <p>
              <b>项目：</b> {state.morning.projectTask}
            </p>
            <p>
              <b>成长重点：</b> {state.morning.growthFocus}
            </p>
            <p>
              <b>知识提示：</b> {state.morning.knowledgePrompt}
            </p>
            <p>
              <b>每周洞察：</b> {state.morning.proactiveNextStep}
            </p>
            <p>
              <b>昨日延续：</b> {state.morning.yesterdayCarryover}
            </p>
            <p>
              <b>风险：</b> {state.morning.risks.join("；")}
            </p>
          </article>
          <article>
            <span>晚间证据</span>
            <p>
              <b>已完成：</b>{" "}
              {state.evening.completed.length
                ? state.evening.completed.join("；")
                : "今天尚未记录用户活动。"}
            </p>
            <p>
              <b>使命：</b> {state.evening.missionCompletion}
            </p>
            <p>
              <b>学习收获：</b> {state.evening.learningGain}
            </p>
            <p>
              <b>项目进展：</b> {state.evening.projectProgress}
            </p>
            <p>
              <b>未完成原因：</b> {state.evening.unfinishedReason}
            </p>
            <p>
              <b>战略一致性：</b>{" "}
              {alignmentLabels[state.evening.strategicAlignment] ||
                state.evening.strategicAlignment}
            </p>
            <p>
              <b>明日调整：</b> {state.evening.adjustment}
            </p>
            <p>
              <b>已批准能力变化：</b>{" "}
              {state.evening.abilityChanges.join("；") || "无"}
            </p>
            <p>
              <b>新增证据：</b>{" "}
              {state.evening.newEvidence.length
                ? state.evening.newEvidence
                    .map(
                      (item) =>
                        `${item.ability}：${evidenceStatusLabels[item.status] || item.status}`,
                    )
                    .join("；")
                : "无"}
            </p>
            <div className="daily-life-links">
              <Link href="/missions">查看使命</Link>
              <Link href="/today-learning">进入学习闭环</Link>
              <Link href="/self-input">记录生活输入</Link>
              <Link href="/knowledge">打开知识库</Link>
              <Link href="/evidence">审查证据</Link>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
