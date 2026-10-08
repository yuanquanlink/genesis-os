"use client";

import { useState } from "react";

type Candidate = { id: string; title: string; description: string; sourceGoal: string; priority: string; deadline: string; evidenceRequirement: string; dailyTasks: string[]; evidenceIds: string[]; confidence: number; status: "candidate" | "approved" | "rejected"; mode: string; fallbackReason: string | null };
type Mission = { id: string; title: string; description: string; sourceGoal: string; strategyId: string; status: string; priority: string; deadline: string; evidenceRequirement: string; dailyTasks: string[]; completedAt: string | null };
type Link = { missionId: string; evidenceId: string; growthCandidateId: string | null; completionSummary: string };
type Snapshot = { candidates: Candidate[]; missions: Mission[]; evidence: Link[] };
const priorityLabel: Record<string, string> = { critical: "紧急", high: "高", medium: "中", low: "低" };

export function AgentActionLayer({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [completion, setCompletion] = useState<Record<string, string>>({});

  async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { snapshot?: Snapshot; error?: string; unavailable?: string; duplicate?: boolean; growthCandidateId?: string | null; analysisPending?: boolean };
    if (!response.ok) throw new Error(data.error || "使命请求失败");
    if (data.snapshot) setSnapshot(data.snapshot);
    return data;
  }

  async function run(body: Record<string, unknown>, success: string) {
    setBusy(true); setMessage("");
    try {
      const data = await send(body);
      setMessage(data.unavailable || (data.analysisPending ? "使命已完成，原始证据已保存；证据分析等待重试。" : data.duplicate ? "已返回现有使命建议。" : success));
    } catch (error) { setMessage(error instanceof Error ? error.message : "使命请求失败"); }
    finally { setBusy(false); }
  }

  const pending = snapshot.candidates.filter((candidate) => candidate.status === "candidate");
  const active = snapshot.missions.filter((mission) => mission.status === "active");
  return <main className="cognition-page" aria-label="使命执行层">
    <span className="section-kicker">Genesis · 用户确认后执行</span><h1>使命行动层</h1>
    <p>Genesis 只能从已批准战略生成一条使命建议。你确认后它才会激活；完成使命会形成原始证据和待确认的证据建议，绝不会直接更新能力。</p>
    <section className="growth-card"><div className="section-heading"><div><span>战略 &rarr; 使命建议 &rarr; 确认 &rarr; 证据</span><h2>把战略转化为有边界的交付闭环</h2></div><button className="primary-button" disabled={busy} onClick={() => void run({ action: "generate", clientRequestId: crypto.randomUUID() }, "使命待确认建议已生成。")}>生成使命建议</button></div>{message ? <p role="status">{message}</p> : null}</section>
    <section className="growth-card" aria-label="使命待确认建议"><h2>使命待确认建议</h2>{pending.length ? <div className="candidate-grid">{pending.map((candidate) => <article key={candidate.id}><div className="candidate-title"><span>{priorityLabel[candidate.priority] || candidate.priority}</span><small>置信度 {Math.round(candidate.confidence * 100)}%</small></div><strong>{candidate.title}</strong><p>{candidate.description}</p><p><b>目标：</b> {candidate.sourceGoal}</p><p><b>截止日期：</b> {new Date(candidate.deadline).toLocaleDateString("zh-CN")}</p><p><b>证据要求：</b> {candidate.evidenceRequirement}</p><details><summary>查看来源</summary><small>认知引用：{candidate.evidenceIds.join(", ")}</small></details><div className="candidate-actions"><button disabled={busy} onClick={() => void run({ action: "approve", candidateId: candidate.id }, "使命已激活。")}>确认使命</button><button disabled={busy} onClick={() => void run({ action: "reject", candidateId: candidate.id, reason: "用户拒绝此使命待确认建议。" }, "使命建议已拒绝。")}>拒绝</button></div></article>)}</div> : <p>当前没有待确认使命建议。</p>}</section>
    <section className="growth-card" aria-label="进行中的使命"><h2>进行中的使命</h2>{active.length ? <div className="evidence-list">{active.map((mission) => <article className="evidence-item-card" key={mission.id}><div className="evidence-item-heading"><div><strong>{mission.title}</strong><p>{mission.description}</p></div><span className="evidence-status verified">{priorityLabel[mission.priority] || mission.priority}</span></div><p><b>今日任务：</b> {mission.dailyTasks.join("；")}</p><p><b>所需证据：</b> {mission.evidenceRequirement}</p><p><b>截止日期：</b> {new Date(mission.deadline).toLocaleDateString("zh-CN")}</p><label>完成证据<textarea aria-label={`${mission.title} 的完成证据`} value={completion[mission.id] || ""} onChange={(event) => setCompletion({ ...completion, [mission.id]: event.target.value })} placeholder="说明实际完成内容、产物位置、验证方式与仍存在的限制。" /></label><div className="candidate-actions"><button disabled={busy || (completion[mission.id] || "").trim().length < 10} onClick={() => void run({ action: "complete", missionId: mission.id, completionSummary: completion[mission.id], clientRequestId: crypto.randomUUID() }, "使命已完成，证据待确认建议已生成。")}>完成并创建证据</button><button disabled={busy} onClick={() => void run({ action: "fail", missionId: mission.id }, "使命已标记为失败。")}>标记失败</button></div></article>)}</div> : <p>当前没有进行中的使命。先确认一条使命建议，再开始有边界的交付闭环。</p>}</section>
    <section className="growth-card"><h2>使命证据</h2>{snapshot.evidence.length ? snapshot.evidence.map((link) => <article key={`${link.missionId}:${link.evidenceId}`}><strong>证据 {link.evidenceId}</strong><p>{link.completionSummary}</p><small>{link.growthCandidateId ? `待确认成长证据建议：${link.growthCandidateId}` : "证据分析待处理"}</small></article>) : <p>暂无使命证据。</p>}</section>
  </main>;
}
