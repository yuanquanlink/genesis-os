"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Brain,
  Check,
  Compass,
  GitBranch,
  FileCheck2,
  Home,
  Network,
  PenLine,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type {
  GrowthCandidateRecord,
  GrowthGraphSnapshot,
} from "@/lib/db/growth-repository";

const nav = [
  { href: "/", label: "今日", icon: Home },
  { href: "/learning", label: "深度学习", icon: BookOpen },
  { href: "/self-input", label: "自我输入", icon: PenLine },
  { href: "/digital-life", label: "数字分身", icon: Brain },
  { href: "/growth-graph", label: "成长图谱", icon: Network },
  { href: "/evidence", label: "能力证据", icon: FileCheck2 },
  { href: "/timeline", label: "成长时间线", icon: Activity },
  { href: "/cognition", label: "认知成长", icon: Compass },
  { href: "/settings", label: "设置", icon: Settings },
];

const nodeLabels = {
  identity: "身份",
  ability: "能力",
  project: "项目",
  goal: "目标",
  weakness: "短板",
};

type CandidateDraft = {
  name: string;
  currentLevel: number;
  nextImprovement: string;
};

async function responseJson(response: Response) {
  const data = (await response.json()) as GrowthGraphSnapshot & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后重试");
  return data;
}

export function GrowthGraph({
  initialSnapshot,
}: {
  initialSnapshot: GrowthGraphSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, CandidateDraft>>({});
  const activeCandidates = snapshot.candidates.filter(
    (candidate) => candidate.status === "pending",
  );
  const evidenceCount = useMemo(
    () => snapshot.nodes.reduce((sum, node) => sum + node.evidenceCount, 0),
    [snapshot.nodes],
  );

  const draftFor = (candidate: GrowthCandidateRecord): CandidateDraft =>
    drafts[candidate.id] ?? {
      name: candidate.name,
      currentLevel: candidate.proposedLevel,
      nextImprovement: candidate.nextImprovement,
    };

  const analyze = async () => {
    setBusy("analyze");
    setError("");
    try {
      setSnapshot(
        await responseJson(
          await fetch("/api/growth-graph", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "analyze" }),
          }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "成长图谱分析失败");
    } finally {
      setBusy(null);
    }
  };

  const decide = async (
    candidate: GrowthCandidateRecord,
    action: "approve" | "reject",
  ) => {
    setBusy(candidate.id);
    setError("");
    try {
      const draft = draftFor(candidate);
      setSnapshot(
        await responseJson(
          await fetch(`/api/growth-graph/candidates/${candidate.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              action === "approve"
                ? { action, ...draft }
                : { action },
            ),
          }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "候选处理失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="shell growth-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>
            <strong>Genesis OS</strong>
            <small>个人成长系统</small>
          </span>
        </Link>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                href={item.href}
                key={item.href}
                className={item.href === "/growth-graph" ? "active" : ""}
              >
                <Icon size={17} />
                {item.label}
                {item.href === "/growth-graph" && activeCandidates.length > 0 ? (
                  <b>{activeCandidates.length}</b>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="side-note">
          <ShieldCheck size={17} />
          <div>
            <strong>证据优先</strong>
            <span>AI 推断必须由你确认后才进入成长图谱。</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar growth-topbar">
          <div>
            <span className="eyebrow">基于证据的能力模型</span>
            <h1>Genesis 成长图谱</h1>
          </div>
          <button
            className="primary-button"
            disabled={busy !== null}
            onClick={analyze}
          >
            <RefreshCw size={14} className={busy === "analyze" ? "spin" : ""} />
            {busy === "analyze" ? "正在分析证据…" : "根据证据重新分析"}
          </button>
        </header>

        {error ? (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError("")}>关闭</button>
          </div>
        ) : null}

        <section className="growth-hero">
          <div>
            <span className="section-kicker">个人成长知识图谱</span>
            <h2>从“记录发生了什么”升级为“下一步该长什么”</h2>
            <p>
              正式节点只来自已确认画像、学习掌握证据、工程成果或你批准的成长候选。没有证据，不显示能力分数。
            </p>
          </div>
          <GitBranch size={54} />
        </section>

        <section className="growth-stats">
          <div><span>正式节点</span><strong>{snapshot.nodes.length}</strong></div>
          <div><span>确认依据</span><strong>{evidenceCount}</strong></div>
          <div><span>待确认推断</span><strong>{activeCandidates.length}</strong></div>
          <div><span>能力雷达</span><strong>{snapshot.radar.length}</strong></div>
        </section>

        <div className="growth-grid">
          <section className="growth-card radar-card">
            <div className="section-heading">
              <div>
                <span className="section-kicker">已确认能力雷达</span>
                <h2>当前能力画像</h2>
              </div>
              <span>0–5 级 · 仅正式证据</span>
            </div>
            {snapshot.radar.length ? (
              <div className="growth-radar">
                {snapshot.radar.map((ability) => (
                  <article key={ability.id}>
                    <div>
                      <strong>{ability.name}</strong>
                      <span>{ability.level}/5 · 置信度 {Math.round(ability.confidence * 100)}%</span>
                    </div>
                    <div className="growth-meter"><i style={{ width: `${ability.percent}%` }} /></div>
                    <small>{ability.evidenceCount} 条证据{ability.nextImprovement ? ` · ${ability.nextImprovement}` : ""}</small>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty compact-empty">
                <Target size={22} />
                <strong>还没有足够的正式能力证据</strong>
                <p>运行证据分析并确认候选，或在学习引擎完成测试与实践后，这里才会出现能力分数。</p>
              </div>
            )}
          </section>

          <section className="growth-card graph-card">
            <div className="section-heading">
              <div>
                <span className="section-kicker">已确认图谱</span>
                <h2>正式成长节点</h2>
              </div>
            </div>
            <div className="graph-node-list">
              {snapshot.nodes.map((node) => (
                <details key={node.id}>
                  <summary>
                    <span className={`node-dot ${node.nodeType}`} />
                    <strong>{node.name}</strong>
                    <small>{nodeLabels[node.nodeType]} · {node.evidenceCount} 条证据</small>
                  </summary>
                  <div className="graph-node-detail">
                    {node.nodeType === "ability" ? <p>能力等级：{node.currentLevel}/5</p> : null}
                    {node.nextImprovement ? <p>下一步：{node.nextImprovement}</p> : null}
                    {node.evidence.map((evidence) => (
                      <blockquote key={evidence.id}>
                        “{evidence.excerpt}”
                        <small>{evidence.sourceType} · 置信度 {Math.round(evidence.confidence * 100)}%</small>
                      </blockquote>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>

        <section className="growth-card candidate-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">成长证据候选</span>
              <h2>AI 推断待确认</h2>
            </div>
            <span>批准前不会进入正式图谱，也不会修改数字生命画像</span>
          </div>
          {activeCandidates.length ? (
            <div className="candidate-grid">
              {activeCandidates.map((candidate) => {
                const draft = draftFor(candidate);
                return (
                  <article key={candidate.id}>
                    <div className="candidate-title">
                      <span>{nodeLabels[candidate.nodeType]}</span>
                      <small>{candidate.modelMode === "real" ? "真实 AI" : "演示 AI"} · 置信度 {Math.round(candidate.confidence * 100)}%</small>
                    </div>
                    <label>
                      候选名称
                      <input
                        value={draft.name}
                        onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, name: event.target.value } }))}
                      />
                    </label>
                    {candidate.nodeType === "ability" ? (
                      <label>
                        能力等级
                        <select
                          value={draft.currentLevel}
                          onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, currentLevel: Number(event.target.value) } }))}
                        >
                          <option value={0}>0 未接触</option>
                          <option value={1}>1 了解</option>
                          <option value={2}>2 会使用</option>
                          <option value={3}>3 能独立完成</option>
                          <option value={4}>4 工程实践</option>
                          <option value={5}>5 能设计优化</option>
                        </select>
                      </label>
                    ) : null}
                    <label>
                      下一步改进
                      <textarea
                        value={draft.nextImprovement}
                        onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, nextImprovement: event.target.value } }))}
                      />
                    </label>
                    <div className="candidate-evidence">
                      <strong>推断依据</strong>
                      {candidate.evidence.map((evidence) => (
                        <blockquote key={`${candidate.id}-${evidence.evidenceId}`}>
                          “{evidence.excerpt}”
                          <small>{evidence.evidenceId} · {evidence.reason}</small>
                        </blockquote>
                      ))}
                    </div>
                    <div className="candidate-actions">
                      <button disabled={busy !== null} onClick={() => decide(candidate, "approve")}><Check size={13} />修改并批准</button>
                      <button disabled={busy !== null} onClick={() => decide(candidate, "reject")}><X size={13} />拒绝</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty compact-empty">
              <Sparkles size={22} />
              <strong>当前没有待确认的成长推断</strong>
              <p>点击“根据证据重新分析”后，AI 只会生成带来源的候选。</p>
            </div>
          )}
        </section>

        {snapshot.recommendation ? (
          <section className="growth-card recommendation-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">下一阶段成长建议</span>
                <h2>下一阶段成长路线</h2>
              </div>
              <span>{snapshot.recommendation.modelMode === "real" ? "真实 AI" : "演示 AI"} · 置信度 {Math.round(snapshot.recommendation.confidence * 100)}%</span>
            </div>
            <div className="recommendation-grid">
              <article>
                <span>未来 30 天</span>
                {snapshot.recommendation.next30Days.map((step) => (
                  <div key={step.focus}>
                    <strong>{step.focus}</strong>
                    <p>{step.why}</p>
                    <small>预期提升：{step.expectedImprovement}</small>
                  </div>
                ))}
              </article>
              <article>
                <span>未来 90 天</span>
                <strong>{snapshot.recommendation.next90Days.project}</strong>
                <ul>{snapshot.recommendation.next90Days.deliverables.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
              <article>
                <span>未来一年</span>
                <strong>{snapshot.recommendation.nextYear.stage}</strong>
                <ul>{snapshot.recommendation.nextYear.proof.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
            </div>
            {snapshot.recommendation.limitations.length ? (
              <div className="recommendation-limitations">
                <strong>证据边界与反面解释</strong>
                {snapshot.recommendation.limitations.map((item) => <p key={item}>{item}</p>)}
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
