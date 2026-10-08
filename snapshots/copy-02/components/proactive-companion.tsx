"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type Insight = { id: string; weekKey: string; status: string; insight: { abilityTrend: string; bottleneck: string; nextStep: string; risk: string; evidenceIds: string[]; confidence: number; limitations: string[] } };
type Snapshot = { insights: Insight[]; approvedEvidenceCount: number };

export function ProactiveCompanion() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/proactive", { cache: "no-store" });
    const data = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(data.error || "Proactive insight unavailable");
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => { if (!cancelled) setSnapshot(data); }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Proactive insight unavailable"); });
    return () => { cancelled = true; };
  }, []);

  async function generate() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/proactive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", clientRequestId: crypto.randomUUID() }) });
      const data = await response.json() as { snapshot: Snapshot; duplicate: boolean; unavailable?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Generation failed");
      setSnapshot(data.snapshot);
      setMessage(data.unavailable || (data.duplicate ? "This week's candidate already exists." : "Weekly Insight Candidate generated."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Generation failed"); }
    finally { setBusy(false); }
  }

  const insight = snapshot?.insights[0];
  return <section className="daily-life-panel full-span" aria-label="Proactive Mentor">
    <div className="section-heading"><div><span className="section-kicker">Proactive Mentor / weekly candidate</span><h2>Surface evidence-linked risks without changing personal data.</h2></div><button className="secondary-button" disabled={busy} onClick={() => void generate()}><Sparkles size={14} />Generate weekly insight</button></div>
    {insight ? <div className="daily-life-grid"><article><span>Growth signal</span><p><b>Ability trend:</b> {insight.insight.abilityTrend}</p><p><b>Largest bottleneck:</b> {insight.insight.bottleneck}</p></article><article><span>Recommendation Candidate</span><p><b>Next step:</b> {insight.insight.nextStep}</p><p><b>Risk:</b> {insight.insight.risk}</p><p><b>Evidence:</b> {insight.insight.evidenceIds.join(", ")}</p></article></div> : <p>{snapshot?.approvedEvidenceCount ? "No weekly insight has been generated yet." : "Approved Evidence is required before Genesis can generate a proactive recommendation candidate."}</p>}
    {message ? <p role="status" className="form-message">{message}</p> : null}
  </section>;
}
