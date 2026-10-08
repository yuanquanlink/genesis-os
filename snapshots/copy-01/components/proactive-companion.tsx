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
    if (!response.ok) throw new Error(data.error || "主动洞察暂不可用");
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => { if (!cancelled) setSnapshot(data); }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "主动洞察暂不可用"); });
    return () => { cancelled = true; };
  }, []);

  async function generate() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/proactive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", clientRequestId: crypto.randomUUID() }) });
      const data = await response.json() as { snapshot: Snapshot; duplicate: boolean; unavailable?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "生成失败");
      setSnapshot(data.snapshot);
      setMessage(data.unavailable || (data.duplicate ? "本周洞察待确认建议已存在。" : "每周洞察待确认建议已生成。"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "生成失败"); }
    finally { setBusy(false); }
  }

  const insight = snapshot?.insights[0];
  return <section className="daily-life-panel full-span" aria-label="主动导师">
    <div className="section-heading"><div><span className="section-kicker">主动导师 · 每周候选</span><h2>只呈现有证据来源的风险，不修改个人正式数据。</h2></div><button className="secondary-button" disabled={busy} onClick={() => void generate()}><Sparkles size={14} />生成每周洞察</button></div>
    {insight ? <div className="daily-life-grid"><article><span>成长信号</span><p><b>能力趋势：</b> {insight.insight.abilityTrend}</p><p><b>最大瓶颈：</b> {insight.insight.bottleneck}</p></article><article><span>建议待确认项</span><p><b>下一步：</b> {insight.insight.nextStep}</p><p><b>风险：</b> {insight.insight.risk}</p><p><b>能力证据：</b> {insight.insight.evidenceIds.join(", ")}</p></article></div> : <p>{snapshot?.approvedEvidenceCount ? "本周还没有生成洞察。" : "Genesis 需要已批准证据，才能生成主动建议待确认项。"}</p>}
    {message ? <p role="status" className="form-message">{message}</p> : null}
  </section>;
}
