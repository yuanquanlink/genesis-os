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
      if (!response.ok) throw new Error(data.error || "Monthly Review generation failed");
      setSnapshot(data.snapshot); setMessage(data.unavailable || (data.duplicate ? "This month's Review Candidate already exists." : "Monthly Review Candidate generated."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Monthly Review generation failed"); }
    finally { setBusy(false); }
  }

  return <main className="cognition-page" aria-label="Monthly Growth Review">
    <span className="section-kicker">Genesis / monthly review candidate</span><h1>Monthly Growth Review</h1>
    <p>Monthly analysis is read-only. Each conclusion must cite verified Evidence, and it cannot modify Goal, Ability, Evidence, or Strategy.</p>
    <section className="growth-card"><div className="section-heading"><div><span>Current period: {snapshot.currentMonth}</span><h2>Evidence-linked monthly insight</h2></div><button className="primary-button" disabled={busy} onClick={() => void generate()}>Generate monthly review</button></div><p>Verified Evidence this month: {snapshot.approvedEvidenceCount}</p>{message ? <p role="status">{message}</p> : null}</section>
    {review ? <ReviewView record={review} /> : <section className="empty"><strong>No Monthly Review Candidate</strong><p>Record and verify evidence this month, then generate a review.</p></section>}
  </main>;
}

function ReviewView({ record }: { record: Record }) {
  const review = record.review;
  return <>
    <section className="growth-card" aria-label="Monthly Review Candidate"><span className="section-kicker">Monthly Review Candidate / {record.monthKey}</span><h2>{review.monthlyGoal.goal}</h2><p><b>Goal source:</b> {review.monthlyGoal.source}</p><p><b>Completion:</b> {review.completionSummary.summary}</p><p><b>Completed items:</b> {review.completionSummary.completedItems}</p><p><b>Incomplete reason:</b> {review.completionSummary.incompleteReason}</p><p><b>Confidence:</b> {Math.round(record.confidence * 100)}%</p><p><b>Evidence:</b> {record.evidenceIds.join(", ")}</p>{record.fallbackReason ? <p><b>Fallback:</b> {record.fallbackReason}</p> : null}</section>
    <section className="growth-card"><h2>Ability and project progress</h2>{review.abilityDelta.map((item) => <article key={item.ability}><strong>{item.ability}: {item.beforeLevel}/5 to {item.currentLevel}/5</strong><p>{item.explanation}</p><small>{item.evidenceIds.join(", ")}</small></article>)}{review.projectProgress.map((item) => <article key={item.project}><strong>{item.project} / {item.status}</strong><p>{item.progress}</p><p>Next verification: {item.nextVerification}</p><small>{item.evidenceIds.join(", ")}</small></article>)}</section>
    <section className="recommendation-grid"><article><span>Learning investment</span><strong>{Math.round(review.learningInvestment.missionCompletionRate * 100)}% mission completion</strong><p>{review.learningInvestment.summary}</p><small>{review.learningInvestment.missionCount} missions / {review.learningInvestment.sessionCount} sessions</small></article><article><span>Strategy execution</span><strong>{Math.round(review.strategyExecution.executionRate * 100)}%</strong><p>{review.strategyExecution.summary}</p></article><article><span>Largest problem</span><strong>{review.largestProblem.problem}</strong><p>{review.largestProblem.reasoning}</p></article></section>
    <section className="growth-card"><h2>Next month recommendations</h2>{review.nextMonthRecommendations.map((item) => <article key={item.action}><strong>{item.action}</strong><p>{item.whyNow}</p><p>Success: {item.successMetric}</p><p>Risk: {item.risk}</p><small>{item.evidenceIds.join(", ")}</small></article>)}<p><b>Limitations:</b> {review.limitations.join(" ")}</p></section>
  </>;
}
