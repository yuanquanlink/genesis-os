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
      if (!response.ok) throw new Error(data.error || "Feedback could not be saved");
      setFeedback(data.snapshot?.feedback || []);
      setFeedbackContent("");
      setFeedbackMessage(data.duplicate ? "The same feedback request was already saved locally." : "Feedback saved locally. It is not sent to AI or an external service.");
    } catch (error) { setFeedbackMessage(error instanceof Error ? error.message : "Feedback could not be saved"); }
    finally { setFeedbackBusy(false); }
  }

  async function transitionFeedback(id: string, status: "reviewed" | "resolved") {
    setFeedbackTransitionId(id); setFeedbackMessage("");
    try {
      const response = await fetch("/api/beta-feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      const data = await response.json() as { duplicate?: boolean; snapshot?: { feedback: BetaFeedback[] }; error?: string };
      if (!response.ok) throw new Error(data.error || "Feedback status could not be updated");
      setFeedback(data.snapshot?.feedback || []);
      setFeedbackMessage(data.duplicate ? "This feedback item already has that status." : status === "reviewed" ? "Feedback marked as reviewed locally." : "Feedback marked as resolved locally.");
    } catch (error) { setFeedbackMessage(error instanceof Error ? error.message : "Feedback status could not be updated"); }
    finally { setFeedbackTransitionId(null); }
  }

  async function captureValidation() {
    setValidationBusy(true); setValidationMessage("");
    try {
      const response = await fetch("/api/beta-validation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture" }) });
      const data = await response.json() as { duplicate?: boolean; snapshot?: BetaValidationSnapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "Validation snapshot could not be recorded");
      if (data.snapshot) setValidation(data.snapshot);
      setValidationMessage(data.duplicate ? "Today's validation snapshot was refreshed from local data." : "Today's validation snapshot was recorded locally.");
    } catch (error) { setValidationMessage(error instanceof Error ? error.message : "Validation snapshot could not be recorded"); }
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
      if (!response.ok) throw new Error(data.error || "Data integrity check failed.");
      setIntegrity(data.snapshot || data);
      if (apply) {
        setIntegrityConfirmation("");
        setMessage(`Non-formal cleanup completed: ${data.repaired?.rejectedCandidates || 0} candidate(s) rejected, ${data.repaired?.evidenceMarkedNeedsReview || 0} Evidence item(s) marked for review.`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Data integrity check failed."); }
    finally { setBusy(false); }
  }

  const metrics = [
    ["今日输入", `${snapshot.metrics.todayInputs}`, "原始记录"],
    ["Mentor 调用", `${snapshot.metrics.mentorCallsLast7Days}`, "近 7 天"],
    ["学习完成率", percent(snapshot.metrics.learningCompletionRate), "近 7 天任务"],
    ["Evidence", `${snapshot.metrics.evidenceTotal}`, `近 7 天 +${snapshot.metrics.evidenceAddedLast7Days}`],
    ["Active Mission", `${snapshot.metrics.activeMissions}`, `完成 ${snapshot.metrics.completedMissionsLast7Days} 个 / 近 7 天`],
    ["战略一致性", percent(snapshot.metrics.strategyAlignmentRate), "近 7 天晚间复盘"],
  ];
  const betaMetrics = [
    ["Beta run", `${snapshot.beta.betaRunDays} days`, "since first local Beta signal"],
    ["Daily Loop streak", `${snapshot.beta.dailyLoopStreak} days`, `${snapshot.beta.dailyLoopActiveDaysLast30} active days / 30`],
    ["Mission completion", percent(snapshot.beta.missionCompletionRate), `${snapshot.beta.missionCompleted} completed / ${snapshot.beta.missionTotal} total`],
    ["Completion change", percent(snapshot.beta.missionCompletionRateLast7), snapshot.beta.missionCompletionRatePrevious7 === null ? "No prior closed-Mission window" : `${snapshot.beta.missionCompletionRateChange !== null && snapshot.beta.missionCompletionRateChange >= 0 ? "+" : ""}${Math.round((snapshot.beta.missionCompletionRateChange || 0) * 100)} pts vs prior 7 days`],
    ["Evidence growth", `+${snapshot.metrics.evidenceAddedLast7Days}`, `7 days / +${snapshot.beta.evidenceAddedLast30} in 30`],
    ["Memory confirmation", percent(snapshot.beta.memoryConfirmationRate), `${snapshot.beta.memoryConfirmed} confirmed / ${snapshot.beta.memoryCandidates} candidates`],
    ["Mentor usage", `${snapshot.beta.mentorActiveDaysLast7} days`, `${snapshot.metrics.mentorCallsLast7Days} calls / last 7 days`],
  ];
  const highest = Math.max(1, ...snapshot.days.flatMap((item) => [item.inputs, item.mentorCalls, item.evidence]));
  const hasBetaActivity = snapshot.beta.dailyLoopActiveDaysLast30 > 0 || snapshot.beta.missionTotal > 0 || snapshot.metrics.evidenceTotal > 0 || snapshot.beta.memoryCandidates > 0 || snapshot.metrics.mentorCallsLast7Days > 0;
  const healthMetrics = [
    ["Loop Consistency", percent(validation.health.loopConsistency), `${validation.summary.recordedDays} recorded day(s)`],
    ["Evidence Quality", percent(validation.health.evidenceQuality), "verified / user Evidence"],
    ["Mission Completion", percent(validation.health.missionCompletion), "completed / closed Missions"],
    ["Memory Stability", percent(validation.health.memoryStability), "active / confirmed Memory"],
    ["Mentor Value", percent(validation.health.mentorValue), "source-bound / saved Mentor analyses"],
  ];

  return <div className="usage-page" aria-label="User Usage Dashboard">
    <section className="usage-hero">
      <div><span className="section-kicker">v0.1 stability telemetry</span><h2>真实使用概览</h2><p>只读取已持久化的输入、学习、证据、战略复盘和 AI 审计日志；它不是能力评分，也不会改写任何正式数据。</p></div>
      <button className="secondary-button" onClick={() => void refresh()} disabled={busy}><RefreshCw size={14} />刷新统计</button>
    </section>
    <section className="usage-metric-grid">
      {metrics.map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}
    </section>
    <section className="usage-card" aria-label="Beta usage metrics">
      <div className="section-heading"><div><span className="section-kicker">local beta metrics</span><h3>Beta usage</h3></div><BarChart3 size={21} /></div>
      <div className="usage-metric-grid">{betaMetrics.map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</div>
      <p className="usage-privacy-note">Derived locally from existing dates and approval states. Genesis does not store notes, prompts, files, or private content as analytics.</p>
      {!hasBetaActivity ? <p className="usage-privacy-note">No Beta activity yet. Start with a Morning Brief, then review a bounded Daily Plan and record observable work.</p> : null}
    </section>
    <section className="usage-card" aria-label="Personal OS Health">
      <div className="section-heading"><div><span className="section-kicker">local descriptive ratios</span><h3>Personal OS Health</h3></div><ShieldCheck size={21} /></div>
      <div className="usage-metric-grid">{healthMetrics.map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</div>
      <p className="usage-privacy-note">These are persisted-data ratios, not AI evaluations or personal scores. Missing data remains unavailable.</p>
    </section>
    <section className="usage-card" aria-label="Beta validation log">
      <div className="section-heading"><div><span className="section-kicker">local daily facts</span><h3>Beta Validation Summary</h3></div><button className="secondary-button" disabled={validationBusy} onClick={() => void captureValidation()}><RefreshCw size={14} />Record today</button></div>
      <div className="usage-metric-grid"><article><span>Recorded days</span><strong>{validation.summary.recordedDays}</strong><small>{validation.summary.firstDate || "No local validation date"} to {validation.summary.lastDate || "-"}</small></article><article><span>Evidence added</span><strong>{validation.summary.totalEvidenceAdded}</strong><small>across logged days</small></article><article><span>Missions completed</span><strong>{validation.summary.totalMissionCompleted}</strong><small>across logged days</small></article><article><span>Mentor calls</span><strong>{validation.summary.totalMentorCalls}</strong><small>across logged days</small></article><article><span>Feedback records</span><strong>{validation.summary.totalFeedback}</strong><small>count only, no content</small></article></div>
      {validationMessage ? <p role="status" className="form-message">{validationMessage}</p> : null}
      <div className="validation-log-list">{validation.logs.length ? validation.logs.map((item) => <article key={item.id}><strong>{item.date}</strong><span>{item.dailyLoopStatus.replace("_", " ")} · Mission {item.missionStatus}</span><small>Completed {item.missionCompletedCount} · Evidence {item.evidenceAddedCount} · Memory {item.memoryConfirmedCount} · Mentor {item.mentorCallCount} · Feedback {item.feedbackCount}</small></article>) : <p className="usage-privacy-note">No validation snapshots yet. Record today only after using the daily loop.</p>}</div>
    </section>
    <section className="usage-card">
      <div className="section-heading"><div><span className="section-kicker">last 7 days</span><h3>行为与证据增长</h3></div><BarChart3 size={21} /></div>
      <div className="usage-bars">{snapshot.days.map((item) => <article key={item.date}><div className="usage-bar-track" aria-label={`${item.date}: ${item.inputs} inputs, ${item.mentorCalls} mentor calls, ${item.evidence} evidence`}><i style={{ height: `${Math.max(3, (item.inputs / highest) * 100)}%` }} /><i style={{ height: `${Math.max(3, (item.mentorCalls / highest) * 100)}%` }} /><i style={{ height: `${Math.max(3, (item.evidence / highest) * 100)}%` }} /></div><strong>{item.date.slice(5)}</strong><small>{item.inputs} 输入 · {item.mentorCalls} Mentor · {item.evidence} 证据</small></article>)}</div>
      <p className="usage-legend"><i />输入 <i />Mentor <i />Evidence</p>
    </section>
    <section className="usage-card" aria-label="Recent 30 day trend">
      <div className="section-heading"><div><span className="section-kicker">last 30 days</span><h3>30-day activity trend</h3></div><BarChart3 size={21} /></div>
      <div className="usage-bars usage-bars-30" style={{ gridTemplateColumns: `repeat(${snapshot.days30.length}, minmax(0, 1fr))` }}>
        {snapshot.days30.map((item) => <article key={item.date}><div className="usage-bar-track" aria-label={`${item.date}: ${item.inputs} inputs, ${item.mentorCalls} mentor calls, ${item.evidence} evidence`}><i style={{ height: `${Math.max(3, (item.inputs / highest) * 100)}%` }} /><i style={{ height: `${Math.max(3, (item.mentorCalls / highest) * 100)}%` }} /><i style={{ height: `${Math.max(3, (item.evidence / highest) * 100)}%` }} /></div><strong>{item.date.slice(8)}</strong></article>)}
      </div>
      <p className="usage-privacy-note">Each day shows persisted inputs, Mentor calls, and Evidence counts only. Empty days remain empty; Genesis does not infer activity.</p>
    </section>
    <section className="usage-card usage-ai-card">
      <div className="section-heading"><div><span className="section-kicker">server-side audit only</span><h3>AI 运行状态</h3></div><ShieldCheck size={21} /></div>
      <div className="usage-ai-grid"><div><b>{snapshot.ai.totalCalls}</b><span>总调用</span></div><div><b>{snapshot.ai.failedCalls}</b><span>失败</span></div><div><b>{snapshot.ai.averageLatencyMs}ms</b><span>平均耗时</span></div><div><b>{snapshot.ai.inputTokens + snapshot.ai.outputTokens}</b><span>累计 Token</span></div></div>
      <div className="usage-provider-list">{snapshot.ai.providers.length ? snapshot.ai.providers.map((provider) => <p key={provider.provider}><span>{provider.provider}</span><b>{provider.calls} 调用</b><small>{provider.failures} 失败</small></p>) : <p>尚无 AI 调用记录。</p>}</div>
    </section>
    <section className="usage-card" aria-label="Beta feedback">
      <div className="section-heading"><div><span className="section-kicker">local feedback only</span><h3>Beta feedback</h3></div><ShieldCheck size={21} /></div>
      <p>Record a product issue, suggestion, or usage difficulty. Feedback remains in local SQLite and is not sent to AI, external services, Evidence, or formal Context.</p>
      <form className="cognition-reflection" onSubmit={submitFeedback}>
        <label>Type<select aria-label="Beta feedback type" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as BetaFeedback["feedbackType"])}><option value="issue">Function issue</option><option value="suggestion">Suggestion</option><option value="difficulty">Usage difficulty</option></select></label>
        <label>Feedback<textarea aria-label="Beta feedback content" value={feedbackContent} onChange={(event) => setFeedbackContent(event.target.value)} minLength={8} maxLength={2000} placeholder="Describe what happened and where the workflow became difficult." /></label>
        <button className="secondary-button" disabled={feedbackBusy || feedbackContent.trim().length < 8}>Save local feedback</button>
      </form>
      {feedbackMessage ? <p role="status" className="form-message">{feedbackMessage}</p> : null}
      <div className="evidence-list">{feedback.length ? feedback.map((item) => <article className="evidence-item-card" key={item.id}><div className="feedback-heading"><strong>{item.feedbackType}</strong><span className={`feedback-status ${item.status}`}>{item.status}</span></div><p className="evidence-description">{item.content}</p><small>Created {new Date(item.createdAt).toLocaleString()}{item.reviewedAt ? ` · Reviewed ${new Date(item.reviewedAt).toLocaleString()}` : ""}{item.resolvedAt ? ` · Resolved ${new Date(item.resolvedAt).toLocaleString()}` : ""}</small>{item.status === "pending" ? <div className="text-actions"><button disabled={feedbackTransitionId === item.id} onClick={() => void transitionFeedback(item.id, "reviewed")}>Mark reviewed</button></div> : null}{item.status === "reviewed" ? <div className="text-actions"><button disabled={feedbackTransitionId === item.id} onClick={() => void transitionFeedback(item.id, "resolved")}>Mark resolved</button></div> : null}</article>) : <p>No local Beta feedback yet.</p>}</div>
    </section>
    <section className="usage-card integrity-card">
      <div className="section-heading"><div><span className="section-kicker">preview-first data quality</span><h3>Data integrity</h3></div><ShieldCheck size={21} /></div>
      <p>Checks pending Memory, Mission, Strategy, Daily Plan, and Evidence links. The check is read-only until you explicitly confirm a repair; it never deletes or changes approved formal records.</p>
      <div className="portability-actions"><button className="secondary-button" disabled={busy} onClick={() => void inspectIntegrity()}><RefreshCw size={14} />Run integrity check</button></div>
      {integrity ? <div className="integrity-result">
        <strong>{integrity.issues.length ? `${integrity.issues.length} issue(s) need attention` : "No repairable data-integrity issues found."}</strong>
        <p>{integrity.safetyNote}</p>
        {integrity.pendingCandidates.length ? <div className="pending-candidate-summary" aria-label="Pending candidate review queue"><strong>Pending candidate review queue</strong>{integrity.pendingCandidates.map((item) => <p key={item.entityType}><code>{item.entityType}</code> {item.total} pending{item.olderThanSevenDays ? ` · ${item.olderThanSevenDays} older than 7 days` : ""}{item.oldestCreatedAt ? ` · oldest ${new Date(item.oldestCreatedAt).toLocaleDateString()}` : ""}</p>)}</div> : <p className="usage-privacy-note">No pending Strategy, Mission, Memory, or Daily Plan candidates require review.</p>}
        {integrity.issues.length ? <ul>{integrity.issues.slice(0, 12).map((issue) => <li key={issue.id}><code>{issue.entityType}</code> {issue.detail}{issue.repairable ? "" : " Manual inspection required."}</li>)}</ul> : null}
        {integrity.issues.some((issue) => issue.repairable) ? <div className="import-preview"><label>Secondary confirmation: type REPAIR_NONFORMAL_RECORDS<input value={integrityConfirmation} onChange={(event) => setIntegrityConfirmation(event.target.value)} /></label><button className="primary-button" disabled={busy || integrityConfirmation !== "REPAIR_NONFORMAL_RECORDS"} onClick={() => void inspectIntegrity(true)}>Repair non-formal records</button></div> : null}
      </div> : null}
    </section>
    <section className="usage-card portability-card">
      <div className="section-heading"><div><span className="section-kicker">local single-user data portability</span><h3>备份与恢复</h3></div><FileDown size={21} /></div>
      <p>导出包含 Digital Life、Growth Graph、Evidence、Learning History、Strategies 和审计记录；不包含 API Key。恢复先预览，确认后只合并缺失记录，不覆盖当前记录或自动批准候选。</p>
      <div className="portability-actions"><Link className="secondary-button" href="/api/data-portability?format=json"><Download size={14} />导出 JSON 备份</Link><Link className="secondary-button" href="/api/data-portability?format=markdown"><FileDown size={14} />导出 Markdown 报告</Link></div>
      <label className="backup-file"><span>选择 Genesis JSON 备份</span><input type="file" accept="application/json,.json" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); }} /><small>{file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "最大 10MB；仅接受此应用导出的 v1 JSON。"}</small></label>
      <div className="portability-actions"><button className="secondary-button" disabled={busy || !file} onClick={() => void importBackup("preview")}><Upload size={14} />预览导入</button></div>
      {preview ? <div className="import-preview"><strong>预览：{preview.records} 条记录，{preview.recognizedTables} 张可识别表</strong><p>导入会保留现有正式数据，仅追加缺失 ID。{preview.ignoredTables.length ? ` 忽略 ${preview.ignoredTables.length} 张不受支持的表。` : ""}</p><label>二次确认：输入 IMPORT_GENESIS_BACKUP<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="primary-button" disabled={busy || confirmation !== "IMPORT_GENESIS_BACKUP"} onClick={() => void importBackup("apply")}>确认合并备份</button></div> : null}
      {message ? <p role="status" className="form-message">{message}</p> : null}
    </section>
  </div>;
}
