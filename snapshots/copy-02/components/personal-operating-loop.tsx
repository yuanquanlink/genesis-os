"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type Brief = { id: string; date: string; brief: { highestPriority: string; activeMission: string; learningGoal: string; riskReminder: string; strategicFocus: string; sourceRefs: string[]; confidence: number; limitations: string[] }; mode: string; fallbackReason: string | null };
type Candidate = { id: string; energy: number; status: "candidate" | "approved" | "rejected"; plan: { title: string; actions: Array<{ title: string; minutes: number; verification: string }>; totalMinutes: number; rationale: string; risk: string; sourceRefs: string[]; confidence: number; limitations: string[] }; fallbackReason: string | null };
type Plan = { id: string; energy: number; status: string; plan: Candidate["plan"] };
type Reflection = { id: string; completed: string; unfinishedReason: string; newProblems: string; tomorrowAdjustment: string; evidenceId: string | null; growthCandidateId: string | null };
type Snapshot = { date: string; brief: Brief | null; candidates: Candidate[]; plan: Plan | null; reflection: Reflection | null; activeMission: { id: string; title: string; priority: string } | null };

export function PersonalOperatingLoop() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [energy, setEnergy] = useState(3);
  const [completed, setCompleted] = useState("");
  const [unfinishedReason, setUnfinishedReason] = useState("");
  const [newProblems, setNewProblems] = useState("");
  const [tomorrowAdjustment, setTomorrowAdjustment] = useState("");

  async function load() {
    const response = await fetch("/api/personal-operating", { cache: "no-store" });
    const data = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(data.error || "Personal Operating Loop is unavailable");
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => { if (!cancelled) setSnapshot(data); }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Personal Operating Loop is unavailable"); });
    return () => { cancelled = true; };
  }, []);

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/personal-operating", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { snapshot?: Snapshot; duplicate?: boolean; analysisPending?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Personal Operating action failed");
      if (data.snapshot) setSnapshot(data.snapshot);
      setMessage(data.analysisPending ? "Raw reflection was saved. Evidence analysis is pending retry." : data.duplicate ? "Today's existing record was returned." : success);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Personal Operating action failed"); }
    finally { setBusy(false); }
  }

  const candidate = snapshot?.candidates.find((item) => item.status === "candidate");
  if (!snapshot && !message) {
    return <section className="daily-life-panel full-span" aria-label="Personal Operating Loop"><p>Loading your daily operating loop...</p></section>;
  }
  return <section className="daily-life-panel full-span" aria-label="Personal Operating Loop">
    <div className="section-heading"><div><span className="section-kicker">Personal Operating Loop / {snapshot?.date || "today"}</span><h2>Plan only after Genesis shows the evidence-bound daily context.</h2></div><button className="icon-button" aria-label="Refresh personal operating loop" title="Refresh personal operating loop" disabled={busy} onClick={() => void load().then(setSnapshot).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Refresh failed"))}><RefreshCw size={16} /></button></div>
    <div className="daily-life-grid">
      <article><span>Morning Brief</span>{snapshot?.brief ? <><strong>{snapshot.brief.brief.highestPriority}</strong><p><b>Active Mission:</b> {snapshot.brief.brief.activeMission}</p><p><b>Learning goal:</b> {snapshot.brief.brief.learningGoal}</p><p><b>Risk:</b> {snapshot.brief.brief.riskReminder}</p><p><b>Strategy:</b> {snapshot.brief.brief.strategicFocus}</p><small>{Math.round(snapshot.brief.brief.confidence * 100)}% confidence / {snapshot.brief.brief.sourceRefs.join(", ")}</small></> : <p>No Morning Brief yet. Generation is read-only.</p>}<div className="daily-life-links"><Link href="/missions">Open missions</Link><Link href="/evidence">Review evidence</Link></div><button className="secondary-button" disabled={busy} onClick={() => void send({ action: "generate_brief", clientRequestId: crypto.randomUUID() }, "Morning Brief generated.")}>Generate Morning Brief</button></article>
      <article><span>Adaptive Daily Planner</span>{snapshot?.plan ? <><strong>{snapshot.plan.plan.title}</strong><p><b>Energy:</b> {snapshot.plan.energy}/5 / {snapshot.plan.plan.totalMinutes} min</p>{snapshot.plan.plan.actions.map((action) => <p key={action.title}><b>{action.minutes} min:</b> {action.title}</p>)}</> : candidate ? <><strong>{candidate.plan.title}</strong><p><b>Candidate energy:</b> {candidate.energy}/5 / {candidate.plan.totalMinutes} min</p>{candidate.plan.actions.map((action) => <p key={action.title}><b>{action.minutes} min:</b> {action.title}</p>)}<div className="candidate-actions"><button disabled={busy} onClick={() => void send({ action: "approve_plan", candidateId: candidate.id }, "Daily Plan activated.")}>Confirm Daily Plan</button><button disabled={busy} onClick={() => void send({ action: "reject_plan", candidateId: candidate.id, reason: "User rejected this daily plan candidate." }, "Daily Plan Candidate rejected.")}>Reject</button></div></> : <p>Set your current energy, then generate a candidate. It stays inactive until you confirm it.</p>} {!snapshot?.plan && !candidate ? <label>Energy {energy}/5<select aria-label="Today energy" value={energy} onChange={(event) => setEnergy(Number(event.target.value))}>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{value}/5</option>)}</select></label> : null}{!snapshot?.plan && !candidate ? <button className="secondary-button" disabled={busy} onClick={() => void send({ action: "generate_plan", energy, clientRequestId: crypto.randomUUID() }, "Daily Plan Candidate generated.")}>Generate Daily Plan Candidate</button> : null}</article>
    </div>
    <article className="growth-card"><span>Evening Reflection</span>{snapshot?.reflection ? <><p><b>Completed:</b> {snapshot.reflection.completed}</p><p><b>Unfinished reason:</b> {snapshot.reflection.unfinishedReason}</p><p><b>Tomorrow:</b> {snapshot.reflection.tomorrowAdjustment}</p><small>{snapshot.reflection.growthCandidateId ? `Pending Growth Evidence Candidate: ${snapshot.reflection.growthCandidateId}` : "Reflection Evidence analysis is pending."}</small></> : <div className="reflection-form"><label>Completed<textarea aria-label="Operating reflection completed" value={completed} onChange={(event) => setCompleted(event.target.value)} /></label><label>Unfinished reason<textarea aria-label="Operating reflection unfinished reason" value={unfinishedReason} onChange={(event) => setUnfinishedReason(event.target.value)} /></label><label>New problems<textarea aria-label="Operating reflection new problems" value={newProblems} onChange={(event) => setNewProblems(event.target.value)} /></label><label>Tomorrow adjustment<textarea aria-label="Operating reflection tomorrow adjustment" value={tomorrowAdjustment} onChange={(event) => setTomorrowAdjustment(event.target.value)} /></label><button disabled={busy || [completed, unfinishedReason, newProblems, tomorrowAdjustment].some((value) => value.trim().length < 3)} onClick={() => void send({ action: "submit_reflection", completed, unfinishedReason, newProblems, tomorrowAdjustment, clientRequestId: crypto.randomUUID() }, "Evening Reflection saved. Reflection Evidence Candidate generated for review.")}>Save Evening Reflection</button></div>}</article>
    {message ? <p role="status" className="form-message">{message}</p> : null}
  </section>;
}
