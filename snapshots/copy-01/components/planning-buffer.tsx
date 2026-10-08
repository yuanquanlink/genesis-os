"use client";

import { useMemo, useRef, useState } from "react";
import { Archive, Check, Clock3, GitBranch, Inbox, Plus, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";

type PlanningCandidate = {
  id: string;
  title: string;
  description: string;
  source: string;
  category: string;
  status: "captured" | "analyzing" | "candidate_plan_ready" | "approved" | "archived";
  approvalState: "pending" | "approved";
  provenance: Record<string, unknown>;
  contextEligible: boolean;
  formalMutationAllowed: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  archivedAt: string | null;
};

type PlanningBufferSnapshot = {
  candidates: PlanningCandidate[];
  counts: { active: number; captured: number; approved: number; archived: number };
  boundary: { candidateOnly: boolean; contextEligible: boolean; formalMutationAllowed: boolean; conversionAvailable: boolean };
};

type PlanningAnalysis = {
  id: string;
  planningCandidateId: string;
  analysis: null | {
    goal: string;
    objective: string;
    assumptions: string[];
    paths: Array<{ key: string; title: string; summary: string; advantages: string[]; disadvantages: string[] }>;
    recommendation: { pathKey: string; why: string };
    firstAction: { title: string; why: string; durationMinutes: number; completionSignal: string };
    limitations: string[];
    confidence: number;
  };
  provider: string;
  mode: string;
  fallbackReason: string | null;
  status: string;
  createdAt: string;
};

type PlanningAnalysisSnapshot = {
  analyses: PlanningAnalysis[];
  boundary: { candidateOnly: boolean; contextEligible: boolean; formalMutationAllowed: boolean; createsFormalPlan: boolean };
};

const categoryLabels: Record<string, string> = {
  idea: "想法",
  wish: "愿望",
  unfinished_plan: "未完成计划",
  future_goal: "未来目标",
  opportunity: "可能机会",
  other: "其他",
};

const statusLabels: Record<PlanningCandidate["status"], string> = {
  captured: "已捕获",
  analyzing: "分析中",
  candidate_plan_ready: "候选方案待审",
  approved: "已批准进入规划准备",
  archived: "已归档",
};

const sourceLabels: Record<string, string> = {
  owner_input: "Owner 直接输入",
  orb: "Genesis Orb",
  self_input: "自我输入",
  knowledge: "知识来源",
  imported: "导入记录",
};

export function PlanningBuffer({
  initialSnapshot,
  initialAnalysisSnapshot,
}: {
  initialSnapshot: PlanningBufferSnapshot;
  initialAnalysisSnapshot: PlanningAnalysisSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [analysisSnapshot, setAnalysisSnapshot] = useState(initialAnalysisSnapshot);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("idea");
  const [filter, setFilter] = useState<"active" | "approved" | "archived" | "all">("active");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const draftRequestId = useRef<string | null>(null);

  const candidates = useMemo(() => snapshot.candidates.filter((item) => {
    if (filter === "active") return item.status !== "archived";
    if (filter === "approved") return item.status === "approved";
    if (filter === "archived") return item.status === "archived";
    return true;
  }), [filter, snapshot.candidates]);

  async function capture(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const clientRequestId = draftRequestId.current ?? crypto.randomUUID();
    draftRequestId.current = clientRequestId;
    try {
      const response = await fetch("/api/planning-buffer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, source: "owner_input", clientRequestId }),
      });
      const data = await response.json() as { duplicate: boolean; snapshot: PlanningBufferSnapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "规划想法保存失败");
      setSnapshot(data.snapshot);
      setMessage(data.duplicate ? "这次提交已保存过，没有生成重复记录。" : "已保存到规划缓存区。它仍是待审候选，不会进入正式计划。 ");
      draftRequestId.current = null;
      setTitle("");
      setDescription("");
      setCategory("idea");
      setFilter("active");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "规划想法保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function transition(id: string, action: "approve" | "archive" | "reopen") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/planning-buffer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, clientRequestId: crypto.randomUUID() }),
      });
      const data = await response.json() as { snapshot: PlanningBufferSnapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "规划候选状态更新失败");
      setSnapshot(data.snapshot);
      setMessage(action === "approve"
        ? "已批准进入后续规划准备；尚未创建 Goal、Mission 或 Daily Plan。"
        : action === "archive" ? "已归档，历史与来源仍保留。" : "已重新放回规划缓存区。 ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "规划候选状态更新失败");
    } finally {
      setBusy(false);
    }
  }

  async function analyze(candidateId: string) {
    if (busy) return;
    setBusy(true);
    setMessage("正在把这个想法拆成可比较路径…");
    try {
      const response = await fetch("/api/planning-buffer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, clientRequestId: crypto.randomUUID() }),
      });
      const data = await response.json() as { snapshot: PlanningAnalysisSnapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "规划拆解失败");
      setAnalysisSnapshot(data.snapshot);
      const refreshed = await fetch("/api/planning-buffer", { cache: "no-store" });
      if (refreshed.ok) setSnapshot(await refreshed.json() as PlanningBufferSnapshot);
      setMessage("已生成待审规划拆解。它不会自动创建 Goal、Mission 或 Daily Plan。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "规划拆解失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="planning-buffer-page" aria-label="未来规划缓存区">
      <section className="planning-buffer-hero">
        <div>
          <span className="section-kicker">Phase 5 · 个人智能层</span>
          <h2>先保存未来，再决定是否行动</h2>
          <p>把模糊想法、愿望和机会暂存在这里。它们不会自动变成正式目标、使命或每日计划。</p>
        </div>
        <div className="planning-buffer-metrics" aria-label="规划缓存统计">
          <span><b>{snapshot.counts.active}</b>当前条目</span>
          <span><b>{snapshot.counts.captured}</b>待判断</span>
          <span><b>{snapshot.counts.approved}</b>已批准准备</span>
        </div>
      </section>

      <section className="planning-capture-panel">
        <div className="section-heading">
          <div><span className="section-kicker">捕获意图</span><h3>最近想到的未来事项是什么？</h3></div>
          <Inbox aria-hidden="true" size={20} />
        </div>
        <form onSubmit={capture} className="planning-capture-form">
          <label>标题<input required minLength={2} maxLength={160} value={title} onChange={(event) => { setTitle(event.target.value); draftRequestId.current = null; }} placeholder="例如：明年参加一次 AI 竞赛" /></label>
          <label>详细说明<textarea required minLength={4} maxLength={5000} value={description} onChange={(event) => { setDescription(event.target.value); draftRequestId.current = null; }} placeholder="写下原因、目前想到的方向或还不确定的地方……" /></label>
          <div className="planning-form-row">
            <label>类型<select value={category} onChange={(event) => { setCategory(event.target.value); draftRequestId.current = null; }}>
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <button type="submit" className="primary-button" disabled={busy}><Plus aria-hidden="true" size={16} />{busy ? "正在保存…" : "加入规划缓存"}</button>
          </div>
        </form>
        {message ? <p className="form-message" role="status">{message}</p> : null}
      </section>

      <section className="planning-list-panel">
        <div className="section-heading planning-list-heading">
          <div><span className="section-kicker">Owner 控制区</span><h3>规划候选</h3></div>
          <label>查看<select aria-label="筛选规划候选" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="active">当前条目</option><option value="approved">已批准准备</option><option value="archived">已归档</option><option value="all">全部</option>
          </select></label>
        </div>
        {candidates.length ? <div className="planning-candidate-list">{candidates.map((candidate) => {
          const analysis = analysisSnapshot.analyses.find((item) => item.planningCandidateId === candidate.id && item.status === "pending");
          return (
          <article key={candidate.id} className={`planning-candidate planning-status-${candidate.status}`}>
            <header><div><span className="planning-status-chip">{statusLabels[candidate.status]}</span><h4>{candidate.title}</h4></div><span>{categoryLabels[candidate.category] || candidate.category}</span></header>
            <p>{candidate.description}</p>
            <div className="planning-candidate-meta"><span><Clock3 aria-hidden="true" size={14} />{new Date(candidate.createdAt).toLocaleString("zh-CN")}</span><span>{sourceLabels[candidate.source] || candidate.source}</span></div>
            {analysis?.analysis ? (
              <section className="planning-analysis" aria-label={`${candidate.title} 的待审规划拆解`}>
                <div className="planning-analysis-intro">
                  <span><Sparkles aria-hidden="true" size={15} />AI 待审拆解</span>
                  <h5>{analysis.analysis.objective}</h5>
                </div>
                <div className="decision-trace" aria-label="规划路径比较">
                  {analysis.analysis.paths.map((path) => (
                    <article key={path.key} className={path.key === analysis.analysis?.recommendation.pathKey ? "is-recommended" : undefined}>
                      <header><GitBranch aria-hidden="true" size={15} /><strong>{path.title}</strong>{path.key === analysis.analysis?.recommendation.pathKey ? <span>建议优先验证</span> : null}</header>
                      <p>{path.summary}</p>
                      <dl><dt>优势</dt><dd>{path.advantages.join("；")}</dd><dt>代价</dt><dd>{path.disadvantages.join("；")}</dd></dl>
                    </article>
                  ))}
                </div>
                <div className="first-action-panel">
                  <span>最小行动 · {analysis.analysis.firstAction.durationMinutes} 分钟</span>
                  <strong>{analysis.analysis.firstAction.title}</strong>
                  <p>{analysis.analysis.firstAction.why}</p>
                  <small>完成信号：{analysis.analysis.firstAction.completionSignal}</small>
                </div>
                <details><summary>为什么推荐与当前限制</summary><p>{analysis.analysis.recommendation.why}</p><ul>{analysis.analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p className="audit-note">来源：{analysis.provider} · {analysis.mode === "real" ? "实时模型" : "本地安全降级"} · 置信度 {Math.round(analysis.analysis.confidence * 100)}%</p></details>
              </section>
            ) : null}
            <details><summary>查看来源与边界</summary><dl><dt>记录 ID</dt><dd>{candidate.id}</dd><dt>批准状态</dt><dd>{candidate.approvalState === "approved" ? "Owner 已批准准备" : "待 Owner 判断"}</dd><dt>ContextEngine</dt><dd>不可进入</dd><dt>正式数据修改</dt><dd>不允许</dd></dl></details>
            <footer>
              {candidate.status === "captured" ? <button disabled={busy} className="primary-button" onClick={() => void analyze(candidate.id)}><Sparkles aria-hidden="true" size={15} />拆解成可执行路径</button> : null}
              {(candidate.status === "captured" || candidate.status === "candidate_plan_ready") ? <button disabled={busy} className="primary-button" onClick={() => void transition(candidate.id, "approve")}><Check aria-hidden="true" size={15} />批准进入规划准备</button> : null}
              {candidate.status !== "archived" ? <button disabled={busy} className="secondary-button" onClick={() => void transition(candidate.id, "archive")}><Archive aria-hidden="true" size={15} />归档</button> : <button disabled={busy} className="secondary-button" onClick={() => void transition(candidate.id, "reopen")}><RotateCcw aria-hidden="true" size={15} />重新放回缓存区</button>}
            </footer>
          </article>
        );})}</div> : <div className="planning-empty-state"><ShieldCheck aria-hidden="true" size={22} /><h4>这里还没有对应的规划候选</h4><p>先记录一个真实想法。Genesis 不会用示例数据替你制造未来计划，也不会自动写入正式状态。</p></div>}
      </section>
    </div>
  );
}
