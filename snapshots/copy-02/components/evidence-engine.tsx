"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  Activity,
  Brain,
  CheckCircle2,
  Compass,
  Database,
  FileCheck2,
  GitBranch,
  Home,
  Network,
  PenLine,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AbilityChangeRecord,
  EvidenceItemRecord,
  EvidenceSnapshot,
} from "@/lib/db/evidence-repository";

const nav = [
  { href: "/", label: "今日", icon: Home },
  { href: "/learning", label: "深度学习", icon: Brain },
  { href: "/self-input", label: "自我输入", icon: PenLine },
  { href: "/digital-life", label: "数字生命", icon: ShieldCheck },
  { href: "/growth-graph", label: "成长图谱", icon: Network },
  { href: "/evidence", label: "成长证据", icon: FileCheck2 },
  { href: "/timeline", label: "成长时间线", icon: Activity },
  { href: "/cognition", label: "认知成长", icon: Compass },
  { href: "/settings", label: "设置", icon: Settings },
];

const typeLabels = {
  learning: "学习证据",
  project: "项目证据",
  competition: "比赛证据",
  external: "外部评价",
  self_reflection: "自我反思",
} as const;

const statusLabels = {
  pending: "待分析",
  verified: "已评估",
  needs_review: "需复核",
  rejected: "已拒绝",
} as const;

async function responseJson(response: Response) {
  const data = (await response.json()) as EvidenceSnapshot & { error?: string };
  if (!response.ok) throw new Error(data.error || "证据请求失败，请查看服务端日志");
  return data;
}

function score(value: number | null) {
  return value === null ? "待评估" : `${value}/100`;
}

function groupAbilityChanges(changes: AbilityChangeRecord[]) {
  const grouped = new Map<
    string,
    AbilityChangeRecord & { evidenceCount: number }
  >();
  for (const change of changes) {
    const current = grouped.get(change.candidateId);
    if (current) current.evidenceCount += 1;
    else grouped.set(change.candidateId, { ...change, evidenceCount: 1 });
  }
  return [...grouped.values()];
}

function localDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function EvidenceCard({ item }: { item: EvidenceItemRecord }) {
  const evaluation = item.latestEvaluation;
  return (
    <article className="evidence-item-card">
      <div className="evidence-item-heading">
        <div>
          <span className="evidence-type-tag">{typeLabels[item.evidenceType]}</span>
          <h3>{item.relatedAbility}</h3>
        </div>
        <span className={`evidence-status ${item.verificationStatus}`}>
          {statusLabels[item.verificationStatus]}
        </span>
      </div>
      <p className="evidence-description">{item.description}</p>
      <div className="evidence-meta">
        <span>{item.source}</span>
        <time>{new Date(item.capturedAt).toLocaleString("zh-CN")}</time>
        <span>置信度 {Math.round(item.confidence * 100)}%</span>
      </div>
      {evaluation ? (
        <div className="evidence-evaluation">
          <div className="evidence-score-grid">
            <span>真实性 <b>{score(item.truthfulness)}</b></span>
            <span>难度 <b>{score(item.difficulty)}</b></span>
            <span>独立性 <b>{score(item.independence)}</b></span>
            <span>工程价值 <b>{score(item.engineeringValue)}</b></span>
            <span>长期价值 <b>{score(item.longTermValue)}</b></span>
          </div>
          <blockquote>
            <strong>评估理由</strong>
            <p>{evaluation.reasoning}</p>
            <small>下一步：{evaluation.nextImprovement}</small>
          </blockquote>
          {evaluation.candidateId ? (
            <Link href="/growth-graph" className="evidence-candidate-link">
              <Sparkles size={13} /> 待用户批准的能力候选
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="evidence-pending-note">
          <Database size={14} /> 原始证据已保存，运行“分析证据”后才会产生候选。
        </div>
      )}
      {item.sources.length > 1 ? (
        <details className="evidence-sources">
          <summary>查看全部 {item.sources.length} 条来源</summary>
          {item.sources.map((source) => (
            <div key={source.id}>
              <span>{source.source}</span>
              <small>{source.sourceType} / {source.sourceId}</small>
            </div>
          ))}
        </details>
      ) : null}
    </article>
  );
}

export function EvidenceEngine({ initialSnapshot }: { initialSnapshot: EvidenceSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [manualType, setManualType] = useState<"competition" | "external" | "project" | "learning" | "self_reflection">("external");
  const [manualSource, setManualSource] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualAbility, setManualAbility] = useState("");

  const run = async (action: "sync" | "analyze" | "daily_report") => {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setSnapshot(await responseJson(response));
      setMessage(action === "sync" ? "来源同步完成，原始证据已持久化。" : action === "analyze" ? "证据评估完成，候选仍需你批准。" : "今日成长报告已保存。 ");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "证据操作失败");
    } finally {
      setBusy(null);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!manualSource.trim() || !manualDescription.trim() || !manualAbility.trim()) return;
    setBusy("create");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          evidenceType: manualType,
          source: manualSource,
          description: manualDescription,
          relatedAbility: manualAbility,
          capturedAt: new Date().toISOString(),
          dataKind: "user",
          clientRequestId: crypto.randomUUID(),
        }),
      });
      setSnapshot(await responseJson(response));
      setManualSource("");
      setManualDescription("");
      setManualAbility("");
      setMessage("证据已保存，尚未改变正式能力。 ");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "证据保存失败");
    } finally {
      setBusy(null);
    }
  };

  const visibleItems = filter === "all" ? snapshot.items : snapshot.items.filter((item) => item.evidenceType === filter);
  const abilityChanges = groupAbilityChanges(snapshot.abilityChanges);
  const reportAbilityChanges = snapshot.dailyReport
    ? abilityChanges.filter(
        (change) => localDateKey(change.approvedAt) === snapshot.dailyReport?.reportDate,
      )
    : [];
  const todayCompleted = snapshot.dailyReport?.todayCompleted ?? [];

  return (
    <div className="shell evidence-shell">
      <aside className="sidebar">
        <Link className="brand" href="/"><span className="brand-mark">G</span><span><strong>Genesis OS</strong><small>Personal Growth System</small></span></Link>
        <nav>{nav.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.href} className={item.href === "/evidence" ? "active" : ""}><Icon size={17} />{item.label}{item.href === "/evidence" && snapshot.stats.candidatesPending ? <b>{snapshot.stats.candidatesPending}</b> : null}</Link>; })}</nav>
        <div className="side-note"><ShieldCheck size={17} /><div><strong>证据优先</strong><span>证据先评估，候选仍需你确认。</span></div></div>
      </aside>
      <main>
        <header className="topbar evidence-topbar">
          <div><span className="eyebrow">Genesis Evidence Engine</span><h1>成长证据</h1></div>
          <div className="evidence-top-actions">
            <button className="secondary-button" disabled={busy !== null} onClick={() => run("sync")}><RefreshCw size={14} className={busy === "sync" ? "spin" : ""} />同步来源</button>
            <button className="primary-button" disabled={busy !== null} onClick={() => run("analyze")}><Sparkles size={14} className={busy === "analyze" ? "spin" : ""} />{busy === "analyze" ? "正在评估" : "分析证据"}</button>
          </div>
        </header>
        {error ? <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}>关闭</button></div> : null}
        {message ? <div className="form-message evidence-message"><CheckCircle2 size={14} />{message}</div> : null}
        <section className="evidence-hero">
          <div><span className="section-kicker">Evidence → evaluation → approval → graph</span><h2>把“我做过”变成可审查的成长证据</h2><p>系统只保存真实来源。AI 的五维判断会先进入待确认候选，批准前不会改动正式能力或数字生命画像。</p></div><FileCheck2 size={54} />
        </section>
        <section className="evidence-stats"><div><span>全部证据</span><strong>{snapshot.stats.total}</strong></div><div><span>待分析</span><strong>{snapshot.stats.pending}</strong></div><div><span>已评估</span><strong>{snapshot.stats.verified}</strong></div><div><span>待确认候选</span><strong>{snapshot.stats.candidatesPending}</strong></div></section>
        <section className="evidence-card pending-candidates-card"><div className="section-heading"><div><span className="section-kicker">Growth Evidence Candidates</span><h2>待确认候选</h2></div><span>批准前不会改能力</span></div>{snapshot.pendingCandidates.length ? <div className="pending-candidate-list">{snapshot.pendingCandidates.map((candidate) => <article key={candidate.id}><div><strong>{candidate.name}</strong><span>拟议等级 {candidate.proposedLevel}/5 · 置信度 {Math.round(candidate.confidence * 100)}%</span></div><p>{candidate.evidenceIds.length} 条证据支持；候选状态 pending。</p><Link href="/growth-graph" className="evidence-candidate-link"><Sparkles size={13} />前往成长图谱批准或拒绝</Link></article>)}</div> : <div className="empty compact-empty"><CheckCircle2 size={22} /><strong>当前没有待确认候选</strong><p>先同步并分析新的真实证据。</p></div>}</section>
        <div className="evidence-layout">
          <div>
            <section className="evidence-card evidence-filter-card">
              <div className="section-heading"><div><span className="section-kicker">Collected evidence</span><h2>证据库</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">全部类型</option><option value="learning">学习证据</option><option value="project">项目证据</option><option value="competition">比赛证据</option><option value="external">外部评价</option><option value="self_reflection">自我反思</option></select></div>
              {visibleItems.length ? <div className="evidence-list">{visibleItems.map((item) => <EvidenceCard item={item} key={item.id} />)}</div> : <div className="empty compact-empty"><FileCheck2 size={22} /><strong>还没有成长证据</strong><p>同步学习、项目和反思记录，或补录一条有来源的证据。</p></div>}
            </section>
            <section className="evidence-card change-card"><div className="section-heading"><div><span className="section-kicker">Ability change history</span><h2>能力变化</h2></div><span>只有批准后才会出现</span></div>{abilityChanges.length ? <div className="change-list">{abilityChanges.map((change) => <article key={change.candidateId}><strong>{change.abilityName}</strong><span>{change.previousLevel}/5 → <b>{change.approvedLevel}/5</b></span><p>{change.reason}</p><small>{change.evidenceCount} 条关联证据 · {new Date(change.approvedAt).toLocaleString("zh-CN")}</small></article>)}</div> : <div className="empty compact-empty"><Activity size={22} /><strong>暂无已批准的能力变化</strong><p>评估结果不会自动提升等级，请先到成长图谱批准候选。</p></div>}</section>
          </div>
          <aside>
            <section className="evidence-card manual-card"><div className="section-heading"><div><span className="section-kicker">Manual source</span><h2>补录证据</h2></div></div><form onSubmit={create}><label>证据类型<select value={manualType} onChange={(event) => setManualType(event.target.value as typeof manualType)}><option value="external">外部评价</option><option value="competition">比赛/获奖</option><option value="project">项目产物</option><option value="learning">学习成绩</option><option value="self_reflection">自我反思</option></select></label><label>来源<input value={manualSource} onChange={(event) => setManualSource(event.target.value)} placeholder="老师评价、比赛证书、仓库链接" /></label><label>关联能力<input value={manualAbility} onChange={(event) => setManualAbility(event.target.value)} placeholder="Python、软件工程、AI应用工程" /></label><label>完整描述<textarea value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} placeholder="写清楚做了什么、产出在哪里、谁可以验证" /></label><button className="primary-button" disabled={busy !== null || !manualSource.trim() || !manualDescription.trim() || !manualAbility.trim()}><FileCheck2 size={14} />{busy === "create" ? "保存中" : "保存原始证据"}</button></form><small className="muted">保存不会直接提升能力；自我反思置信度最低。</small></section>
            <section className="evidence-card report-card">
              <div className="section-heading">
                <div><span className="section-kicker">Daily growth report</span><h2>今日成长报告</h2></div>
                <button className="icon-button" title="生成今日成长报告" disabled={busy !== null} onClick={() => run("daily_report")}><RefreshCw size={15} /></button>
              </div>
              {snapshot.dailyReport ? (
                <div className="daily-report">
                  <span className="report-mode">{snapshot.dailyReport.modelMode === "real" ? "Real AI" : "Demo / 本地"} · {snapshot.dailyReport.reportDate}</span>
                  <h3>1. 今日完成</h3>
                  {todayCompleted.length ? <ul>{todayCompleted.map((item) => <li key={item.id}>{item.summary}</li>)}</ul> : <p>今天还没有已持久化的主要完成事件。</p>}
                  <h3>2. 能力变化</h3>
                  {reportAbilityChanges.length ? <ul>{reportAbilityChanges.map((change) => <li key={change.candidateId}>{change.abilityName}：{change.previousLevel}/5 → {change.approvedLevel}/5（{change.evidenceCount} 条证据）</li>)}</ul> : <p>今天没有经过用户批准的正式能力变化。</p>}
                  <h3>3. 新增证据</h3>
                  {snapshot.dailyReport.newEvidenceSummary.length ? <ul>{snapshot.dailyReport.newEvidenceSummary.map((item) => <li key={item.evidenceId}>{item.summary}</li>)}</ul> : <p>今天没有足够的已评估证据。</p>}
                  <p>{snapshot.dailyReport.largestStrength}</p>
                  <h3>4. 最大问题</h3>
                  <p>{snapshot.dailyReport.largestWeakness}</p>
                  <h3>5. 明日三个行动</h3>
                  <ul>{snapshot.dailyReport.next90Days.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
                  <div className="report-limitations"><strong>证据边界</strong>{snapshot.dailyReport.limitations.map((item) => <p key={item}>{item}</p>)}</div>
                  <small>{snapshot.dailyReport.provider} / {snapshot.dailyReport.model} · 聚合置信度 {Math.round((snapshot.dailyReport.confidence ?? 0) * 100)}% · 更新于 {new Date(snapshot.dailyReport.updatedAt).toLocaleString("zh-CN")}</small>
                </div>
              ) : <div className="empty compact-empty"><Sparkles size={22} /><strong>今日报告尚未生成</strong><p>同步并评估证据后生成。</p></div>}
            </section>
            <section className="evidence-card adapter-card"><div className="section-heading"><div><span className="section-kicker">Future adapters</span><h2>Git 证据适配器</h2></div><GitBranch size={20} /></div><p>接口和信号分析已就绪，当前不连接 GitHub、不要求凭据，也不会显示无效连接按钮。</p><div className="adapter-status"><span>状态</span><strong>未连接</strong></div><div className="adapter-signals">{snapshot.adapters[0]?.signals.map((signal) => <span key={signal}>{signal}</span>)}</div></section>
          </aside>
        </div>
      </main>
    </div>
  );
}
