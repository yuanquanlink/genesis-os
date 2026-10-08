"use client";

import Link from "next/link";
import { useState } from "react";

type Plan = { goal: string; why: string; evidenceIds: string[]; actions: string[]; avoid: string[]; successMetric: string; risk: string };
type Gap = { name: string; currentLevel: number; targetLevel: number; action: string; verification: string; evidenceIds: string[] };
type Generated = { currentPosition: string; targetPosition: string; opportunity: string; risk: string; priorityRanking: string[]; abilityGaps: Gap[]; plans: Record<string, Plan>; confidence: number; limitations: string[] };
type Candidate = { id: string; status: "pending" | "approved" | "rejected"; generatedStrategy: Generated; confidence: number; evidenceIds: string[]; created_at: string; reject_reason?: string | null };
type Strategy = { id: string; diagnosis: Omit<Generated, "plans" | "confidence" | "limitations">; strategies: Record<string, Plan>; confidence: number; evidenceIds: string[]; created_at: string };
type Snapshot = { strategy: Strategy | null; strategies: Strategy[]; candidates: Candidate[]; simulation: { analysis: { recommendedOption: string; reason: string; opposingView: string; wrongChoiceRisk: string; options: Array<{ name: string; shortTerm: string; longTerm: string; goalFit: number }> } } | null; ceoReview: { review: { achievement: string; waste: string; drift: string; nextFocus: string; strategyExecutionRate?: number } } | null; feedback: Array<{ strategy_id: string }> };

const id = () => crypto.randomUUID();

function CandidateView({ candidate, busy, onApprove, onReject }: { candidate: Candidate; busy: boolean; onApprove: () => Promise<void>; onReject: () => Promise<void> }) {
  const strategy = candidate.generatedStrategy;
  return <section className="growth-card" aria-label="Strategy candidate">
    <span className="section-kicker">Strategy Candidate · pending approval</span>
    <h2>Review before it becomes formal</h2>
    <p>{strategy.currentPosition}</p>
    <p><b>90-day direction:</b> {strategy.plans.d90?.goal}</p>
    <p><b>Evidence:</b> {candidate.evidenceIds.join(", ") || "No cited evidence"}</p>
    <p><b>Confidence:</b> {Math.round(candidate.confidence * 100)}%</p>
    <div className="cognition-actions">
      <button disabled={busy} onClick={() => void onApprove()}>Approve candidate</button>
      <button disabled={busy} onClick={() => void onReject()}>Reject candidate</button>
    </div>
    <small>Approval creates a read-only formal strategy. It never changes Goal, Ability, or Evidence.</small>
  </section>;
}

function FormalStrategy({ strategy }: { strategy: Strategy }) {
  return <>
    <section className="growth-card" aria-label="Current strategy">
      <div className="section-heading"><div><span className="section-kicker">Approved Strategy</span><h2>Current strategic position</h2></div><Link href={`/strategy/${strategy.id}`}>View details</Link></div>
      <p>{strategy.diagnosis.currentPosition}</p>
      <p><b>Target:</b> {strategy.diagnosis.targetPosition}</p>
      <p><b>Opportunity:</b> {strategy.diagnosis.opportunity}</p>
      <p><b>Risk:</b> {strategy.diagnosis.risk}</p>
      <p><b>Priority:</b> {strategy.diagnosis.priorityRanking.join(" > ")}</p>
    </section>
    <section className="growth-card"><h2>Top ability gaps</h2>{strategy.diagnosis.abilityGaps.map((gap) => <article key={gap.name}><strong>{gap.name}: {gap.currentLevel}/5 to {gap.targetLevel}/5</strong><p>{gap.action}</p><small>Verify with: {gap.verification} · {gap.evidenceIds.join(", ")}</small></article>)}</section>
    <section className="recommendation-grid" aria-label="Strategic plans">{Object.entries(strategy.strategies).map(([period, plan]) => <article key={period}><span>{period}</span><strong>{plan.goal}</strong><p>{plan.why}</p><p>Actions: {plan.actions.join("; ")}</p><p>Avoid: {plan.avoid.join("; ") || "None"}</p><small>Success: {plan.successMetric} · Risk: {plan.risk}</small></article>)}</section>
  </>;
}

export function StrategyBrain({ initialSnapshot }: { initialSnapshot: unknown }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot as Snapshot);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const candidate = snapshot.candidates.find((item) => item.status === "pending") || null;

  async function post(path: string, body?: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json() as { error?: string; snapshot?: Snapshot; duplicate?: boolean };
      if (!response.ok) throw new Error(data.error || "Strategy request failed");
      if (data.snapshot) setSnapshot(data.snapshot);
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Strategy request failed");
      return null;
    } finally { setBusy(false); }
  }

  async function generate() {
    const result = await post("/api/strategy", { action: "generate", clientRequestId: id() });
    if (result) setMessage(result.duplicate ? "Existing pending candidate loaded." : "Candidate generated. Review it before approval.");
  }
  async function approve() {
    if (!candidate) return;
    const result = await post(`/api/strategy/candidates/${candidate.id}/approve`);
    if (result) setMessage("Candidate approved and formal strategy created.");
  }
  async function reject() {
    if (!candidate) return;
    const reason = window.prompt("Why does this strategy not fit?") || "User rejected this candidate.";
    const result = await post(`/api/strategy/candidates/${candidate.id}/reject`, { reason });
    if (result) setMessage("Candidate rejected. No formal strategy was created.");
  }
  async function simulate() {
    const result = await post("/api/strategy", { action: "simulate", clientRequestId: id(), question });
    if (result) setMessage("Decision simulation saved.");
  }
  async function ceoReview() {
    const result = await post("/api/strategy", { action: "ceo_review", clientRequestId: id() });
    if (result) setMessage("Weekly CEO review saved.");
  }

  const formal = snapshot.strategy;
  const simulation = snapshot.simulation?.analysis;
  const ceo = snapshot.ceoReview?.review;
  return <main className="cognition-page">
    <span className="section-kicker">Genesis Strategic Brain</span><h1>Strategic decision center</h1>
    <p>Strategic output is evidence-backed and stays a candidate until you approve it. It never changes your formal Goal, Ability, or Evidence.</p>
    <section className="cognition-actions"><button disabled={busy || Boolean(candidate)} onClick={() => void generate()}>Generate strategy candidate</button><button disabled={busy} onClick={() => void ceoReview()}>Generate weekly CEO review</button></section>
    {message ? <p role="status">{message}</p> : null}
    {candidate ? <CandidateView candidate={candidate} busy={busy} onApprove={approve} onReject={reject} /> : null}
    {formal ? <FormalStrategy strategy={formal} /> : <section className="empty"><strong>No approved strategy</strong><p>Generate a candidate, review its evidence, and explicitly approve it.</p></section>}
    <section className="growth-card"><h2>Decision simulator</h2><textarea aria-label="Decision question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Should I learn X or complete Y project?" /><button disabled={busy || question.trim().length < 5} onClick={() => void simulate()}>Compare three options</button>{simulation ? <><p><b>Recommendation:</b> {simulation.recommendedOption} - {simulation.reason}</p><p><b>Counterpoint:</b> {simulation.opposingView}</p><p><b>Wrong-choice risk:</b> {simulation.wrongChoiceRisk}</p>{simulation.options.map((option) => <article key={option.name}><strong>{option.name}</strong><p>{option.shortTerm} / {option.longTerm} / goal fit {Math.round(option.goalFit * 100)}%</p></article>)}</> : null}</section>
    {ceo ? <section className="growth-card"><h2>Weekly CEO review</h2><p><b>Achievement:</b> {ceo.achievement}</p><p><b>Waste:</b> {ceo.waste}</p><p><b>Strategic drift:</b> {ceo.drift}</p><p><b>Next focus:</b> {ceo.nextFocus}</p><p><b>Strategy execution rate:</b> {Math.round((ceo.strategyExecutionRate || 0) * 100)}%</p></section> : null}
  </main>;
}
