"use client";

import { useState } from "react";
import type { MonthlyReview } from "@/lib/domain/monthly-review";

type Record = { id: string; monthKey: string; review: MonthlyReview; evidenceIds: string[]; confidence: number; provider: string; mode: string; fallbackReason: string | null; createdAt: string };
type Snapshot = { currentMonth: string; reviews: Record[]; approvedEvidenceCount: number };

export function MonthlyGrowthReview({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const review = snapshot.reviews[0];

  async function generate() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/monthly-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", clientRequestId: crypto.randomUUID() }) });
      const data = await response.json() as { snapshot: Snapshot; duplicate: boolean; unavailable?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "月度成长复盘生成失败");
      setSnapshot(data.snapshot); setMessage(data.unavailable || (data.duplicate ? "本月复盘待确认建议已存在。" : "月度成长复盘建议已生成。"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "月度成长复盘生成失败"); }
    finally { setBusy(false); }
  }

  return <main className="cognition-page" aria-label="月度成长复盘">
    <span className="section-kicker">Genesis · 月度复盘待确认建议</span><h1>月度成长复盘</h1>
    <p>月度分析保持只读。每项结论必须引用已验证证据，且不能修改目标、能力、证据或战略。</p>
    <section className="growth-card"><div className="section-heading"><div><span>当前周期：{snapshot.currentMonth}</span><h2>由证据支持的月度洞察</h2></div><button className="primary-button" disabled={busy} onClick={() => void generate()}>生成月度复盘</button></div><p>本月已验证证据：{snapshot.approvedEvidenceCount}</p>{message ? <p role="status">{message}</p> : null}</section>
    {review ? <ReviewView record={review} /> : <section className="empty"><strong>暂无月度复盘建议</strong><p>先在本月记录并验证证据，再生成复盘。</p></section>}
  </main>;
}

function ReviewView({ record }: { record: Record }) {
  const review = record.review;
  return <>
    <section className="growth-card" aria-label="月度复盘待确认建议"><span className="section-kicker">月度复盘建议 · {record.monthKey}</span><h2>{review.monthlyGoal.goal}</h2><p><b>目标来源：</b> {review.monthlyGoal.source}</p><p><b>完成情况：</b> {review.completionSummary.summary}</p><p><b>已完成事项：</b> {review.completionSummary.completedItems}</p><p><b>未完成原因：</b> {review.completionSummary.incompleteReason}</p><p><b>置信度：</b> {Math.round(record.confidence * 100)}%</p><details><summary>查看证据与降级信息</summary><p><b>证据：</b> {record.evidenceIds.join(", ")}</p>{record.fallbackReason ? <p><b>降级原因：</b> {record.fallbackReason}</p> : null}</details></section>
    <section className="growth-card"><h2>能力与项目进展</h2>{review.abilityDelta.map((item) => <article key={item.ability}><strong>{item.ability}：{item.beforeLevel}/5 → {item.currentLevel}/5</strong><p>{item.explanation}</p><small>{item.evidenceIds.join(", ")}</small></article>)}{review.projectProgress.map((item) => <article key={item.project}><strong>{item.project} · {item.status}</strong><p>{item.progress}</p><p>下一次验证：{item.nextVerification}</p><small>{item.evidenceIds.join(", ")}</small></article>)}</section>
    <section className="recommendation-grid"><article><span>学习投入</span><strong>使命完成率 {Math.round(review.learningInvestment.missionCompletionRate * 100)}%</strong><p>{review.learningInvestment.summary}</p><small>{review.learningInvestment.missionCount} 个使命 · {review.learningInvestment.sessionCount} 次学习</small></article><article><span>战略执行</span><strong>{Math.round(review.strategyExecution.executionRate * 100)}%</strong><p>{review.strategyExecution.summary}</p></article><article><span>最大问题</span><strong>{review.largestProblem.problem}</strong><p>{review.largestProblem.reasoning}</p></article></section>
    <section className="growth-card"><h2>下月建议</h2>{review.nextMonthRecommendations.map((item) => <article key={item.action}><strong>{item.action}</strong><p>{item.whyNow}</p><p>成功标准：{item.successMetric}</p><p>风险：{item.risk}</p><small>{item.evidenceIds.join(", ")}</small></article>)}<p><b>限制：</b> {review.limitations.join(" ")}</p></section>
  </>;
}
