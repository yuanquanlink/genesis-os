"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, FileCheck2, ShieldCheck } from "lucide-react";
import type { ContextTransparencySnapshot } from "@/lib/services/context-transparency-service";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ContextTransparencyInspector({ initialSnapshot }: { initialSnapshot: ContextTransparencySnapshot }) {
  const [selectedPurpose, setSelectedPurpose] = useState(initialSnapshot.purposes[0]?.purpose ?? "daily_operation");
  const current = useMemo(
    () => initialSnapshot.purposes.find((item) => item.purpose === selectedPurpose) ?? initialSnapshot.purposes[0],
    [initialSnapshot.purposes, selectedPurpose],
  );

  return (
    <div className="context-inspector-page">
      <section className="context-inspector-hero">
        <div>
          <span className="section-kicker">AI 上下文透明度</span>
          <h2>准确看到 Genesis 能使用什么</h2>
          <p>这里展示经过所有者批准、版本校验和投影回执验证后，ContextEngine 对不同任务实际开放的内容。</p>
        </div>
        <dl className="context-inspector-summary" aria-label="上下文可见性摘要">
          <div><dt>当前可见</dt><dd>{initialSnapshot.totals.visible}</dd></div>
          <div><dt>失效投影</dt><dd>{initialSnapshot.totals.excluded}</dd></div>
          <div><dt>用途边界</dt><dd>{initialSnapshot.totals.purposes}</dd></div>
        </dl>
      </section>

      <section className="context-inspector-workspace">
        <nav className="context-purpose-tabs" aria-label="Context 用途">
          {initialSnapshot.purposes.map((item) => (
            <button
              key={item.purpose}
              type="button"
              aria-pressed={item.purpose === selectedPurpose}
              onClick={() => setSelectedPurpose(item.purpose)}
            >
              <span>{item.label}</span>
              <small>{item.visible.length} 条可见</small>
            </button>
          ))}
        </nav>

        {current ? (
          <div className="context-purpose-content">
            <header>
              <div>
                <span className="section-kicker">{current.label}</span>
                <h3>此任务实际可见的正式信息</h3>
                <p>{current.description}</p>
              </div>
              <span className="context-read-only"><ShieldCheck aria-hidden="true" size={16} />只读</span>
            </header>

            <div className="context-visibility-ledger">
              {current.visible.length ? current.visible.map((item) => (
                <article key={item.projectionId} className="is-visible">
                  <span className="context-visibility-marker"><Eye aria-hidden="true" size={17} /></span>
                  <div>
                    <header>
                      <div><small>{item.domainLabel} · {item.trustLabel}</small><h4>{item.title}</h4></div>
                      <span>{item.freshnessLabel}</span>
                    </header>
                    <p>{item.reasons.join(" ")}</p>
                    <div className="context-source-meta">
                      <span>投影于 {formatDate(item.projectedAt)}</span>
                      <span>{item.evidenceRefs.length} 条证据引用</span>
                      <span>{item.provenanceRefs.length} 条来源引用</span>
                    </div>
                    <details>
                      <summary>查看 AI 实际接收的投影内容与审计信息</summary>
                      <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                      {item.limitations.length ? <p>限制：{item.limitations.join(" ")}</p> : null}
                      <p className="audit-note">Projection {item.projectionId} · {item.auditReasons.join(" ")}</p>
                    </details>
                  </div>
                </article>
              )) : (
                <div className="context-empty-state">
                  <FileCheck2 aria-hidden="true" size={22} />
                  <h4>这个用途还没有已确认 Context</h4>
                  <p>Genesis 不会用候选或空白数据补齐。请在“今日”的已确认认知区域完成预览、所有者授权与确认投影。</p>
                </div>
              )}
            </div>

            {current.excluded.length ? (
              <details className="context-invalid-projections">
                <summary><EyeOff aria-hidden="true" size={16} />查看 {current.excluded.length} 条当前不可用的历史投影</summary>
                {current.excluded.map((item) => (
                  <article key={item.projectionId}>
                    <strong>{item.title}</strong>
                    <span>{item.freshnessLabel}</span>
                    <p>{item.reasons.join(" ")}</p>
                  </article>
                ))}
              </details>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="context-policy-panel">
        <header><span className="section-kicker">永久排除规则</span><h3>这些信息不会被偷偷送给 AI</h3></header>
        <div>
          {initialSnapshot.policyExclusions.map((item) => (
            <article key={item.label}><EyeOff aria-hidden="true" size={17} /><div><strong>{item.label}</strong><p>{item.reason}</p></div></article>
          ))}
        </div>
        <p className="context-boundary-note">{initialSnapshot.boundary}</p>
      </section>
    </div>
  );
}
