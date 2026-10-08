"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, Download, FileDown, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import type { IntegritySnapshot } from "@/lib/domain/data-integrity";
import type { UsageSnapshot } from "@/lib/services/usage-service";
import type { BetaValidationSnapshot } from "@/lib/services/beta-validation-service";

type BetaFeedback = {
  id: string;
  feedbackType: "issue" | "suggestion" | "difficulty";
  content: string;
  status: "pending" | "reviewed" | "resolved";
  createdAt: string;
  reviewedAt: string | null;
  resolvedAt: string | null;
};

function percent(value: number | null) { return value === null ? "暂无数据" : `${Math.round(value * 100)}%`; }
const feedbackTypeLabel: Record<BetaFeedback["feedbackType"], string> = { issue: "功能问题", suggestion: "建议", difficulty: "使用困难" };
const feedbackStatusLabel: Record<BetaFeedback["status"], string> = { pending: "待处理", reviewed: "已审查", resolved: "已解决" };

export function UsageDashboard({ initialSnapshot, initialFeedback, initialValidation }: { initialSnapshot: UsageSnapshot; initialFeedback: BetaFeedback[]; initialValidation: BetaValidationSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ records: number; recognizedTables: number; ignoredTables: string[] } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [integrity, setIntegrity] = useState<IntegritySnapshot | null>(null);
  const [integrityConfirmation, setIntegrityConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<BetaFeedback[]>(initialFeedback);
  const [feedbackType, setFeedbackType] = useState<BetaFeedback["feedbackType"]>("issue");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackTransitionId, setFeedbackTransitionId] = useState<string | null>(null);
  const [validation, setValidation] = useState(initialValidation);
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  async function submitFeedback(event: React.FormEvent) {
    event.preventDefault();
    setFeedbackBusy(true); setFeedbackMessage("");
    try {
      const response = await fetch("/api/beta-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackType, content: feedbackContent, clientRequestId: crypto.randomUUID() }) });
      const data = await response.json() as { duplicate?: boolean; snapshot?: { feedback: BetaFeedback[] }; error?: string };
      if (!response.ok) throw new Error(data.error || "反馈无法保存");
      setFeedback(data.snapshot?.feedback || []);
      setFeedbackContent("");
      setFeedbackMessage(data.duplicate ? "相同反馈请求已保存在本地。" : "反馈已保存在本地，不会发送给 AI 或外部服务。 ");
    } catch (error) { setFeedbackMessage(error instanceof Error ? error.message : "反馈无法保存"); }
    finally { setFeedbackBusy(false); }
  }

  async function transitionFeedback(id: string, status: "reviewed" | "resolved") {
    setFeedbackTransitionId(id); setFeedbackMessage("");
    try {
      const response = await fetch("/api/beta-feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      const data = await response.json() as { duplicate?: boolean; snapshot?: { feedback: BetaFeedback[] }; error?: string };
      if (!response.ok) throw new Error(data.error || "反馈状态无法更新");
      setFeedback(data.snapshot?.feedback || []);
      setFeedbackMessage(data.duplicate ? "此反馈已经是该状态。" : status === "reviewed" ? "反馈已在本地标记为已审查。" : "反馈已在本地标记为已解决。 ");
    } catch (error) { setFeedbackMessage(error instanceof Error ? error.message : "反馈状态无法更新"); }
    finally { setFeedbackTransitionId(null); }
  }

  async function captureValidation() {
    setValidationBusy(true); setValidationMessage("");
    try {
      const response = await fetch("/api/beta-validation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture" }) });
      const data = await response.json() as { duplicate?: boolean; snapshot?: BetaValidationSnapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "验证快照无法记录");
      if (data.snapshot) setValidation(data.snapshot);
      setValidationMessage(data.duplicate ? "已根据本地数据刷新今日验证快照。" : "今日验证快照已记录在本地。 ");
    } catch (error) { setValidationMessage(error instanceof Error ? error.message : "验证快照无法记录"); }
    finally { setValidationBusy(false); }
  }

  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch("/api/usage", { cache: "no-store" });
      const data = (await response.json()) as UsageSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "使用统计暂时不可用");
      setSnapshot(data);
      setMessage("统计已刷新。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "使用统计暂时不可用"); }
    finally { setBusy(false); }
  }

  async function importBackup(action: "preview" | "apply") {
    if (!file) { setMessage("请选择 Genesis JSON 备份文件。"); return; }
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("action", action);
      form.set("file", file);
      if (action === "apply") form.set("confirmation", confirmation);
      const response = await fetch("/api/data-portability", { method: "POST", body: form });
      const data = (await response.json()) as { error?: string; records?: number; recognizedTables?: number; ignoredTables?: string[]; inserted?: number; message?: string };
      if (!response.ok) throw new Error(data.error || "导入失败");
      if (action === "preview") {
        setPreview({ records: data.records || 0, recognizedTables: data.recognizedTables || 0, ignoredTables: data.ignoredTables || [] });
        setMessage("已完成只读预览，尚未写入任何数据。");
      } else {
        setPreview(null);
        setConfirmation("");
        setMessage(data.message || `已合并 ${data.inserted || 0} 条缺失记录。`);
        await refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "导入失败"); }
    finally { setBusy(false); }
  }

  async function inspectIntegrity(apply = false) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/data-integrity", apply ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", confirmation: integrityConfirmation }),
      } : { cache: "no-store" });
      const data = await response.json() as IntegritySnapshot & { snapshot?: IntegritySnapshot; repaired?: { rejectedCandidates: number; evidenceMarkedNeedsReview: number }; error?: string };
      if (!response.ok) throw new Error(data.error || "数据完整性检查失败。 ");
      setIntegrity(data.snapshot || data);
      if (apply) {
        setIntegrityConfirmation("");
        setMessage(`非正式数据清理完成：拒绝 ${data.repaired?.rejectedCandidates || 0} 条建议，标记 ${data.repaired?.evidenceMarkedNeedsReview || 0} 条证据等待复核。`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "数据完整性检查失败。 "); }
    finally { setBusy(false); }
  }

  const metrics = [
    ["今日输入", `${snapshot.metrics.todayInputs}`, "原始记录"],
    ["导师调用", `${snapshot.metrics.mentorCallsLast7Days}`, "近 7 天"],
    ["学习完成率", percent(snapshot.metrics.learningCompletionRate), "近 7 天任务"],
    ["能力证据", `${snapshot.metrics.evidenceTotal}`, `近 7 天 +${snapshot.metrics.evidenceAddedLast7Days}`],
    ["进行中使命", `${snapshot.metrics.activeMissions}`, `近 7 天完成 ${snapshot.metrics.completedMissionsLast7Days} 个`],
    ["战略一致性", percent(snapshot.metrics.strategyAlignmentRate), "近 7 天晚间复盘"],
  ];
  const betaMetrics = [
    ["Beta 运行", `${snapshot.beta.betaRunDays} 天`, "自首个本地 Beta 信号起"],
    ["每日闭环连续天数", `${snapshot.beta.dailyLoopStreak} 天`, `最近 30 天活跃 ${snapshot.beta.dailyLoopActiveDaysLast30} 天`],
    ["使命完成率", percent(snapshot.beta.missionCompletionRate), `已完成 ${snapshot.beta.missionCompleted} / 共 ${snapshot.beta.missionTotal}`],
    ["完成率变化", percent(snapshot.beta.missionCompletionRateLast7), snapshot.beta.missionCompletionRatePrevious7 === null ? "暂无上一关闭使命窗口" : `较前 7 天 ${snapshot.beta.missionCompletionRateChange !== null && snapshot.beta.missionCompletionRateChange >= 0 ? "+" : ""}${Math.round((snapshot.beta.missionCompletionRateChange || 0) * 100)} 个百分点`],
    ["证据增长", `+${snapshot.metrics.evidenceAddedLast7Days}`, `最近 7 天 / 最近 30 天 +${snapshot.beta.evidenceAddedLast30}`],
    ["记忆确认率", percent(snapshot.beta.memoryConfirmationRate), `已确认 ${snapshot.beta.memoryConfirmed} / 建议 ${snapshot.beta.memoryCandidates}`],
    ["导师使用", `${snapshot.beta.mentorActiveDaysLast7} 天`, `最近 7 天调用 ${snapshot.metrics.mentorCallsLast7Days} 次`],
  ];
  const highest = Math.max(1, ...snapshot.days.flatMap((item) => [item.inputs, item.mentorCalls, item.evidence]));
  const hasBetaActivity = snapshot.beta.dailyLoopActiveDaysLast30 > 0 || snapshot.beta.missionTotal > 0 || snapshot.metrics.evidenceTotal > 0 || snapshot.beta.memoryCandidates > 0 || snapshot.metrics.mentorCallsLast7Days > 0;
  const healthMetrics = [
    ["闭环一致性", percent(validation.health.loopConsistency), `已记录 ${validation.summary.recordedDays} 天`],
    ["证据质量", percent(validation.health.evidenceQuality), "已验证 / 用户证据"],
    ["使命完成", percent(validation.health.missionCompletion), "已完成 / 已关闭使命"],
    ["记忆稳定性", percent(validation.health.memoryStability), "活跃 / 已确认记忆"],
    ["导师价值", percent(validation.health.mentorValue), "有来源 / 已保存导师分析"],
  ];

  return <main className="usage-page" aria-label="使用概览">
    <section className="usage-hero">
      <div><span className="section-kicker">本地稳定性统计</span><h2>真实使用概览</h2><p>只读取已持久化的输入、学习、证据、战略复盘和 AI 审计日志；它不是能力评分，也不会改写任何正式数据。</p></div>
      <button className="secondary-button" onClick={() => void refresh()} disabled={busy}><RefreshCw size={14} />刷新统计</button>
    </section>
    <section className="usage-metric-grid">
      {metrics.map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}
    </section>
    <section className="usage-card" aria-label="Beta 使用指标">
      <div className="section-heading"><div><span className="section-kicker">本地 Beta 指标</span><h3>Beta 使用情况</h3></div><BarChart3 size={21} /></div>
      <div className="usage-metric-grid">{betaMetrics.map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</div>
      <p className="usage-privacy-note">所有指标均由现有日期与审批状态在本地计算。Genesis 不会把笔记、Prompt、文件或私密内容保存为统计数据。</p>
      {!hasBetaActivity ? <p className="usage-privacy-note">暂无 Beta 活动。可以从晨间简报开始，再审查有边界的今日计划并记录可观察工作。</p> : null}
    </section>
    <section className="usage-card" aria-label="个人操作系统健康指标">
      <div className="section-heading"><div><span className="section-kicker">本地描述性比例</span><h3>个人操作系统健康指标</h3></div><ShieldCheck size={21} /></div>
      <div className="usage-metric-grid">{healthMetrics.map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</div>
      <p className="usage-privacy-note">这些是持久化数据比例，不是 AI 评价或个人评分。缺失数据会保持“暂无数据”。</p>
    </section>
    <section className="usage-card" aria-label="Beta 验证记录">
      <div className="section-heading"><div><span className="section-kicker">本地每日事实</span><h3>Beta 验证摘要</h3></div><button className="secondary-button" disabled={validationBusy} onClick={() => void captureValidation()}><RefreshCw size={14} />记录今天</button></div>
      <div className="usage-metric-grid"><article><span>已记录天数</span><strong>{validation.summary.recordedDays}</strong><small>{validation.summary.firstDate || "暂无本地验证日期"} 至 {validation.summary.lastDate || "-"}</small></article><article><span>新增证据</span><strong>{validation.summary.totalEvidenceAdded}</strong><small>所有已记录日期</small></article><article><span>完成使命</span><strong>{validation.summary.totalMissionCompleted}</strong><small>所有已记录日期</small></article><article><span>导师调用</span><strong>{validation.summary.totalMentorCalls}</strong><small>所有已记录日期</small></article><article><span>反馈记录</span><strong>{validation.summary.totalFeedback}</strong><small>仅数量，不含内容</small></article></div>
      {validationMessage ? <p role="status" className="form-message">{validationMessage}</p> : null}
      <div className="validation-log-list">{validation.logs.length ? validation.logs.map((item) => <article key={item.id}><strong>{item.date}</strong><span>{item.dailyLoopStatus.replace("_", " ")} · 使命 {item.missionStatus}</span><small>完成 {item.missionCompletedCount} · 证据 {item.evidenceAddedCount} · 记忆 {item.memoryConfirmedCount} · 导师 {item.mentorCallCount} · 反馈 {item.feedbackCount}</small></article>) : <p className="usage-privacy-note">暂无验证快照。请只在实际使用每日闭环后记录今天。</p>}</div>
    </section>
    <section className="usage-card">
      <div className="section-heading"><div><span className="section-kicker">最近 7 天</span><h3>行为与证据增长</h3></div><BarChart3 size={21} /></div>
      <div className="usage-bars">{snapshot.days.map((item) => <article key={item.date}><div className="usage-bar-track" aria-label={`${item.date}：${item.inputs} 条输入，${item.mentorCalls} 次导师调用，${item.evidence} 条证据`}><i style={{ height: `${Math.max(3, (item.inputs / highest) * 100)}%` }} /><i style={{ height: `${Math.max(3, (item.mentorCalls / highest) * 100)}%` }} /><i style={{ height: `${Math.max(3, (item.evidence / highest) * 100)}%` }} /></div><strong>{item.date.slice(5)}</strong><small>{item.inputs} 输入 · {item.mentorCalls} 导师 · {item.evidence} 证据</small></article>)}</div>
      <p className="usage-legend"><i />输入 <i />导师 <i />证据</p>
    </section>
    <section className="usage-card" aria-label="最近 30 天趋势">
      <div className="section-heading"><div><span className="section-kicker">最近 30 天</span><h3>30 天活动趋势</h3></div><BarChart3 size={21} /></div>
      <div className="usage-bars usage-bars-30" style={{ gridTemplateColumns: `repeat(${snapshot.days30.length}, minmax(0, 1fr))` }}>
        {snapshot.days30.map((item) => <article key={item.date}><div className="usage-bar-track" aria-label={`${item.date}：${item.inputs} 条输入，${item.mentorCalls} 次导师调用，${item.evidence} 条证据`}><i style={{ height: `${Math.max(3, (item.inputs / highest) * 100)}%` }} /><i style={{ height: `${Math.max(3, (item.mentorCalls / highest) * 100)}%` }} /><i style={{ height: `${Math.max(3, (item.evidence / highest) * 100)}%` }} /></div><strong>{item.date.slice(8)}</strong></article>)}
      </div>
      <p className="usage-privacy-note">每天只显示已持久化输入、导师调用和证据数量。空白日期保持空白，Genesis 不会推断活动。</p>
    </section>
    <section className="usage-card usage-ai-card">
      <div className="section-heading"><div><span className="section-kicker">仅服务端审计</span><h3>AI 运行状态</h3></div><ShieldCheck size={21} /></div>
      <div className="usage-ai-grid"><div><b>{snapshot.ai.totalCalls}</b><span>总调用</span></div><div><b>{snapshot.ai.failedCalls}</b><span>失败</span></div><div><b>{snapshot.ai.averageLatencyMs}ms</b><span>平均耗时</span></div><div><b>{snapshot.ai.inputTokens + snapshot.ai.outputTokens}</b><span>累计 Token</span></div></div>
      <div className="usage-provider-list">{snapshot.ai.providers.length ? snapshot.ai.providers.map((provider) => <p key={provider.provider}><span>{provider.provider}</span><b>{provider.calls} 调用</b><small>{provider.failures} 失败</small></p>) : <p>尚无 AI 调用记录。</p>}</div>
    </section>
    <section className="usage-card" aria-label="Beta 反馈">
      <div className="section-heading"><div><span className="section-kicker">仅本地反馈</span><h3>Beta 反馈</h3></div><ShieldCheck size={21} /></div>
      <p>记录功能问题、建议或使用困难。反馈只保存在本地 SQLite，不会发送给 AI、外部服务，也不会进入证据或正式认知。</p>
      <form className="cognition-reflection" onSubmit={submitFeedback}>
        <label>类型<select aria-label="Beta 反馈类型" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as BetaFeedback["feedbackType"])}><option value="issue">功能问题</option><option value="suggestion">建议</option><option value="difficulty">使用困难</option></select></label>
        <label>反馈<textarea aria-label="Beta 反馈内容" value={feedbackContent} onChange={(event) => setFeedbackContent(event.target.value)} minLength={8} maxLength={2000} placeholder="说明发生了什么，以及流程在哪一步变得困难。" /></label>
        <button className="secondary-button" disabled={feedbackBusy || feedbackContent.trim().length < 8}>保存本地反馈</button>
      </form>
      {feedbackMessage ? <p role="status" className="form-message">{feedbackMessage}</p> : null}
      <div className="evidence-list">{feedback.length ? feedback.map((item) => <article className="evidence-item-card" key={item.id}><div className="feedback-heading"><strong>{feedbackTypeLabel[item.feedbackType]}</strong><span className={`feedback-status ${item.status}`}>{feedbackStatusLabel[item.status]}</span></div><p className="evidence-description">{item.content}</p><small>创建于 {new Date(item.createdAt).toLocaleString("zh-CN")}{item.reviewedAt ? ` · 审查于 ${new Date(item.reviewedAt).toLocaleString("zh-CN")}` : ""}{item.resolvedAt ? ` · 解决于 ${new Date(item.resolvedAt).toLocaleString("zh-CN")}` : ""}</small>{item.status === "pending" ? <div className="text-actions"><button disabled={feedbackTransitionId === item.id} onClick={() => void transitionFeedback(item.id, "reviewed")}>标记已审查</button></div> : null}{item.status === "reviewed" ? <div className="text-actions"><button disabled={feedbackTransitionId === item.id} onClick={() => void transitionFeedback(item.id, "resolved")}>标记已解决</button></div> : null}</article>) : <p>暂无本地 Beta 反馈。</p>}</div>
    </section>
    <section className="usage-card integrity-card">
      <div className="section-heading"><div><span className="section-kicker">先预览的数据质量</span><h3>数据完整性</h3></div><ShieldCheck size={21} /></div>
      <p>检查待确认记忆、使命、战略、今日计划和证据关联。明确确认修复前，检查保持只读；它绝不会删除或修改已批准正式记录。</p>
      <div className="portability-actions"><button className="secondary-button" disabled={busy} onClick={() => void inspectIntegrity()}><RefreshCw size={14} />运行完整性检查</button></div>
      {integrity ? <div className="integrity-result">
        <strong>{integrity.issues.length ? `${integrity.issues.length} 个问题需要处理` : "没有发现可自动修复的数据完整性问题。"}</strong>
        <p>{integrity.safetyNote}</p>
        {integrity.pendingCandidates.length ? <div className="pending-candidate-summary" aria-label="待确认建议审查队列"><strong>待确认建议审查队列</strong>{integrity.pendingCandidates.map((item) => <p key={item.entityType}><code>{item.entityType}</code> 共 {item.total} 条待确认{item.olderThanSevenDays ? ` · ${item.olderThanSevenDays} 条超过 7 天` : ""}{item.oldestCreatedAt ? ` · 最早 ${new Date(item.oldestCreatedAt).toLocaleDateString("zh-CN")}` : ""}</p>)}</div> : <p className="usage-privacy-note">当前没有需要审查的待确认战略、使命、记忆或今日计划建议。</p>}
        {integrity.issues.length ? <ul>{integrity.issues.slice(0, 12).map((issue) => <li key={issue.id}><code>{issue.entityType}</code> {issue.detail}{issue.repairable ? "" : " 需要人工检查。"}</li>)}</ul> : null}
        {integrity.issues.some((issue) => issue.repairable) ? <div className="import-preview"><label>二次确认：输入 REPAIR_NONFORMAL_RECORDS<input value={integrityConfirmation} onChange={(event) => setIntegrityConfirmation(event.target.value)} /></label><button className="primary-button" disabled={busy || integrityConfirmation !== "REPAIR_NONFORMAL_RECORDS"} onClick={() => void inspectIntegrity(true)}>修复非正式记录</button></div> : null}
      </div> : null}
    </section>
    <section className="usage-card portability-card">
      <div className="section-heading"><div><span className="section-kicker">本地单用户数据迁移</span><h3>备份与恢复</h3></div><FileDown size={21} /></div>
      <p>导出包含数字分身、成长图谱、能力证据、学习历史、战略和审计记录；不包含 API Key。恢复先预览，确认后只合并缺失记录，不覆盖当前记录或自动批准建议。</p>
      <div className="portability-actions"><Link className="secondary-button" href="/api/data-portability?format=json"><Download size={14} />导出 JSON 备份</Link><Link className="secondary-button" href="/api/data-portability?format=markdown"><FileDown size={14} />导出 Markdown 报告</Link></div>
      <label className="backup-file"><span>选择 Genesis JSON 备份</span><input type="file" accept="application/json,.json" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); }} /><small>{file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "最大 10MB；仅接受此应用导出的 v1 JSON。"}</small></label>
      <div className="portability-actions"><button className="secondary-button" disabled={busy || !file} onClick={() => void importBackup("preview")}><Upload size={14} />预览导入</button></div>
      {preview ? <div className="import-preview"><strong>预览：{preview.records} 条记录，{preview.recognizedTables} 张可识别表</strong><p>导入会保留现有正式数据，仅追加缺失 ID。{preview.ignoredTables.length ? ` 忽略 ${preview.ignoredTables.length} 张不受支持的表。` : ""}</p><label>二次确认：输入 IMPORT_GENESIS_BACKUP<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="primary-button" disabled={busy || confirmation !== "IMPORT_GENESIS_BACKUP"} onClick={() => void importBackup("apply")}>确认合并备份</button></div> : null}
      {message ? <p role="status" className="form-message">{message}</p> : null}
    </section>
  </main>;
}
