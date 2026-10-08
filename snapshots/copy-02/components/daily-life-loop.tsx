"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type DailyLife = { date: string; morning: { highestPriority: string; activeMission: { id: string; title: string; priority: string; deadline: string; dailyTasks: string[]; evidenceRequirement: string } | null; currentStrategy: string; learningTask: string; projectTask: string; knowledgePrompt: string; growthFocus: string; proactiveNextStep: string; risks: string[]; yesterdayCarryover: string }; evening: { completed: string[]; learningGain: string; projectProgress: string; unfinishedReason: string; strategicAlignment: string; adjustment: string; abilityChanges: string[]; newEvidence: Array<{ id: string; description: string; status: string; ability: string }>; missionCompletion: string } };

export function DailyLifeLoop() {
  const [state, setState] = useState<DailyLife | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const response = await fetch("/api/daily-life", { cache: "no-store" });
      const data = await response.json() as DailyLife & { error?: string };
      if (!response.ok) throw new Error(data.error || "Daily Life data is unavailable");
      setState(data); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Daily Life data is unavailable"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/daily-life", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as DailyLife & { error?: string };
        if (!response.ok) throw new Error(data.error || "Daily Life data is unavailable");
        return data;
      })
      .then((data) => { if (!cancelled) setState(data); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Daily Life data is unavailable"); });
    return () => { cancelled = true; };
  }, []);
  if (!state && !error) return <section className="daily-life-panel full-span" aria-label="Daily Life Loop"><p>Loading daily life loop...</p></section>;
  return <section className="daily-life-panel full-span" aria-label="Daily Life Loop">
    <div className="section-heading"><div><span className="section-kicker">Daily Life Loop · {state?.date || "today"}</span><h2>Today must produce traceable evidence, not just activity.</h2></div><button className="icon-button" aria-label="Refresh daily life" title="Refresh daily life" disabled={busy} onClick={() => void load()}><RefreshCw size={16} /></button></div>
    {error ? <p className="inline-error">{error}</p> : null}
    {state ? <div className="daily-life-grid"><article><span>Highest priority</span><strong>{state.morning.highestPriority}</strong>{state.morning.activeMission ? <><p><b>Active Mission:</b> {state.morning.activeMission.title} ({state.morning.activeMission.priority})</p><p><b>Mission tasks:</b> {state.morning.activeMission.dailyTasks.join("; ")}</p><p><b>Required Evidence:</b> {state.morning.activeMission.evidenceRequirement}</p><p><b>Mission deadline:</b> {new Date(state.morning.activeMission.deadline).toLocaleDateString()}</p></> : <p><b>Active Mission:</b> No user-confirmed mission.</p>}<p><b>Strategy:</b> {state.morning.currentStrategy}</p><p><b>Learning:</b> {state.morning.learningTask}</p><p><b>Project:</b> {state.morning.projectTask}</p><p><b>Growth focus:</b> {state.morning.growthFocus}</p><p><b>Knowledge prompt:</b> {state.morning.knowledgePrompt}</p><p><b>Weekly insight:</b> {state.morning.proactiveNextStep}</p><p><b>Carryover:</b> {state.morning.yesterdayCarryover}</p><p><b>Risks:</b> {state.morning.risks.join("; ")}</p></article><article><span>Evening evidence</span><p><b>Completed:</b> {state.evening.completed.length ? state.evening.completed.join("; ") : "No user activity recorded today."}</p><p><b>Mission:</b> {state.evening.missionCompletion}</p><p><b>Learning gain:</b> {state.evening.learningGain}</p><p><b>Project progress:</b> {state.evening.projectProgress}</p><p><b>Unfinished reason:</b> {state.evening.unfinishedReason}</p><p><b>Strategy alignment:</b> {state.evening.strategicAlignment}</p><p><b>Tomorrow adjustment:</b> {state.evening.adjustment}</p><p><b>Approved ability changes:</b> {state.evening.abilityChanges.join("; ") || "None"}</p><p><b>New Evidence:</b> {state.evening.newEvidence.length ? state.evening.newEvidence.map((item) => `${item.ability}: ${item.status}`).join("; ") : "None"}</p><div className="daily-life-links"><Link href="/missions">Open missions</Link><Link href="/today-learning">Open learning loop</Link><Link href="/self-input">Record life input</Link><Link href="/knowledge">Open knowledge base</Link><Link href="/evidence">Review evidence</Link></div></article></div> : null}
  </section>;
}
