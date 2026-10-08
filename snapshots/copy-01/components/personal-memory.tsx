"use client";

import { useState } from "react";

type Candidate = { id: string; memoryType: string; content: string; reasoning: string; sourceKnowledgeIds: string[]; importance: number; confidence: number; status: "pending" | "approved" | "rejected"; provider: string; mode: string; fallbackReason: string | null; rejectReason: string | null };
type Profile = { id: string; memoryType: string; content: string; sourceKnowledgeIds: string[]; importance: number; confidence: number; confirmedAt: string };
type Ranked = { id: string; content: string; sourceKind: "confirmed_memory" | "raw_knowledge"; score: number };
type Snapshot = { profile: Profile[]; candidates: Candidate[]; ranked: Ranked[]; rawKnowledgeCount: number };

const label: Record<string, string> = {
  long_term_goal: "长期目标", stable_preference: "稳定偏好", learning_pattern: "学习模式", project_direction: "项目方向", confirmed_ability_trait: "已确认能力特点",
};

export function PersonalMemory({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(body?: Record<string, unknown>, search = "") {
    const response = await fetch(search ? `/api/memory?q=${encodeURIComponent(search)}` : "/api/memory", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await response.json() as { snapshot?: Snapshot; error?: string; unavailable?: string; created?: number; duplicate?: boolean };
    if (!response.ok) throw new Error(data.error || "长期记忆请求失败");
    if (data.snapshot) setSnapshot(data.snapshot);
    return data;
  }

  async function consolidate() {
    setBusy(true); setMessage("");
    try {
      const data = await request({ action: "consolidate", clientRequestId: crypto.randomUUID() });
      setMessage(data.unavailable || (data.duplicate ? "本次记忆整合请求已存在。" : data.created ? `已生成 ${data.created} 条记忆待确认建议。` : "当前无需生成新的记忆建议。"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "记忆整合失败"); }
    finally { setBusy(false); }
  }

  async function decide(candidateId: string, action: "approve" | "reject") {
    setBusy(true); setMessage("");
    try {
      await request(action === "approve" ? { action, candidateId } : { action, candidateId, reason: "用户拒绝此记忆待确认建议。" });
      setMessage(action === "approve" ? "记忆建议已确认为长期记忆。" : "记忆建议已拒绝。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "记忆决策失败"); }
    finally { setBusy(false); }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const data = await request(undefined, query); setMessage(`已按相关性、新近性、重要性与置信度排序 ${data.snapshot?.ranked.length || 0} 条记忆。`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "记忆检索失败"); }
    finally { setBusy(false); }
  }

  const pending = snapshot.candidates.filter((candidate) => candidate.status === "pending");
  return <main className="cognition-page" aria-label="个人长期记忆智能">
    <span className="section-kicker">Genesis · 个人长期记忆</span><h1>长期记忆</h1>
    <p>原始知识可以形成记忆待确认建议，但只有你的确认才能写入长期记忆。该流程不会修改正式目标、能力、证据或战略。</p>
    <section className="growth-card"><div className="section-heading"><div><span>原始知识库记录：{snapshot.rawKnowledgeCount}</span><h2>安全整合记忆</h2></div><button className="primary-button" disabled={busy} onClick={() => void consolidate()}>创建记忆建议</button></div>{message ? <p role="status">{message}</p> : null}</section>
    <section className="growth-card"><form onSubmit={search} className="cognition-reflection"><label>检索并排序记忆<input aria-label="检索并排序记忆" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：FastAPI、项目、学习习惯" /></label><button className="secondary-button" disabled={busy}>检索</button></form><div className="evidence-list">{snapshot.ranked.map((memory) => <article className="evidence-item-card" key={`${memory.sourceKind}:${memory.id}`}><strong>{memory.sourceKind === "confirmed_memory" ? "已确认长期记忆" : "原始知识库记录"}</strong><p className="evidence-description">{memory.content}</p><small>检索得分：{Math.round(memory.score * 100)}%</small></article>)}</div></section>
    <section className="growth-card" aria-label="记忆待确认建议"><h2>记忆待确认建议</h2>{pending.length ? <div className="candidate-grid">{pending.map((candidate) => <article key={candidate.id}><div className="candidate-title"><span>{label[candidate.memoryType]}</span><small>置信度 {Math.round(candidate.confidence * 100)}%</small></div><strong>{candidate.content}</strong><p>{candidate.reasoning}</p><details><summary>查看来源与技术信息</summary><small>来源：{candidate.sourceKnowledgeIds.join(", ")}</small><small>重要性：{Math.round(candidate.importance * 100)}% · {candidate.mode}</small>{candidate.fallbackReason ? <small>降级原因：{candidate.fallbackReason}</small> : null}</details><div className="candidate-actions"><button disabled={busy} onClick={() => void decide(candidate.id, "approve")}>确认记忆</button><button disabled={busy} onClick={() => void decide(candidate.id, "reject")}>拒绝</button></div></article>)}</div> : <p>当前没有待确认记忆建议。</p>}</section>
    <section className="growth-card" aria-label="长期记忆"><h2>长期记忆档案</h2>{snapshot.profile.length ? <div className="evidence-list">{snapshot.profile.map((memory) => <article className="evidence-item-card" key={memory.id}><strong>{label[memory.memoryType]}</strong><p className="evidence-description">{memory.content}</p><small>确认时间 {memory.confirmedAt} · 重要性 {Math.round(memory.importance * 100)}% · 置信度 {Math.round(memory.confidence * 100)}%</small></article>)}</div> : <p>当前还没有已确认长期记忆。</p>}</section>
  </main>;
}
