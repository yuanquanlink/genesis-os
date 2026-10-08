"use client";

import Link from "next/link";
import { useState } from "react";

type Detail = { strategy: { id: string; diagnosis: { currentPosition?: string; targetPosition?: string; abilityGaps?: Array<{ name: string; currentLevel: number; targetLevel: number; action: string }> }; strategies: Record<string, { goal: string; actions: string[]; avoid: string[]; successMetric: string; risk: string }>; evidenceIds: string[]; confidence: number; created_at: string }; candidate: { status: string; approved_at?: string | null; approved_by?: string | null } | null; feedback: Array<{ id: string; feedback_type: string; content: string; impact: number; created_at: string }>; history: Array<{ id: string; created_at: string; confidence: number }> };

export function StrategyDetail({ initialDetail }: { initialDetail: unknown }) {
  const [detail, setDetail] = useState(initialDetail as Detail);
  const [content, setContent] = useState("");
  const [feedbackType, setFeedbackType] = useState<"effective" | "normal" | "wrong">("effective");
  const [impact, setImpact] = useState(3);
  const [status, setStatus] = useState("");
  async function submitFeedback() {
    const response = await fetch(`/api/strategy/${detail.strategy.id}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackType, content, impact }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setStatus(data.error || "Feedback failed"); return; }
    const refreshed = await fetch(`/api/strategy/${detail.strategy.id}`).then((result) => result.json()) as Detail;
    setDetail(refreshed); setContent(""); setStatus("Feedback saved.");
  }
  const { strategy } = detail;
  return <main className="cognition-page">
    <Link href="/strategy">Back to strategic brain</Link><span className="section-kicker">Approved strategy detail</span><h1>{strategy.diagnosis.targetPosition || "Formal strategy"}</h1>
    <section className="growth-card"><p>{strategy.diagnosis.currentPosition}</p><p><b>Confidence:</b> {Math.round(strategy.confidence * 100)}%</p><p><b>Created:</b> {new Date(strategy.created_at).toLocaleString()}</p><p><b>Evidence:</b> {strategy.evidenceIds.join(", ") || "No cited evidence"}</p><p><b>Approval:</b> {detail.candidate?.status || "Legacy formal strategy"}{detail.candidate?.approved_by ? ` by ${detail.candidate.approved_by}` : ""}</p></section>
    <section className="growth-card"><h2>Ability gaps</h2>{strategy.diagnosis.abilityGaps?.map((gap) => <article key={gap.name}><strong>{gap.name}: {gap.currentLevel}/5 to {gap.targetLevel}/5</strong><p>{gap.action}</p></article>)}</section>
    <section className="recommendation-grid">{Object.entries(strategy.strategies).map(([period, plan]) => <article key={period}><span>{period}</span><strong>{plan.goal}</strong><p>{plan.actions.join("; ")}</p><p>Avoid: {plan.avoid.join("; ")}</p><small>Success: {plan.successMetric} · Risk: {plan.risk}</small></article>)}</section>
    <section className="growth-card"><h2>Execution feedback</h2><label>Feedback type<select aria-label="Feedback type" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as "effective" | "normal" | "wrong")}><option value="effective">effective</option><option value="normal">normal</option><option value="wrong">wrong</option></select></label><label>Impact (1-5)<input aria-label="Feedback impact" type="number" min={1} max={5} value={impact} onChange={(event) => setImpact(Number(event.target.value))} /></label><textarea aria-label="Strategy feedback" value={content} onChange={(event) => setContent(event.target.value)} placeholder="What worked, what did not, and what changed?" /><button disabled={content.trim().length < 2} onClick={() => void submitFeedback()}>Save feedback</button>{status ? <p role="status">{status}</p> : null}{detail.feedback.map((feedback) => <article key={feedback.id}><strong>{feedback.feedback_type} · {feedback.impact}/5</strong><p>{feedback.content}</p><small>{new Date(feedback.created_at).toLocaleString()}</small></article>)}</section>
    <section className="growth-card"><h2>Strategy history</h2>{detail.history.map((entry) => <p key={entry.id}><Link href={`/strategy/${entry.id}`}>{entry.id.slice(0, 8)}</Link> · {Math.round(entry.confidence * 100)}% · {new Date(entry.created_at).toLocaleDateString()}</p>)}</section>
  </main>;
}
