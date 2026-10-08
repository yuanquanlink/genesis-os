"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, FileCheck2, Moon, RefreshCw, ShieldCheck, Sun, Target } from "lucide-react";
import type { DailyLearningLoopSnapshot } from "@/lib/domain/daily-learning-loop";
export type { DailyLearningLoopSnapshot } from "@/lib/domain/daily-learning-loop";

async function post(body: unknown) {
  const response = await fetch("/api/daily-learning-loop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = (await response.json()) as { error?: string; issues?: Array<{ message: string }> };
  if (!response.ok) throw new Error(result.error || result.issues?.[0]?.message || "Daily Learning Loop 操作失败");
  return result;
}

export function DailyLearningLoopPanel({ goalId, snapshot, busy, run }: {
  goalId: string;
  snapshot: DailyLearningLoopSnapshot;
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}) {
  const brief = snapshot.briefs.find((item) => item.goalId === goalId);
  const reflection = snapshot.reflections.find((item) => item.goalId === goalId && (!brief || item.reflectionDate === brief.briefDate));
  const report = snapshot.reports.find((item) => item.goalId === goalId && (!brief || item.reportDate === brief.briefDate));
  const plan = snapshot.plans.find((item) => item.goalId === goalId);
  const requestId = useRef(crypto.randomUUID());
  const [form, setForm] = useState({
    actualMinutes: brief?.estimatedMinutes || 60, completed: "", stuck: "", biggestGain: "",
    unfinished: "", unfinishedReason: "", tomorrowAvailableMinutes: brief?.estimatedMinutes || 60,
    strategyAlignment: "partial" as "aligned" | "partial" | "off_track", strategyAdjustment: "",
  });
  return (
    <section className="daily-loop-stack" aria-label="Daily Learning Loop">
      <div className="learning-card morning-brief">
        <div className="section-heading">
          <div><span className="section-kicker">Morning Brief · {brief?.briefDate || "今日"}</span><h2>今天唯一需要推进的学习闭环</h2></div>
          <div className="daily-loop-actions">
            <span className="agent-confidence">置信度 {Math.round((brief?.confidence || 0) * 100)}%</span>
            <button className="icon-button" title="刷新晨报" aria-label="刷新晨报" disabled={Boolean(busy)} onClick={() => void run("刷新晨报", () => post({ action: "refresh_morning", goalId }))}><RefreshCw size={16} /></button>
          </div>
        </div>
        {brief ? <>
          <div className="morning-primary"><Sun size={20} /><div><span>今日唯一主任务</span><strong>{brief.primaryTask}</strong><p>{brief.whyToday}</p></div><b><Clock3 size={14} /> {brief.estimatedMinutes} 分钟</b></div>
          <div className="morning-answer-grid">
            <div><span>当前主目标</span><strong>{brief.currentGoal}</strong></div>
            <div><span>当前阶段</span><strong>{brief.currentPhase}</strong></div>
            <div><span>昨日未掌握</span><p>{brief.previousGap}</p></div>
            <div><span>到期复习</span><p>{brief.reviewTasks.length ? brief.reviewTasks.join("；") : "今天没有到期复习。"}</p></div>
            <div><span>最弱概念</span><strong>{brief.weakestConcept}</strong></div>
            <div><span>工程挑战缺口</span><p>{brief.challengeGap}</p></div>
            <div><span>工期变化</span><p>{brief.estimateChange}</p></div>
            <div><span>当前最大风险</span><p>{brief.largestRisk}</p></div>
          </div>
          <div className="daily-source-line"><ShieldCheck size={14} /> {brief.sourceRefs.length} 个真实调度/证据来源 · 规则引擎聚合，不冒充 AI 推理</div>
        </> : <p>晨报正在等待学习目标数据。</p>}
      </div>

      {!reflection ? <form className="learning-card evening-reflection" onSubmit={(event) => {
        event.preventDefault();
        void run("保存晚间复盘并生成明日计划", async () => {
          await post({ action: "submit_evening", goalId, clientRequestId: requestId.current, ...form });
          requestId.current = crypto.randomUUID();
        });
      }}>
        <div className="section-heading"><div><span className="section-kicker">Evening Reflection</span><h2>先保存事实，再让 AI 分析</h2></div><Moon size={22} /></div>
        <div className="learning-form-grid reflection-grid">
          <label>实际学习时间（分钟）<input aria-label="实际学习时间（分钟）" type="number" min={0} max={720} value={form.actualMinutes} onChange={(event) => setForm({ ...form, actualMinutes: Number(event.target.value) })} /></label>
          <label>明日可用时间（分钟）<input aria-label="明日可用时间（分钟）" type="number" min={10} max={720} value={form.tomorrowAvailableMinutes} onChange={(event) => setForm({ ...form, tomorrowAvailableMinutes: Number(event.target.value) })} /></label>
          <label className="wide">今天实际完成了什么<textarea aria-label="今天实际完成了什么" required minLength={5} value={form.completed} onChange={(event) => setForm({ ...form, completed: event.target.value })} /></label>
          <label className="wide">哪里卡住<textarea aria-label="哪里卡住" value={form.stuck} onChange={(event) => setForm({ ...form, stuck: event.target.value })} /></label>
          <label className="wide">今天最大的收获<textarea aria-label="今天最大的收获" required minLength={3} value={form.biggestGain} onChange={(event) => setForm({ ...form, biggestGain: event.target.value })} /></label>
          <label className="wide">没有完成什么<textarea aria-label="没有完成什么" value={form.unfinished} onChange={(event) => setForm({ ...form, unfinished: event.target.value })} /></label>
          <label className="wide">未完成原因<textarea aria-label="未完成原因" value={form.unfinishedReason} onChange={(event) => setForm({ ...form, unfinishedReason: event.target.value })} /></label>
          <label>战略一致性<select aria-label="战略一致性" value={form.strategyAlignment} onChange={(event) => setForm({ ...form, strategyAlignment: event.target.value as "aligned" | "partial" | "off_track" })}><option value="aligned">一致</option><option value="partial">部分一致</option><option value="off_track">偏离</option></select></label>
          <label className="wide">明日战略调整<textarea aria-label="明日战略调整" value={form.strategyAdjustment} onChange={(event) => setForm({ ...form, strategyAdjustment: event.target.value })} placeholder="明天如何回到已批准战略？" /></label>
        </div>
        <button className="primary-button" disabled={Boolean(busy)}><FileCheck2 size={16} />{busy ? "正在保存与分析…" : "保存复盘并生成日报"}</button>
        <small>原始反思会先进入时间线和低可信 Self Reflection Evidence；AI 失败时原文仍保留。</small>
      </form> : <div className="daily-reflection-saved"><CheckCircle2 size={17} /><span>晚间反思已保存：{reflection.actualMinutes} 分钟 · 战略{reflection.strategyAlignment === "aligned" ? "一致" : reflection.strategyAlignment === "off_track" ? "偏离" : "部分一致"} · 时间线{reflection.timelineEntryId ? "已关联" : "待关联"}</span></div>}

      {report ? <div className="learning-card daily-growth-report">
        <div className="section-heading"><div><span className="section-kicker">Daily Growth Report · {report.reportDate}</span><h2>事实、问题与反面解释</h2></div><span className={`mode ${report.modelMode === "demo" ? "demo" : ""}`}>{report.modelMode === "real" ? report.provider : "Demo / 安全降级"}</span></div>
        <div className="report-facts">{report.facts.map((fact) => <p key={`${fact.sourceRef}-${fact.statement}`}><b>事实</b>{fact.statement}<code>{fact.sourceRef}</code></p>)}</div>
        <div className="report-analysis-grid">
          <div><span>学习质量</span><p>{report.learningQuality}</p></div><div><span>最大问题</span><p>{report.largestProblem}</p></div>
          <div><span>另一种解释</span><p>{report.alternativeExplanation}</p></div><div><span>与 FDE 的关系</span><p>{report.fdeRelationship}</p></div>
          <div><span>应该保持</span><p>{report.keepDoing}</p></div><div><span>应该停止</span><p>{report.stopDoing}</p></div>
        </div>
        <div className="report-evidence-line"><span>新增 Evidence {report.newEvidence.length}</span><span>能力变化候选 {report.abilityChangeCandidates.length}</span><span>置信度 {Math.round(report.confidence * 100)}%</span><Link href="/evidence">查看证据与审批 <ArrowRight size={14} /></Link></div>
        <blockquote>{report.thinkingQuestion}</blockquote>
      </div> : null}

      {plan ? <div className="learning-card tomorrow-plan">
        <div className="section-heading"><div><span className="section-kicker">Tomorrow Plan · {plan.planDate}</span><h2>{plan.primaryFocus}</h2></div><CalendarClock size={22} /></div>
        <div className="tomorrow-plan-meta"><span><Clock3 size={14} /> 可用 {plan.availableMinutes} 分钟</span><span><Target size={14} /> 近 7 日完成率 {Math.round(plan.completionRate * 100)}%</span><span>到期复习 {plan.reviewTaskIds.length}</span><span>工程挑战 {plan.challengeIds.length}</span></div>
        <ol>{plan.actions.map((action) => <li key={action}>{action}</li>)}</ol><p className="plan-rationale">{plan.rationale}</p>
      </div> : null}
    </section>
  );
}
