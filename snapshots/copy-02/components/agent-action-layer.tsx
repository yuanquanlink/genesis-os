"use client";

import { useState } from "react";

type Candidate = { id: string; title: string; description: string; sourceGoal: string; priority: string; deadline: string; evidenceRequirement: string; dailyTasks: string[]; evidenceIds: string[]; confidence: number; status: "candidate" | "approved" | "rejected"; mode: string; fallbackReason: string | null };
type Mission = { id: string; title: string; description: string; sourceGoal: string; strategyId: string; status: string; priority: string; deadline: string; evidenceRequirement: string; dailyTasks: string[]; completedAt: string | null };
type Link = { missionId: string; evidenceId: string; growthCandidateId: string | null; completionSummary: string };
type Snapshot = { candidates: Candidate[]; missions: Mission[]; evidence: Link[] };

export function AgentActionLayer({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [completion, setCompletion] = useState<Record<string, string>>({});

  async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { snapshot?: Snapshot; error?: string; unavailable?: string; duplicate?: boolean; growthCandidateId?: string | null; analysisPending?: boolean };
    if (!response.ok) throw new Error(data.error || "Mission request failed");
    if (data.snapshot) setSnapshot(data.snapshot);
    return data;
  }

  async function run(body: Record<string, unknown>, success: string) {
    setBusy(true); setMessage("");
    try {
      const data = await send(body);
      setMessage(data.unavailable || (data.analysisPending ? "Mission completed and raw Evidence saved. Evidence analysis is pending retry." : data.duplicate ? "Existing Mission Candidate returned." : success));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Mission request failed"); }
    finally { setBusy(false); }
  }

  const pending = snapshot.candidates.filter((candidate) => candidate.status === "candidate");
  const active = snapshot.missions.filter((mission) => mission.status === "active");
  return <main className="cognition-page" aria-label="Agent Action Layer">
    <span className="section-kicker">Genesis / user-confirmed execution</span><h1>Agent Action Layer</h1>
    <p>Genesis can propose one mission from an approved Strategy. It becomes active only after your confirmation; completing it creates Evidence and a pending Evidence Candidate, never a direct Ability update.</p>
    <section className="growth-card"><div className="section-heading"><div><span>Strategy &rarr; Mission Candidate &rarr; Confirm &rarr; Evidence</span><h2>Turn strategy into a bounded delivery loop</h2></div><button className="primary-button" disabled={busy} onClick={() => void run({ action: "generate", clientRequestId: crypto.randomUUID() }, "Mission Candidate generated.")}>Generate Mission Candidate</button></div>{message ? <p role="status">{message}</p> : null}</section>
    <section className="growth-card" aria-label="Mission Candidates"><h2>Mission Candidates</h2>{pending.length ? <div className="candidate-grid">{pending.map((candidate) => <article key={candidate.id}><div className="candidate-title"><span>{candidate.priority}</span><small>{Math.round(candidate.confidence * 100)}% confidence</small></div><strong>{candidate.title}</strong><p>{candidate.description}</p><p><b>Goal:</b> {candidate.sourceGoal}</p><p><b>Deadline:</b> {new Date(candidate.deadline).toLocaleDateString()}</p><p><b>Evidence:</b> {candidate.evidenceRequirement}</p><small>Context refs: {candidate.evidenceIds.join(", ")}</small><div className="candidate-actions"><button disabled={busy} onClick={() => void run({ action: "approve", candidateId: candidate.id }, "Mission activated.")}>Confirm Mission</button><button disabled={busy} onClick={() => void run({ action: "reject", candidateId: candidate.id, reason: "User rejected this Mission Candidate." }, "Mission Candidate rejected.")}>Reject</button></div></article>)}</div> : <p>No pending Mission Candidates.</p>}</section>
    <section className="growth-card" aria-label="Active Missions"><h2>Active Missions</h2>{active.length ? <div className="evidence-list">{active.map((mission) => <article className="evidence-item-card" key={mission.id}><div className="evidence-item-heading"><div><strong>{mission.title}</strong><p>{mission.description}</p></div><span className="evidence-status verified">{mission.priority}</span></div><p><b>Daily tasks:</b> {mission.dailyTasks.join("; ")}</p><p><b>Required evidence:</b> {mission.evidenceRequirement}</p><p><b>Deadline:</b> {new Date(mission.deadline).toLocaleDateString()}</p><label>Completion evidence<textarea aria-label={`Completion evidence for ${mission.title}`} value={completion[mission.id] || ""} onChange={(event) => setCompletion({ ...completion, [mission.id]: event.target.value })} placeholder="What did you actually complete? Include the artifact, verification, and remaining limit." /></label><div className="candidate-actions"><button disabled={busy || (completion[mission.id] || "").trim().length < 10} onClick={() => void run({ action: "complete", missionId: mission.id, completionSummary: completion[mission.id], clientRequestId: crypto.randomUUID() }, "Mission completed. Evidence Candidate generated for user review.")}>Complete and create Evidence</button><button disabled={busy} onClick={() => void run({ action: "fail", missionId: mission.id }, "Mission marked failed.")}>Mark failed</button></div></article>)}</div> : <p>No active Mission. Confirm a candidate to begin a bounded delivery loop.</p>}</section>
    <section className="growth-card"><h2>Mission Evidence</h2>{snapshot.evidence.length ? snapshot.evidence.map((link) => <article key={`${link.missionId}:${link.evidenceId}`}><strong>Evidence {link.evidenceId}</strong><p>{link.completionSummary}</p><small>{link.growthCandidateId ? `Pending Growth Evidence Candidate: ${link.growthCandidateId}` : "Evidence analysis pending"}</small></article>) : <p>No Mission Evidence yet.</p>}</section>
  </main>;
}
