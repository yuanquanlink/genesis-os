"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, Clock3, Radar, ShieldCheck, Sparkles, Target } from "lucide-react";

type OpportunityItem = {
  id: string;
  focus: string;
  opportunity: null | {
    title: string;
    signal: string;
    fitReason: string;
    upside: string[];
    downside: string[];
    sourceRefs: string[];
    firstAction: { title: string; why: string; durationMinutes: number; completionSignal: string };
    confidence: number;
    limitations: string[];
  };
  provider: string;
  mode: string;
  fallbackReason: string | null;
  status: string;
  createdAt: string;
};

type OpportunitySnapshot = {
  opportunities: OpportunityItem[];
  signals: {
    approvedPlanning: Array<{ id: string; title: string; category: string }>;
    activeMission: { id: string; title: string } | null;
    verifiedEvidence: Array<{ id: string; relatedAbility: string }>;
    openProjects: Array<{ id: string; title: string }>;
    sourceRefs: string[];
  };
  boundary: { candidateOnly: boolean; contextEligible: boolean; formalMutationAllowed: boolean; externalVerificationRequired: boolean };
};

export function OpportunityCenter({ initialSnapshot }: { initialSnapshot: OpportunitySnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef<string | null>(null);

  async function discover(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("正在从已批准意图、项目和已验证证据中寻找可验证信号…");
    const clientRequestId = requestId.current ?? crypto.randomUUID();
    requestId.current = clientRequestId;
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus, clientRequestId }),
      });
      const data = await response.json() as { snapshot: OpportunitySnapshot; duplicate: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "机会扫描暂时无法完成");
      setSnapshot(data.snapshot);
      setMessage(data.duplicate ? "已读取这次扫描结果，没有重复生成。" : "已生成机会候选；需要你核实外部条件后再决定是否行动。");
      requestId.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "机会扫描暂时无法完成");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="personal-intelligence-page opportunity-page" aria-label="机会中心">
      <section className="intelligence-hero opportunity-hero">
        <div>
          <span className="section-kicker">Opportunity Engine · 轻量发现</span>
          <h2>从已有积累里，寻找值得验证的窗口</h2>
          <p>机会不是承诺。Genesis 只识别信号、说明依据与代价，并把第一步限制为一次低成本验证。</p>
        </div>
        <div className="signal-summary">
          <span><b>{snapshot.signals.approvedPlanning.length}</b>已批准意图</span>
          <span><b>{snapshot.signals.verifiedEvidence.length}</b>已验证证据</span>
          <span><b>{snapshot.signals.openProjects.length}</b>进行中项目</span>
        </div>
      </section>

      <section className="opportunity-command-panel">
        <form onSubmit={discover}>
          <label>可选关注方向<input value={focus} maxLength={500} onChange={(event) => { setFocus(event.target.value); requestId.current = null; }} placeholder="例如：AI Agent 竞赛、公开作品或研究机会" /></label>
          <button className="primary-button" disabled={busy}><Radar aria-hidden="true" size={17} />{busy ? "正在扫描…" : "发现一个可验证机会"}</button>
        </form>
        {message ? <p role="status" className="form-message">{message}</p> : null}
      </section>

      {snapshot.opportunities.length ? (
        <section className="opportunity-list" aria-label="机会候选列表">
          {snapshot.opportunities.filter((item) => item.status === "pending" && item.opportunity).map((item) => {
            const opportunity = item.opportunity!;
            return (
              <article key={item.id} className="opportunity-candidate">
                <header><div><span className="candidate-label"><Sparkles aria-hidden="true" size={14} />待审机会候选</span><h3>{opportunity.title}</h3></div><span>{Math.round(opportunity.confidence * 100)}% 信号置信度</span></header>
                <div className="opportunity-rationale"><section><span>观察到的信号</span><p>{opportunity.signal}</p></section><section><span>为什么可能适合</span><p>{opportunity.fitReason}</p></section></div>
                <div className="opportunity-tradeoffs"><section><h4>可能收益</h4><ul>{opportunity.upside.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h4>现实代价</h4><ul>{opportunity.downside.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
                <div className="first-action-panel">
                  <span><Clock3 aria-hidden="true" size={14} />最小验证 · {opportunity.firstAction.durationMinutes} 分钟</span>
                  <strong>{opportunity.firstAction.title}</strong>
                  <p>{opportunity.firstAction.why}</p>
                  <small>完成信号：{opportunity.firstAction.completionSignal}</small>
                </div>
                <details><summary>查看来源、限制与审计边界</summary>{opportunity.sourceRefs.length ? <ul>{opportunity.sourceRefs.map((ref) => <li key={ref}>{ref}</li>)}</ul> : <p>暂无可引用来源，本候选只建议先扫描。</p>}<ul>{opportunity.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul><p>记录 ID：{item.id} · {item.mode === "real" ? "实时模型" : "本地安全降级"}</p></details>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="intelligence-empty-state"><ShieldCheck aria-hidden="true" size={22} /><h3>还没有机会候选</h3><p>运行一次低成本扫描。Genesis 不会制造竞赛、合作或工作机会，也不会代表你联系第三方。</p></section>
      )}
      <aside className="opportunity-boundary"><Target aria-hidden="true" size={18} /><div><strong>所有机会都需要外部核实</strong><p>候选不会自动进入正式规划。报名、联系、发布或分享仍由 Owner 决定。</p></div><ArrowUpRight aria-hidden="true" size={17} /></aside>
    </div>
  );
}
