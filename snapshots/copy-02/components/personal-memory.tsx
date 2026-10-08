"use client";

import { useState } from "react";

type Candidate = { id: string; memoryType: string; content: string; reasoning: string; sourceKnowledgeIds: string[]; importance: number; confidence: number; status: "pending" | "approved" | "rejected"; provider: string; mode: string; fallbackReason: string | null; rejectReason: string | null };
type Profile = { id: string; memoryType: string; content: string; sourceKnowledgeIds: string[]; importance: number; confidence: number; confirmedAt: string };
type Ranked = { id: string; content: string; sourceKind: "confirmed_memory" | "raw_knowledge"; score: number };
type Snapshot = { profile: Profile[]; candidates: Candidate[]; ranked: Ranked[]; rawKnowledgeCount: number };

const label: Record<string, string> = {
  long_term_goal: "Long-term goal", stable_preference: "Stable preference", learning_pattern: "Learning pattern", project_direction: "Project direction", confirmed_ability_trait: "Confirmed ability trait",
};

export function PersonalMemory({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(body?: Record<string, unknown>, search = "") {
    const response = await fetch(search ? `/api/memory?q=${encodeURIComponent(search)}` : "/api/memory", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await response.json() as { snapshot?: Snapshot; error?: string; unavailable?: string; created?: number; duplicate?: boolean };
    if (!response.ok) throw new Error(data.error || "Personal memory request failed");
    if (data.snapshot) setSnapshot(data.snapshot);
    return data;
  }

  async function consolidate() {
    setBusy(true); setMessage("");
    try {
      const data = await request({ action: "consolidate", clientRequestId: crypto.randomUUID() });
      setMessage(data.unavailable || (data.duplicate ? "This consolidation request already exists." : data.created ? `${data.created} Memory Candidate(s) generated.` : "No new Memory Candidates were needed."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Memory consolidation failed"); }
    finally { setBusy(false); }
  }

  async function decide(candidateId: string, action: "approve" | "reject") {
    setBusy(true); setMessage("");
    try {
      await request(action === "approve" ? { action, candidateId } : { action, candidateId, reason: "User rejected this memory candidate." });
      setMessage(action === "approve" ? "Memory Candidate confirmed into Long-term Memory." : "Memory Candidate rejected.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Memory decision failed"); }
    finally { setBusy(false); }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const data = await request(undefined, query); setMessage(`Ranked ${data.snapshot?.ranked.length || 0} memory record(s) by relevance, recency, importance, and confidence.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Memory search failed"); }
    finally { setBusy(false); }
  }

  const pending = snapshot.candidates.filter((candidate) => candidate.status === "pending");
  return <main className="cognition-page" aria-label="Personal Memory Intelligence">
    <span className="section-kicker">Genesis / long-term personal memory</span><h1>Personal Memory Intelligence</h1>
    <p>Raw knowledge can become a Memory Candidate, but only your confirmation writes Long-term Memory. This does not change formal Goal, Ability, Evidence, or Strategy.</p>
    <section className="growth-card"><div className="section-heading"><div><span>Raw Knowledge Base records: {snapshot.rawKnowledgeCount}</span><h2>Consolidate safely</h2></div><button className="primary-button" disabled={busy} onClick={() => void consolidate()}>Create Memory Candidates</button></div>{message ? <p role="status">{message}</p> : null}</section>
    <section className="growth-card"><form onSubmit={search} className="cognition-reflection"><label>Search ranked memory<input aria-label="Search ranked memory" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="FastAPI, project, learning habit..." /></label><button className="secondary-button" disabled={busy}>Search</button></form><div className="evidence-list">{snapshot.ranked.map((memory) => <article className="evidence-item-card" key={`${memory.sourceKind}:${memory.id}`}><strong>{memory.sourceKind === "confirmed_memory" ? "Confirmed long-term memory" : "Raw Knowledge Base record"}</strong><p className="evidence-description">{memory.content}</p><small>Retrieval score: {Math.round(memory.score * 100)}%</small></article>)}</div></section>
    <section className="growth-card" aria-label="Memory Candidates"><h2>Memory Candidates</h2>{pending.length ? <div className="candidate-grid">{pending.map((candidate) => <article key={candidate.id}><div className="candidate-title"><span>{label[candidate.memoryType]}</span><small>{Math.round(candidate.confidence * 100)}% confidence</small></div><strong>{candidate.content}</strong><p>{candidate.reasoning}</p><small>Sources: {candidate.sourceKnowledgeIds.join(", ")}</small><small>Importance: {Math.round(candidate.importance * 100)}% / {candidate.mode}</small>{candidate.fallbackReason ? <small>Fallback: {candidate.fallbackReason}</small> : null}<div className="candidate-actions"><button disabled={busy} onClick={() => void decide(candidate.id, "approve")}>Confirm memory</button><button disabled={busy} onClick={() => void decide(candidate.id, "reject")}>Reject</button></div></article>)}</div> : <p>No pending Memory Candidates.</p>}</section>
    <section className="growth-card" aria-label="Long-term Memory"><h2>Long-term Memory Profile</h2>{snapshot.profile.length ? <div className="evidence-list">{snapshot.profile.map((memory) => <article className="evidence-item-card" key={memory.id}><strong>{label[memory.memoryType]}</strong><p className="evidence-description">{memory.content}</p><small>Confirmed {memory.confirmedAt} / importance {Math.round(memory.importance * 100)}% / confidence {Math.round(memory.confidence * 100)}%</small></article>)}</div> : <p>No confirmed long-term memory yet.</p>}</section>
  </main>;
}
