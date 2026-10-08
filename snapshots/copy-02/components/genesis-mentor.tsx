"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Compass,
  FileText,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  MentorAnalysisRecord,
  MentorPerspective,
} from "@/lib/domain/mentor";

type GoalContext = {
  title: string;
  purpose: string;
  engineeringOutcome: string;
};

const perspectiveLabels: Record<MentorPerspective, string> = {
  first_principles: "第一性原理",
  engineer: "工程师",
  founder: "创业者",
  investor: "投资者",
  contrarian: "反方",
};

const perspectiveOptions = Object.keys(perspectiveLabels) as MentorPerspective[];

export function GenesisMentorPanel({ goal }: { goal?: GoalContext }) {
  const [prompt, setPrompt] = useState(
    goal
      ? `请结合 Genesis OS 画像和“${goal.title}”目标，指出当前最需要验证的一个问题。`
      : "请读取我的 Genesis OS 画像，区分事实与推测，指出当前最大问题并给出未来90天三个可验收行动。",
  );
  const [answer, setAnswer] = useState("");
  const [analysis, setAnalysis] = useState<MentorAnalysisRecord | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [perspectives, setPerspectives] = useState<MentorPerspective[]>([
    "first_principles", "engineer", "contrarian",
  ]);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai/mentor?limit=1", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("MENTOR_HISTORY_FAILED")))
      .then((data: { analyses?: MentorAnalysisRecord[] }) => {
        if (data.analyses?.[0]) setAnalysis(data.analyses[0]);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("最近导师分析暂时无法读取");
      });
    return () => controller.abort();
  }, []);

  function togglePerspective(lens: MentorPerspective) {
    setPerspectives((current) => current.includes(lens)
      ? current.length === 1 ? current : current.filter((item) => item !== lens)
      : [...current, lens]);
  }

  async function ask(module: "ai_mentor" | "daily_summary") {
    if (busy) return;
    setBusy(true);
    setAnswer("");
    if (module === "ai_mentor") setAnalysis(null);
    setStatus("正在读取 Context、Growth Graph 与 Evidence…");
    if (module === "ai_mentor" && !requestId.current) requestId.current = crypto.randomUUID();
    let completed = false;
    try {
      const response = await fetch("/api/ai/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          prompt,
          clientRequestId: module === "ai_mentor" ? requestId.current : undefined,
          perspectives,
          context: goal
            ? `页面当前选择的学习目标：${goal.title}\n目的：${goal.purpose}\n最终成果：${goal.engineeringOutcome}`
            : "页面当前没有选择学习目标；请以服务端 Genesis OS 证据为准。",
        }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "AI 请求失败");
      }
      setStatus(
        `${response.headers.get("X-AI-Provider") || "demo"} · ${response.headers.get("X-AI-Model") || "local"}`,
      );
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const line = block.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const item = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            error?: string;
            provider?: string;
            model?: string;
            mode?: string;
            analysis?: MentorAnalysisRecord;
            contextEvidenceCount?: number;
          };
          if (item.type === "analysis" && item.analysis) {
            setAnalysis(item.analysis);
            setStatus(`${item.analysis.provider} · ${item.analysis.model} · ${item.contextEvidenceCount ?? item.analysis.sourceRefs.length} 条 Context 证据`);
          }
          if (item.type === "delta" && item.text) setAnswer((current) => current + item.text);
          if (item.type === "done") {
            completed = true;
            if (item.provider && item.model)
              setStatus(`${item.provider} · ${item.model}${item.mode === "demo" ? " · Demo 降级" : " · Schema 已验证"}`);
          }
          if (item.type === "error") throw new Error(item.error || "AI 流式生成失败");
        }
        if (done) break;
      }
      if (module === "ai_mentor" && completed) requestId.current = null;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 请求失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="learning-card genesis-mentor" aria-label="Genesis Mentor">
      <div className="section-heading">
        <div><span className="section-kicker">Genesis Mentor · Deep Reasoning</span><h3>证据型长期导师</h3></div>
        <Sparkles size={20} />
      </div>
      <label className="mentor-question">分析问题
        <textarea aria-label="导师分析问题" value={prompt} onChange={(event) => setPrompt(event.target.value)} minLength={5} maxLength={4000} />
      </label>
      <div className="perspective-selector" aria-label="Perspective Panel 视角选择">
        {perspectiveOptions.map((lens) => <button key={lens} type="button" aria-pressed={perspectives.includes(lens)} onClick={() => togglePerspective(lens)}>{perspectiveLabels[lens]}</button>)}
      </div>
      <div className="proposal-actions mentor-actions">
        <button disabled={busy || prompt.trim().length < 5} onClick={() => void ask("ai_mentor")}><Brain size={15} />{busy ? "分析中…" : "运行深度导师分析"}</button>
        <button disabled={busy || prompt.trim().length < 5} onClick={() => void ask("daily_summary")}><FileText size={15} />生成今日总结</button>
      </div>
      <small role="status">{status || "等待分析"}</small>

      {analysis ? <div className="mentor-result" data-testid="mentor-deep-analysis">
        <div className="mentor-result-meta"><span>{analysis.modelMode === "real" ? "Real AI" : "Demo"}</span><span>置信 {Math.round(analysis.confidence * 100)}%</span><span>{analysis.sourceRefs.length} 个来源</span><time>{new Date(analysis.createdAt).toLocaleString("zh-CN")}</time></div>
        <div className="mentor-evidence-summary"><ShieldCheck size={17} /><p>{analysis.evidenceSummary}</p></div>

        <section className="mentor-reasoning-section"><h4><CheckCircle2 size={16} />事实与证据</h4>
          <div className="mentor-fact-list">{analysis.facts.length ? analysis.facts.map((fact, index) => <article key={`${fact.statement}-${index}`}><b>{fact.evidenceKind}</b><p>{fact.statement}</p><small>{fact.evidenceIds.join(" · ") || "无来源"}</small></article>) : <p>当前没有足够的可引用事实。</p>}</div>
        </section>

        <div className="mentor-reasoning-grid">
          <section><h4>模式</h4>{analysis.patterns.length ? analysis.patterns.map((item, index) => <article key={index}><p>{item.statement}</p><small>置信 {Math.round(item.confidence * 100)}% · {item.boundary}</small></article>) : <p>尚未识别稳定模式。</p>}</section>
          <section><h4>可能原因</h4>{analysis.possibleCauses.length ? analysis.possibleCauses.map((item, index) => <article key={index}><p>{item.statement}</p><small>验证：{item.verification}</small></article>) : <p>证据不足，暂不归因。</p>}</section>
          <section><h4>反面解释</h4><p>{analysis.counterExplanation}</p></section>
          <section><h4>长期影响</h4><p>{analysis.longTermImpact}</p></section>
        </div>

        {analysis.contradictions.length ? <section className="mentor-contradictions"><h4><Scale size={16} />矛盾与目标漂移</h4>{analysis.contradictions.map((item, index) => <article key={index}><p>{item.statement}</p><small>验证：{item.verification}</small></article>)}</section> : null}

        <section className="mentor-strategy"><h4><Compass size={16} />战略选择</h4>{analysis.strategicChoices.map((item, index) => <article key={index}><strong>{item.choice}</strong><p>{item.why}</p><small>取舍：{item.tradeoff}<br />成功标准：{item.successMetric}</small></article>)}</section>

        <section className="perspective-panel"><h4>Perspective Panel</h4><div>{analysis.perspectives.map((item) => <article key={item.lens}><span>{perspectiveLabels[item.lens]}</span><p>{item.interpretation}</p><strong>{item.challenge}</strong><small>{item.limitation}</small></article>)}</div></section>

        <section className="mentor-action-loop"><h4><Target size={16} />可验证行动</h4><ol>{analysis.actions.map((item, index) => <li key={index}><div><strong>{item.action}</strong><span>{item.deadline}</span></div><p>产物：{item.deliverable}</p><p>验收：{item.acceptanceEvidence}</p><small>待验证：{item.testsHypothesis}</small></li>)}</ol></section>

        <details className="mentor-limitations"><summary>来源与限制</summary>
          <div className="mentor-source-details" aria-label="Mentor recommendation sources">
            {(analysis.sourceDetails || []).map((source) => <article key={source.id} className={source.resolved ? "" : "unresolved-source"}><code>{source.id}</code><p>{source.source}</p><small>{source.evidenceKind} · {Math.round(source.confidence * 100)}% confidence · {source.occurredAt || "time unavailable"}</small></article>)}
          </div>
          <div className="mentor-source-tags">{analysis.sourceRefs.filter((source) => !(analysis.sourceDetails || []).some((detail) => detail.id === source)).map((source) => <code key={source}>{source}</code>)}</div>
          <ul>{analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      </div> : answer ? <div className="mentor-prompt"><Brain size={18} /><p>{answer}</p></div> : null}
    </section>
  );
}
