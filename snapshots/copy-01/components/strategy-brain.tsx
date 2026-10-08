"use client";

import Link from "next/link";
import { useState } from "react";

type Plan = { goal: string; why: string; evidenceIds: string[]; actions: string[]; avoid: string[]; successMetric: string; risk: string };
type Gap = { name: string; currentLevel: number; targetLevel: number; action: string; verification: string; evidenceIds: string[] };
type Generated = { currentPosition: string; targetPosition: string; opportunity: string; risk: string; priorityRanking: string[]; abilityGaps: Gap[]; plans: Record<string, Plan>; confidence: number; limitations: string[] };
type Candidate = { id: string; status: "pending" | "approved" | "rejected"; generatedStrategy: Generated; confidence: number; evidenceIds: string[]; created_at: string; reject_reason?: string | null };
type Strategy = { id: string; diagnosis: Omit<Generated, "plans" | "confidence" | "limitations">; strategies: Record<string, Plan>; confidence: number; evidenceIds: string[]; created_at: string };
type Snapshot = { strategy: Strategy | null; strategies: Strategy[]; candidates: Candidate[]; simulation: { analysis: { recommendedOption: string; reason: string; opposingView: string; wrongChoiceRisk: string; options: Array<{ name: string; shortTerm: string; longTerm: string; goalFit: number }> } } | null; ceoReview: { review: { achievement: string; waste: string; drift: string; nextFocus: string; strategyExecutionRate?: number } } | null; feedback: Array<{ strategy_id: string }> };

const id = () => crypto.randomUUID();

function CandidateView({ candidate, busy, onApprove, onReject }: { candidate: Candidate; busy: boolean; onApprove: () => Promise<void>; onReject: () => Promise<void> }) {
  const strategy = candidate.generatedStrategy;
  return <section className="growth-card" aria-label="战略待确认建议">
    <span className="section-kicker">战略待确认建议 · 等待审批</span>
    <h2>成为正式战略前请先审查</h2>
    <p>{strategy.currentPosition}</p>
    <p><b>90 天方向：</b> {strategy.plans.d90?.goal}</p>
    <p><b>证据：</b> {candidate.evidenceIds.join(", ") || "未引用证据"}</p>
    <p><b>置信度：</b> {Math.round(candidate.confidence * 100)}%</p>
    <div className="cognition-actions">
      <button disabled={busy} onClick={() => void onApprove()}>批准建议</button>
      <button disabled={busy} onClick={() => void onReject()}>拒绝建议</button>
    </div>
    <small>批准后会创建只读正式战略，但绝不会修改目标、能力或证据。</small>
  </section>;
}

function FormalStrategy({ strategy }: { strategy: Strategy }) {
  return <>
    <section className="growth-card" aria-label="当前战略">
      <div className="section-heading"><div><span className="section-kicker">已批准战略</span><h2>当前战略位置</h2></div><Link href={`/strategy/${strategy.id}`}>查看详情</Link></div>
      <p>{strategy.diagnosis.currentPosition}</p>
      <p><b>目标：</b> {strategy.diagnosis.targetPosition}</p>
      <p><b>机会：</b> {strategy.diagnosis.opportunity}</p>
      <p><b>风险：</b> {strategy.diagnosis.risk}</p>
      <p><b>优先级：</b> {strategy.diagnosis.priorityRanking.join(" > ")}</p>
    </section>
    <section className="growth-card"><h2>关键能力差距</h2>{strategy.diagnosis.abilityGaps.map((gap) => <article key={gap.name}><strong>{gap.name}：{gap.currentLevel}/5 → {gap.targetLevel}/5</strong><p>{gap.action}</p><small>验证方式：{gap.verification} · {gap.evidenceIds.join(", ")}</small></article>)}</section>
    <section className="recommendation-grid" aria-label="战略计划">{Object.entries(strategy.strategies).map(([period, plan]) => <article key={period}><span>{period}</span><strong>{plan.goal}</strong><p>{plan.why}</p><p>行动：{plan.actions.join("；")}</p><p>避免：{plan.avoid.join("；") || "无"}</p><small>成功标准：{plan.successMetric} · 风险：{plan.risk}</small></article>)}</section>
  </>;
}

export function StrategyBrain({ initialSnapshot }: { initialSnapshot: unknown }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot as Snapshot);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const candidate = snapshot.candidates.find((item) => item.status === "pending") || null;

  async function post(path: string, body?: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json() as { error?: string; snapshot?: Snapshot; duplicate?: boolean };
      if (!response.ok) throw new Error(data.error || "战略请求失败");
      if (data.snapshot) setSnapshot(data.snapshot);
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "战略请求失败");
      return null;
    } finally { setBusy(false); }
  }

  async function generate() {
    const result = await post("/api/strategy", { action: "generate", clientRequestId: id() });
    if (result) setMessage(result.duplicate ? "已载入现有待确认建议。" : "战略建议已生成，请在批准前审查。 ");
  }
  async function approve() {
    if (!candidate) return;
    const result = await post(`/api/strategy/candidates/${candidate.id}/approve`, {});
    if (result) setMessage("战略建议已批准，并创建正式战略。 ");
  }
  async function reject() {
    if (!candidate) return;
    const reason = window.prompt("这条战略为什么不适合？") || "用户拒绝此战略建议。";
    const result = await post(`/api/strategy/candidates/${candidate.id}/reject`, { reason });
    if (result) setMessage("战略建议已拒绝，没有创建正式战略。 ");
  }
  async function simulate() {
    const result = await post("/api/strategy", { action: "simulate", clientRequestId: id(), question });
    if (result) setMessage("决策模拟已保存。 ");
  }
  async function ceoReview() {
    const result = await post("/api/strategy", { action: "ceo_review", clientRequestId: id() });
    if (result) setMessage("每周 CEO 复盘已保存。 ");
  }

  const formal = snapshot.strategy;
  const simulation = snapshot.simulation?.analysis;
  const ceo = snapshot.ceoReview?.review;
  return <main className="cognition-page">
    <span className="section-kicker">Genesis 战略大脑</span><h1>战略决策中心</h1>
    <p>战略输出由证据支持，并在你批准前保持待确认建议状态。它绝不会修改正式目标、能力或证据。</p>
    <section className="cognition-actions"><button disabled={busy || Boolean(candidate)} onClick={() => void generate()}>生成战略建议</button><button disabled={busy} onClick={() => void ceoReview()}>生成每周 CEO 复盘</button></section>
    {message ? <p role="status">{message}</p> : null}
    {candidate ? <CandidateView candidate={candidate} busy={busy} onApprove={approve} onReject={reject} /> : null}
    {formal ? <FormalStrategy strategy={formal} /> : <section className="empty"><strong>暂无已批准战略</strong><p>先生成建议、审查证据，再明确批准。</p></section>}
    <section className="growth-card"><h2>决策模拟器</h2><textarea aria-label="决策问题" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="我应该学习 X，还是先完成 Y 项目？" /><button disabled={busy || question.trim().length < 5} onClick={() => void simulate()}>比较三个选项</button>{simulation ? <><p><b>建议：</b> {simulation.recommendedOption} — {simulation.reason}</p><p><b>反方观点：</b> {simulation.opposingView}</p><p><b>错误选择风险：</b> {simulation.wrongChoiceRisk}</p>{simulation.options.map((option) => <article key={option.name}><strong>{option.name}</strong><p>{option.shortTerm} / {option.longTerm} / 目标契合度 {Math.round(option.goalFit * 100)}%</p></article>)}</> : null}</section>
    {ceo ? <section className="growth-card"><h2>每周 CEO 复盘</h2><p><b>成果：</b> {ceo.achievement}</p><p><b>浪费：</b> {ceo.waste}</p><p><b>战略偏移：</b> {ceo.drift}</p><p><b>下一重点：</b> {ceo.nextFocus}</p><p><b>战略执行率：</b> {Math.round((ceo.strategyExecutionRate || 0) * 100)}%</p></section> : null}
  </main>;
}
