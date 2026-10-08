"use client";

import Link from "next/link";
import { useState } from "react";

type Detail = { strategy: { id: string; diagnosis: { currentPosition?: string; targetPosition?: string; abilityGaps?: Array<{ name: string; currentLevel: number; targetLevel: number; action: string }> }; strategies: Record<string, { goal: string; actions: string[]; avoid: string[]; successMetric: string; risk: string }>; evidenceIds: string[]; confidence: number; created_at: string }; candidate: { status: string; approved_at?: string | null; approved_by?: string | null } | null; feedback: Array<{ id: string; feedback_type: string; content: string; impact: number; created_at: string }>; history: Array<{ id: string; created_at: string; confidence: number }> };
const statusLabel: Record<string, string> = { pending: "待处理", approved: "已批准", rejected: "已拒绝" };
const feedbackLabel: Record<string, string> = { effective: "有效", normal: "一般", wrong: "不正确" };
const periodLabel: Record<string, string> = { d7: "7 天", d30: "30 天", d90: "90 天", d365: "365 天" };

export function StrategyDetail({ initialDetail }: { initialDetail: unknown }) {
  const [detail, setDetail] = useState(initialDetail as Detail);
  const [content, setContent] = useState("");
  const [feedbackType, setFeedbackType] = useState<"effective" | "normal" | "wrong">("effective");
  const [impact, setImpact] = useState(3);
  const [status, setStatus] = useState("");
  async function submitFeedback() {
    const response = await fetch(`/api/strategy/${detail.strategy.id}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackType, content, impact }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setStatus(data.error || "反馈保存失败"); return; }
    const refreshed = await fetch(`/api/strategy/${detail.strategy.id}`).then((result) => result.json()) as Detail;
    setDetail(refreshed); setContent(""); setStatus("反馈已保存。 ");
  }
  const { strategy } = detail;
  return <main className="cognition-page">
    <Link href="/strategy">返回战略大脑</Link><span className="section-kicker">已批准战略详情</span><h1>{strategy.diagnosis.targetPosition || "正式战略"}</h1>
    <section className="growth-card"><p>{strategy.diagnosis.currentPosition}</p><p><b>置信度：</b> {Math.round(strategy.confidence * 100)}%</p><p><b>创建时间：</b> {new Date(strategy.created_at).toLocaleString("zh-CN")}</p><p><b>证据：</b> {strategy.evidenceIds.join(", ") || "未引用证据"}</p><p><b>审批：</b> {detail.candidate ? statusLabel[detail.candidate.status] || detail.candidate.status : "历史正式战略"}{detail.candidate?.approved_by ? ` · 批准人 ${detail.candidate.approved_by}` : ""}</p></section>
    <section className="growth-card"><h2>能力差距</h2>{strategy.diagnosis.abilityGaps?.map((gap) => <article key={gap.name}><strong>{gap.name}：{gap.currentLevel}/5 → {gap.targetLevel}/5</strong><p>{gap.action}</p></article>)}</section>
    <section className="recommendation-grid">{Object.entries(strategy.strategies).map(([period, plan]) => <article key={period}><span>{periodLabel[period] || period}</span><strong>{plan.goal}</strong><p>{plan.actions.join("；")}</p><p>避免：{plan.avoid.join("；")}</p><small>成功标准：{plan.successMetric} · 风险：{plan.risk}</small></article>)}</section>
    <section className="growth-card"><h2>执行反馈</h2><label>反馈类型<select aria-label="反馈类型" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as "effective" | "normal" | "wrong")}><option value="effective">有效</option><option value="normal">一般</option><option value="wrong">不正确</option></select></label><label>影响程度（1-5）<input aria-label="反馈影响程度" type="number" min={1} max={5} value={impact} onChange={(event) => setImpact(Number(event.target.value))} /></label><textarea aria-label="战略反馈" value={content} onChange={(event) => setContent(event.target.value)} placeholder="哪些有效、哪些无效，以及发生了什么变化？" /><button disabled={content.trim().length < 2} onClick={() => void submitFeedback()}>保存反馈</button>{status ? <p role="status">{status}</p> : null}{detail.feedback.map((feedback) => <article key={feedback.id}><strong>{feedbackLabel[feedback.feedback_type] || feedback.feedback_type} · {feedback.impact}/5</strong><p>{feedback.content}</p><small>{new Date(feedback.created_at).toLocaleString("zh-CN")}</small></article>)}</section>
    <section className="growth-card"><h2>战略历史</h2>{detail.history.map((entry) => <p key={entry.id}><Link href={`/strategy/${entry.id}`}>{entry.id.slice(0, 8)}</Link> · {Math.round(entry.confidence * 100)}% · {new Date(entry.created_at).toLocaleDateString("zh-CN")}</p>)}</section>
  </main>;
}
