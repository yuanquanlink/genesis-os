"use client";

import { useEffect, useMemo, useState } from "react";

type Source = { id: string; domain: "goal" | "strategy" | "mission" | "daily_plan"; title: string; truthStatus: string; projection: { id: string; freshness: string; projectedAt: string } | null };
type Snapshot = { purpose: "daily_operation"; sources: Source[]; boundary: string };
type Preview = { sourceDomain: string; sourceRecordId: string; sourceVersion: string; previewHash: string; trustClass: string; evidenceRefs: string[]; limitations: string[] };
const domainLabels: Record<Source["domain"], string> = { goal: "目标", strategy: "战略", mission: "使命", daily_plan: "今日计划" };
const truthLabels: Record<string, string> = { approved: "已批准", active: "进行中", completed: "已完成", authoritative: "正式" };

export function ApprovedContextControls() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [authorizationId, setAuthorizationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const source = useMemo(() => snapshot?.sources.find((item) => `${item.domain}:${item.id}` === selected) ?? null, [selected, snapshot]);

  async function load() {
    const response = await fetch("/api/approved-context", { cache: "no-store" });
    const data = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(data.error || "已确认认知暂时不可用");
    setSnapshot(data);
    setSelected((current) => current || (data.sources[0] ? `${data.sources[0].domain}:${data.sources[0].id}` : ""));
  }
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/approved-context", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "已确认认知暂时不可用");
      if (!cancelled) { setSnapshot(data); setSelected(data.sources[0] ? `${data.sources[0].domain}:${data.sources[0].id}` : ""); }
    }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "已确认认知暂时不可用"); });
    return () => { cancelled = true; };
  }, []);

  async function send(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/approved-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { preview?: Preview; authorization?: { id: string }; confirmation?: unknown; revocation?: unknown; snapshot?: Snapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "已确认认知操作失败");
      if (data.preview) { setPreview(data.preview); setAuthorizationId(null); setMessage("预览已生成，正式认知尚未改变。"); }
      if (data.authorization) { setAuthorizationId(data.authorization.id); setMessage("所有者授权已记录，投影尚未提交。"); }
      if (data.confirmation || data.revocation) { setPreview(null); setAuthorizationId(null); setMessage(data.confirmation ? "已确认认知投影已提交，并生成不可变回执。" : "认知投影已撤销，历史记录仍保持不可变。 "); }
      if (data.snapshot) setSnapshot(data.snapshot); else await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "已确认认知操作失败"); }
    finally { setBusy(false); }
  }

  return <section className="daily-life-panel full-span day0-panel" aria-label="已确认认知控制">
    <div className="section-heading"><div><span className="section-kicker">第 0 天 · 已确认认知</span><h2>选择 Genesis 今天可以使用的正式信息</h2></div></div>
    <p className="validation-boundary">这里只显示所有者已批准的正式目标、战略、使命和今日计划。待处理候选不会进入上下文；预览、授权和确认是三个独立动作。</p>
    {snapshot?.sources.length ? <>
      <label className="validation-field">正式来源
        <select aria-label="已确认认知来源" value={selected} onChange={(event) => { setSelected(event.target.value); setPreview(null); setAuthorizationId(null); }}>
          {snapshot.sources.map((item) => <option key={`${item.domain}:${item.id}`} value={`${item.domain}:${item.id}`}>{domainLabels[item.domain]} · {item.title} · {truthLabels[item.truthStatus] || item.truthStatus}{item.projection ? " · 已投影" : ""}</option>)}
        </select>
      </label>
      <div className="candidate-actions validation-actions">
        <button disabled={busy || !source} onClick={() => source && void send({ action: "preview", sourceDomain: source.domain, sourceRecordId: source.id })}>1. 预览影响</button>
        <button disabled={busy || !preview || Boolean(authorizationId)} onClick={() => preview && void send({ action: "authorize", sourceDomain: preview.sourceDomain, sourceRecordId: preview.sourceRecordId, sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, clientRequestId: crypto.randomUUID() })}>2. 所有者授权</button>
        <button disabled={busy || !authorizationId} onClick={() => authorizationId && void send({ action: "confirm", authorizationId, clientRequestId: crypto.randomUUID() })}>3. 确认投影</button>
        {source?.projection ? <button disabled={busy} onClick={() => void send({ action: "revoke", projectionId: source.projection!.id, reason: "所有者将此来源从今日已确认认知中撤销。", clientRequestId: crypto.randomUUID() })}>撤销投影</button> : null}
      </div>
      {preview ? <div className="validation-proof"><b>仅为预览</b><span>信任类型：{preview.trustClass}</span><span>证据引用：{preview.evidenceRefs.length}</span><small>{preview.limitations.join(" ")}</small></div> : null}
    </> : <p>当前没有合格的正式来源。请先批准真实目标、战略或使命；待确认建议会被明确排除。</p>}
    {message ? <p role="status" className="form-message">{message}</p> : null}
  </section>;
}
