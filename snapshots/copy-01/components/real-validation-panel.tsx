"use client";

import { useEffect, useMemo, useState } from "react";

const ratingFields = [
  ["contextCorrectness", "认知准确度"],
  ["morningBriefUsefulness", "晨间简报价值"],
  ["dailyPlanRealism", "今日计划现实度"],
  ["learningTaskSpecificity", "学习任务可执行性"],
  ["strategicAlignment", "战略一致性"],
  ["reflectionDepth", "晚间复盘深度"],
  ["friction", "使用顺畅度（5 = 很顺畅）"],
  ["trust", "事实 / 自述 / AI 推断区分可信度"],
] as const;
const capabilityFields = [
  ["approved_context_inspection", "已确认认知检查"],
  ["morning_brief", "晨间简报"],
  ["daily_plan", "今日计划"],
  ["evening_reflection", "晚间复盘"],
  ["daily_close", "今日总结"],
] as const;
const taskTypes = [
  ["learning", "学习"],
  ["review", "复习"],
  ["project", "项目"],
  ["mission", "使命"],
  ["reflection", "复盘"],
  ["research", "研究"],
  ["administrative", "整理"],
  ["buffer", "缓冲"],
  ["other", "其他"],
] as const;
const defectCategories = [
  ["truth_boundary", "真值边界"],
  ["data_loss", "数据丢失"],
  ["daily_loop", "每日闭环"],
  ["experience", "核心体验"],
  ["usability", "使用摩擦"],
  ["polish", "细节优化"],
] as const;

type RealRecord = {
  sessionId: string;
  localDate: string;
  stage: string;
  references: {
    approvedContextProjectionIds: string[];
    morningBriefId: string | null;
    dailyPlanCandidateId: string | null;
    activeDailyPlanId: string | null;
    realTaskRefs: string[];
    taskType: string | null;
    artifactRefs: string[];
    evidenceExpectationRefs: string[];
    operatingReflectionId: string | null;
    reflectionCandidateSetId: string | null;
    dailyCloseRef: string | null;
  };
  facts: { dailyPlanGenerated: boolean; dailyPlanOwnerDecision: string; eveningReflectionSubmitted: boolean; followUpCandidateCreated: boolean };
  ownerActions: { approvedContextViewed: boolean; morningBriefViewed: boolean; realTaskStarted: boolean; realTaskCompletionState: string; actualTimeMinutes: number | null; dailyCloseViewed: boolean };
  feedback: Record<string, unknown> | null;
  defects: Array<{ severity: string; category?: string; summary: string }>;
  confirmedCapabilities: string[];
  ownerRealUseConfirmed: boolean;
  report: { targetPath: string; eligible: boolean; missingStages: string[] };
};
type Log = { date: string; realValidation: RealRecord | null };
type Snapshot = { logs: Log[] };

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function RealValidationPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [taskState, setTaskState] = useState("started");
  const [taskType, setTaskType] = useState("learning");
  const [taskRef, setTaskRef] = useState("");
  const [actualTime, setActualTime] = useState("");
  const [artifactRefs, setArtifactRefs] = useState("");
  const [evidenceExpectationRefs, setEvidenceExpectationRefs] = useState("");
  const [blockers, setBlockers] = useState("");
  const [notes, setNotes] = useState("");
  const [mostValuable, setMostValuable] = useState("");
  const [worstPart, setWorstPart] = useState("");
  const [tomorrowImprovement, setTomorrowImprovement] = useState("");
  const [defectSeverity, setDefectSeverity] = useState("P3");
  const [defectCategory, setDefectCategory] = useState("usability");
  const [defectSummary, setDefectSummary] = useState("");
  const [ratings, setRatings] = useState<Record<string, string>>(Object.fromEntries(ratingFields.map(([key]) => [key, ""])));
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()), []);
  const record = snapshot?.logs.find((item) => item.date === today)?.realValidation ?? null;
  const ratingComplete = ratingFields.every(([key]) => ratings[key]);

  async function load() {
    const response = await fetch("/api/beta-validation", { cache: "no-store" });
    const data = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(data.error || "真实使用验证记录暂时不可用");
    setSnapshot(data);
  }
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/beta-validation", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "真实使用验证记录暂时不可用");
      if (!cancelled) setSnapshot(data);
    }).catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "真实使用验证记录暂时不可用"); });
    return () => { cancelled = true; };
  }, []);
  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/beta-validation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { snapshot?: Snapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "真实使用验证操作失败");
      if (data.snapshot) setSnapshot(data.snapshot); else await load();
      setMessage(success);
    } catch (error) { setMessage(error instanceof Error ? error.message : "真实使用验证操作失败"); }
    finally { setBusy(false); }
  }
  const request = (action: string, extra: Record<string, unknown> = {}) => ({ action, logDate: today, clientRequestId: crypto.randomUUID(), ...extra });

  return <section className="daily-life-panel full-span day0-panel" aria-label="所有者真实使用验证">
    <div className="section-heading"><div><span className="section-kicker">Phase 4 Step 10 · 所有者真实 Day 1</span><h2>分别记录系统事实、所有者自述与 AI 推断</h2></div></div>
    {!record ? <>
      <p>这里不会模拟一天。只有在你真正开始所有者使用会话时才启动记录。</p>
      <button className="primary-button" disabled={busy} onClick={() => void send(request("start_day1"), "真实第 1 天记录已启动，没有伪造任何使用结果。")}>开始真实第 1 天</button>
    </> : <>
      <div className="validation-proof">
        <b>阶段：{record.stage}</b>
        <span>会话：{record.sessionId}</span>
        <span>本地日期：{record.localDate}</span>
        <span>系统事实 · 已生成计划：{record.facts.dailyPlanGenerated ? "是" : "否"}</span>
        <span>系统事实 · 所有者决策：{record.facts.dailyPlanOwnerDecision}</span>
        <span>系统事实 · 已提交复盘：{record.facts.eveningReflectionSubmitted ? "是" : "否"}</span>
        <span>用户自述 · 任务：{record.ownerActions.realTaskCompletionState}</span>
        <span>AI 推断 · 本面板绝不会自动晋升</span>
      </div>
      <div className="validation-proof">
        <b>Day 1 引用</b>
        <span>认知投影：{record.references.approvedContextProjectionIds.length}</span>
        <span>晨间简报：{record.references.morningBriefId || "未记录"}</span>
        <span>计划候选：{record.references.dailyPlanCandidateId || "未记录"}</span>
        <span>激活计划：{record.references.activeDailyPlanId || "未记录"}</span>
        <span>任务类型：{record.references.taskType || "未记录"}</span>
        <span>复盘：{record.references.operatingReflectionId || "未记录"}</span>
        <span>候选分析：{record.references.reflectionCandidateSetId || "未记录"}</span>
        <span>今日总结：{record.references.dailyCloseRef || "未记录"}</span>
        <small>{record.report.eligible ? `真实 Day 1 报告可在 ${record.report.targetPath} 生成。` : `报告仍缺少：${record.report.missingStages.join("、")}`}</small>
      </div>
      <div className="candidate-actions validation-actions">
        <button disabled={busy} onClick={() => void send(request("refresh_day1"), "已刷新持久化事实。")}>刷新事实</button>
        <button disabled={busy || record.ownerActions.approvedContextViewed} onClick={() => void send(request("record_view", { surface: "approved_context" }), "已根据所有者操作记录认知检查。")}>标记认知已检查</button>
        <button disabled={busy || record.ownerActions.morningBriefViewed} onClick={() => void send(request("record_view", { surface: "morning_brief" }), "已根据所有者操作记录晨间简报查看。")}>标记简报已查看</button>
        <button disabled={busy || record.ownerActions.dailyCloseViewed} onClick={() => void send(request("record_view", { surface: "daily_close" }), "已根据所有者操作记录今日总结查看。")}>标记总结已查看</button>
      </div>
      <div className="validation-form-grid">
        <label>真实任务状态<select aria-label="真实任务状态" value={taskState} onChange={(event) => setTaskState(event.target.value)}><option value="started">已开始</option><option value="completed">已完成</option><option value="partially_completed">部分完成</option><option value="blocked">受阻</option><option value="deferred">已延期</option></select></label>
        <label>任务类型<select aria-label="真实任务类型" value={taskType} onChange={(event) => setTaskType(event.target.value)}>{taskTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>任务引用<input aria-label="真实任务引用" value={taskRef} onChange={(event) => setTaskRef(event.target.value)} placeholder="例如真实项目、学习目标或计划块引用" /></label>
        <label>实际分钟数（仅所有者提供）<input aria-label="所有者提供的实际分钟数" type="number" min="0" max="720" value={actualTime} onChange={(event) => setActualTime(event.target.value)} placeholder="未知时留空" /></label>
        <label className="wide">产物引用（每行一条，不粘贴私密内容）<textarea aria-label="真实任务产物引用" value={artifactRefs} onChange={(event) => setArtifactRefs(event.target.value)} /></label>
        <label className="wide">预期证据引用（每行一条）<textarea aria-label="真实任务预期证据引用" value={evidenceExpectationRefs} onChange={(event) => setEvidenceExpectationRefs(event.target.value)} /></label>
        <label className="wide">阻塞引用（每行一条）<textarea aria-label="真实验证阻塞引用" value={blockers} onChange={(event) => setBlockers(event.target.value)} /></label>
        <button disabled={busy} onClick={() => void send(request("record_task_state", { state: taskState, taskType, taskRef: taskRef || undefined, actualTimeMinutes: actualTime === "" ? null : Number(actualTime), artifactRefs: lines(artifactRefs), evidenceExpectationRefs: lines(evidenceExpectationRefs), blockerRefs: lines(blockers) }), "所有者自述已记录；任务完成仍不能证明能力或真正掌握。")}>记录真实任务状态</button>
      </div>
      <div className="validation-form-grid" aria-label="所有者反馈评分">
        {ratingFields.map(([key, label]) => <label key={key}>{label}<select aria-label={label} value={ratings[key]} onChange={(event) => setRatings({ ...ratings, [key]: event.target.value })}><option value="">请选择</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></label>)}
        <label className="wide">今天最有价值的地方<textarea aria-label="今天最有价值的地方" value={mostValuable} onChange={(event) => setMostValuable(event.target.value)} /></label>
        <label className="wide">今天最差的地方<textarea aria-label="今天最差的地方" value={worstPart} onChange={(event) => setWorstPart(event.target.value)} /></label>
        <label className="wide">明天最希望改善什么<textarea aria-label="明天最希望改善什么" value={tomorrowImprovement} onChange={(event) => setTomorrowImprovement(event.target.value)} /></label>
        <label className="wide">所有者备注（可选）<textarea aria-label="真实验证所有者备注" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <label>缺陷等级<select aria-label="验证缺陷等级" value={defectSeverity} onChange={(event) => setDefectSeverity(event.target.value)}>{["P0", "P1", "P2", "P3", "P4"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>问题分类<select aria-label="验证问题分类" value={defectCategory} onChange={(event) => setDefectCategory(event.target.value)}>{defectCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="wide">缺陷摘要（可选）<input aria-label="验证缺陷摘要" value={defectSummary} onChange={(event) => setDefectSummary(event.target.value)} /></label>
        <button disabled={busy || !ratingComplete} onClick={() => void send(request("submit_owner_feedback", { feedback: { ...Object.fromEntries(Object.entries(ratings).map(([key, value]) => [key, Number(value)])), mostValuable, worstPart, tomorrowImprovement, ownerNotes: notes }, defects: defectSummary.trim().length >= 3 ? [{ severity: defectSeverity, category: defectCategory, summary: defectSummary }] : [], blockerRefs: lines(blockers) }), "所有者评分已原样保存，系统没有推断评分。")}>保存所有者反馈</button>
      </div>
      <fieldset className="validation-capabilities"><legend>只明确确认今天真实使用过的能力</legend>{capabilityFields.map(([value, label]) => <label key={value}><input type="checkbox" checked={capabilities.includes(value)} onChange={(event) => setCapabilities(event.target.checked ? [...capabilities, value] : capabilities.filter((item) => item !== value))} />{label}</label>)}</fieldset>
      <button className="secondary-button" disabled={busy || capabilities.length === 0 || !record.feedback} onClick={() => void send(request("confirm_real_use", { confirmRealUse: true, capabilities }), "所选能力只获得本日 Owner 确认；能力注册表状态没有自动修改。")}>确认所选真实使用</button>
    </>}
    {message ? <p role="status" className="form-message">{message}</p> : null}
  </section>;
}
