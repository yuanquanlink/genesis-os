"use client";

import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, Compass, MinusCircle, ShieldCheck, Sparkles } from "lucide-react";

type Direction = {
  key: string;
  title: string;
  action: string;
  why: string;
  advantages: string[];
  disadvantages: string[];
  sourceRefs: string[];
};

type AdvisorItem = {
  id: string;
  question: string;
  recommendation: null | {
    currentState: string;
    directions: Direction[];
    recommendation: {
      directionKey: string;
      reason: string;
      firstAction: { title: string; why: string; durationMinutes: number; completionSignal: string };
    };
    limitations: string[];
    confidence: number;
  };
  provider: string;
  mode: string;
  fallbackReason: string | null;
  status: string;
  createdAt: string;
};

type AdvisorSnapshot = {
  recommendations: AdvisorItem[];
  signals: {
    activeMission: { id: string; title: string } | null;
    approvedPlan: { id: string; title: string } | null;
    verifiedEvidenceIds: string[];
    openLearningGoals: number;
    recentSessions: number;
    knowledgeItems: number;
    approvedPlanning: Array<{ id: string; title: string }>;
    sourceRefs: string[];
  };
  boundary: { candidateOnly: boolean; contextEligible: boolean; formalMutationAllowed: boolean };
};

export function PersonalAdvisor({ initialSnapshot }: { initialSnapshot: AdvisorSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [question, setQuestion] = useState("我现在应该做什么？");
  const [availableMinutes, setAvailableMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef<string | null>(null);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("正在读取已批准上下文并比较行动方向…");
    const clientRequestId = requestId.current ?? crypto.randomUUID();
    requestId.current = clientRequestId;
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, availableMinutes, clientRequestId }),
      });
      const data = await response.json() as { snapshot: AdvisorSnapshot; duplicate: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Advisor 暂时无法生成建议");
      setSnapshot(data.snapshot);
      setMessage(data.duplicate ? "已读取这次请求对应的建议，没有重复生成。" : "已生成待审建议。它不会自动改变任何正式状态。");
      requestId.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Advisor 暂时无法生成建议");
    } finally {
      setBusy(false);
    }
  }

  const latest = snapshot.recommendations.find((item) => item.status === "pending" && item.recommendation);
  const recommendation = latest?.recommendation;

  return (
    <div className="personal-intelligence-page advisor-page" aria-label="Genesis Advisor">
      <section className="intelligence-hero">
        <div>
          <span className="section-kicker">Genesis Advisor · Owner 决策支持</span>
          <h2>不替你做决定，帮你看清下一步</h2>
          <p>只读取已批准上下文与真实本地记录，比较现实方向，并给出一个最小可执行行动。</p>
        </div>
        <div className="signal-summary" aria-label="Advisor 可用信号">
          <span><b>{snapshot.signals.recentSessions}</b>近 14 天学习</span>
          <span><b>{snapshot.signals.verifiedEvidenceIds.length}</b>已验证证据</span>
          <span><b>{snapshot.signals.openLearningGoals}</b>进行中目标</span>
        </div>
      </section>

      <section className="advisor-command-panel">
        <form onSubmit={generate}>
          <label>你现在最想解决的问题<textarea value={question} minLength={2} maxLength={1000} required onChange={(event) => { setQuestion(event.target.value); requestId.current = null; }} /></label>
          <label>可用时间<select value={availableMinutes} onChange={(event) => { setAvailableMinutes(Number(event.target.value)); requestId.current = null; }}><option value={15}>15 分钟</option><option value={30}>30 分钟</option><option value={60}>60 分钟</option><option value={90}>90 分钟</option></select></label>
          <button className="primary-button" disabled={busy}><Compass aria-hidden="true" size={17} />{busy ? "正在分析…" : "帮我判断下一步"}</button>
        </form>
        {message ? <p role="status" className="form-message">{message}</p> : null}
      </section>

      {recommendation ? (
        <section className="advisor-result" aria-label="最新 Advisor 待审建议">
          <header className="intelligence-result-header">
            <div><span className="candidate-label"><Sparkles aria-hidden="true" size={14} />AI 待审建议</span><h3>当前状态</h3></div>
            <span>{latest?.mode === "real" ? "实时模型" : "本地安全降级"}</span>
          </header>
          <p className="state-reading">{recommendation.currentState}</p>
          <div className="decision-trace advisor-directions">
            {recommendation.directions.map((direction) => {
              const selected = direction.key === recommendation.recommendation.directionKey;
              return (
                <article key={direction.key} className={selected ? "is-recommended" : undefined}>
                  <header><strong>{direction.title}</strong>{selected ? <span>Advisor 建议</span> : null}</header>
                  <p>{direction.why}</p>
                  <div className="direction-action"><ArrowRight aria-hidden="true" size={15} /><span>{direction.action}</span></div>
                  <dl><dt><CheckCircle2 aria-hidden="true" size={14} />可能收益</dt><dd>{direction.advantages.join("；")}</dd><dt><MinusCircle aria-hidden="true" size={14} />现实代价</dt><dd>{direction.disadvantages.join("；")}</dd></dl>
                  {direction.sourceRefs.length ? <details><summary>查看依据</summary><ul>{direction.sourceRefs.map((ref) => <li key={ref}>{ref}</li>)}</ul></details> : <small>暂无可引用来源，建议置信度已降低。</small>}
                </article>
              );
            })}
          </div>
          <div className="first-action-panel advisor-first-action">
            <span><Clock3 aria-hidden="true" size={14} />先做这一件事 · {recommendation.recommendation.firstAction.durationMinutes} 分钟</span>
            <strong>{recommendation.recommendation.firstAction.title}</strong>
            <p>{recommendation.recommendation.reason}</p>
            <small>完成信号：{recommendation.recommendation.firstAction.completionSignal}</small>
          </div>
          <details className="boundary-disclosure"><summary>建议边界与限制</summary><ul>{recommendation.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p>置信度 {Math.round(recommendation.confidence * 100)}% · ContextEngine 不接收这条候选 · 不允许正式数据修改</p></details>
        </section>
      ) : (
        <section className="intelligence-empty-state"><ShieldCheck aria-hidden="true" size={22} /><h3>还没有 Advisor 建议</h3><p>提出一个真实问题。缺失数据会标记为未知，Genesis 不会制造个人状态或虚假成果。</p></section>
      )}
    </div>
  );
}
