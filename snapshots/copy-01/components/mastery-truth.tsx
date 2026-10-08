"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { masteryGateTypes, type MasteryGateType } from "@/lib/domain/mastery-truth";

const masteryGateUiLabels: Record<MasteryGateType, string> = {
  concept: "概念理解",
  application: "实际应用",
  transfer: "迁移能力",
  delayed_recall: "延迟回忆",
  artifact_project: "产物与项目",
  defense: "答辩",
  independence: "独立性",
  evidence: "能力证据",
};

type Snapshot = {
  pilots: Array<{
    id: string; slug: "fastapi-backend-engineering-v1" | "linear-algebra-ml-core-v1"; title: string; description: string;
    priorMinHours: number; priorMaxHours: number; priorConfidence: string; priorBasis: string; realUserVerified: boolean;
    sources: Array<{ id: string; sourceKey: string; title: string; sourceUrl: string; intakeStatus: string; contentStatus: string; role: string }>;
  }>;
  certification: null | {
    id: string; goalId: string; pilotId: string; lifecycleStatus: string; courseCompletedAt: string | null; masteredAt: string | null;
  };
  requirements: Array<{
    id: string; gateType: MasteryGateType; label: string; threshold: number; position: number;
    policy: { retryAction?: string; delayDays?: number; acceptedEvidenceTypes?: string[] };
  }>;
  gates: Array<{
    gateId: string; gateType: MasteryGateType; status: "pending" | "passed" | "failed" | "blocked" | "waiting";
    threshold: number; score: number | null; evidenceRefs: string[]; sourceRefs: string[]; attemptId: string | null;
    failureReason: string | null; nextRetryAt: string | null;
  }>;
  attempts: Array<{ id: string; gateType: MasteryGateType; attemptNumber: number; status: string; evaluatedAt: string }>;
  decisions: Array<{
    id: string; overallStatus: string; aggregateScore: number; blockedReasons: string[]; evidenceItemId: string | null;
    growthCandidateId: string | null; evaluatedAt: string;
  }>;
  remediation: Array<{ id: string; gateType: MasteryGateType; diagnosis: string; targetExercises: string[]; status: string; retryRules: Record<string, unknown> }>;
  assistance: Array<{ id: string; phase: string; assistanceLevel: number; critical: boolean; tool: string; createdAt: string }>;
  timeEstimate: null | {
    estimatedMinHours: number | null; estimatedMaxHours: number | null; confidenceLevel: string | null; confidenceReason: string | null;
    sessionsUsed: number; actualHoursSoFar: number; calibrationStatus: string; rollingPlan: Array<{ date: string; plannedMinutes: number; bufferMinutes: number }>;
  };
};

const empty: Snapshot = { pilots: [], certification: null, requirements: [], gates: [], attempts: [], decisions: [], remediation: [], assistance: [], timeEstimate: null };
const statusLabel: Record<string, string> = {
  pending: "待验证", passed: "已通过", failed: "未通过", blocked: "受阻", waiting: "等待中",
  mastered: "已真正掌握", not_mastered: "尚未掌握", completed: "课程已完成", active: "进行中",
  learning: "学习中", course_completed: "课程已完成", mastery_pending: "待完成掌握", remediation_required: "需要补救",
  not_started: "尚未开始", baseline_pending: "等待基线评估",
};
const zhStatus = (value: string | null | undefined) => value ? statusLabel[value] || value : "暂无";

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { error?: string; issues?: Array<{ message: string }> };
  if (!response.ok) throw new Error(value.error || value.issues?.[0]?.message || "掌握真值操作失败");
  return value;
}

export function MasteryTruthPanel({ goal }: { goal: { id: string; status: string } }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [pilotSlug, setPilotSlug] = useState<Snapshot["pilots"][number]["slug"]>("fastapi-backend-engineering-v1");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [attempts, setAttempts] = useState<Record<string, { score: number; evidence: string; sources: string; notes: string }>>({});

  const load = useCallback(async () => {
    const response = await fetch(`/api/learning/mastery?goalId=${encodeURIComponent(goal.id)}`, { cache: "no-store" });
    setSnapshot(await responseJson<Snapshot>(response));
  }, [goal.id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/learning/mastery?goalId=${encodeURIComponent(goal.id)}`, { cache: "no-store" })
      .then((response) => responseJson<Snapshot>(response))
      .then((result) => { if (!cancelled) setSnapshot(result); })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "掌握真值加载失败"); });
    return () => { cancelled = true; };
  }, [goal.id]);

  const act = async (label: string, body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(label); setMessage("");
    try {
      const response = await fetch("/api/learning/mastery", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      await responseJson(response);
      await load();
      setMessage(`${label}完成`);
    } catch (error) { setMessage(error instanceof Error ? error.message : `${label}失败`); }
    finally { setBusy(""); }
  };

  const currentPilot = snapshot.pilots.find((pilot) => pilot.id === snapshot.certification?.pilotId);
  const latestDecision = snapshot.decisions[0];
  const passed = snapshot.gates.filter((gate) => gate.status === "passed").length;

  return (
    <section className="mastery-truth-root" data-testid="mastery-truth">
      <div className="learning-card mastery-contract">
        <div className="section-heading"><div><span className="section-kicker">掌握真值契约</span><h2>课程完成与真正掌握是两条独立进度</h2></div><ShieldCheck size={22} /></div>
        <div className="mastery-progress-grid">
          <div><span>课程进度</span><strong>{snapshot.certification?.courseCompletedAt ? "课程已完成" : goal.status === "completed" ? "历史课程完成 · 尚未验证" : "学习中"}</strong><small>完成课程不会自动成为真正掌握。</small></div>
          <div><span>掌握进度</span><strong>{snapshot.certification ? `8 个门槛已通过 ${passed} 个` : "尚未选择验证方案"}</strong><small>{zhStatus(snapshot.certification?.lifecycleStatus)}</small></div>
          <div><span>确定性决策</span><strong>{latestDecision ? zhStatus(latestDecision.overallStatus) : "暂无服务端决策"}</strong><small>{latestDecision ? `综合分 ${Math.round(latestDecision.aggregateScore * 100)}%` : "综合阈值 82% 且全部硬门槛通过"}</small></div>
        </div>
        {message ? <p className={/失败|不存在|不能|校验/.test(message) ? "mastery-message error" : "mastery-message"} role="status">{message}</p> : null}
      </div>

      {!snapshot.certification ? <div className="learning-card mastery-onboarding">
        <h3>选择 Phase 1 掌握验证方案</h3>
        <p>这里只初始化认证结构和低置信先验，不会创建“真正掌握”、证据或能力变化。</p>
        <select aria-label="掌握验证方案" value={pilotSlug} onChange={(event) => setPilotSlug(event.target.value as typeof pilotSlug)}>
          {snapshot.pilots.map((pilot) => <option value={pilot.slug} key={pilot.id}>{pilot.title}</option>)}
        </select>
        <button className="primary-button" disabled={Boolean(busy)} onClick={() => void act("初始化掌握验证方案", { action: "initialize", goalId: goal.id, pilotSlug })}>初始化掌握验证方案</button>
      </div> : <>
        <div className="learning-card mastery-pilot-summary">
          <div className="section-heading"><div><span className="section-kicker">验证方案定义 · v1</span><h3>{currentPilot?.title}</h3></div><button className="icon-button" aria-label="刷新掌握验证" title="刷新掌握验证" onClick={() => void load()}><RefreshCw size={16} /></button></div>
          <p>{currentPilot?.description}</p>
          {!snapshot.certification.courseCompletedAt ? <button className="primary-button" disabled={Boolean(busy)} onClick={() => void act("确认课程阶段完成", { action: "complete_course", goalId: goal.id })}>由用户确认课程完成</button> : <div className="mastery-course-confirmed"><CheckCircle2 size={16} />课程完成已记录；真正掌握仍需通过八个门槛。</div>}
          <div className="mastery-estimate">
            <span>时间先验</span><strong>{snapshot.timeEstimate?.estimatedMinHours ?? currentPilot?.priorMinHours}–{snapshot.timeEstimate?.estimatedMaxHours ?? currentPilot?.priorMaxHours} 小时</strong>
            <small>{snapshot.timeEstimate?.confidenceLevel || currentPilot?.priorConfidence} 置信级别 · 已使用 {snapshot.timeEstimate?.sessionsUsed || 0} 次会话 · 实际 {snapshot.timeEstimate?.actualHoursSoFar || 0} 小时</small>
            <button className="secondary-button" disabled={Boolean(busy)} onClick={() => void act("重新校准估时", { action: "recalibrate_estimate", goalId: goal.id })}>按真实学习会话重新校准</button>
          </div>
        </div>

        <div className="mastery-gate-grid">
          {masteryGateTypes.map((gateType) => {
            const gate = snapshot.gates.find((item) => item.gateType === gateType);
            const requirement = snapshot.requirements.find((item) => item.gateType === gateType);
            const form = attempts[gateType] || { score: requirement?.threshold || 0.82, evidence: "", sources: "", notes: "" };
            const history = snapshot.attempts.filter((item) => item.gateType === gateType);
            return <article className={`mastery-gate ${gate?.status || "pending"}`} key={gateType}>
              <header><span>{requirement?.position || "—"}</span><div><strong>{masteryGateUiLabels[gateType]}</strong><small>必需 · 阈值 {Math.round((requirement?.threshold || 0) * 100)}%</small></div><GateIcon status={gate?.status || "pending"} /></header>
              <p>{gate?.failureReason || requirement?.policy.retryAction || "等待持久化证据和服务端评估。"}</p>
              <details><summary>证据、原因与重试</summary>
                <dl><dt>状态</dt><dd>{zhStatus(gate?.status)}</dd><dt>证据引用</dt><dd>{gate?.evidenceRefs.join(" · ") || "尚无"}</dd><dt>来源引用</dt><dd>{gate?.sourceRefs.join(" · ") || "尚无"}</dd><dt>下次重试</dt><dd>{gate?.nextRetryAt || "可立即提交新尝试"}</dd><dt>历史</dt><dd>{history.length ? history.map((item) => `#${item.attemptNumber} ${zhStatus(item.status)}`).join(" · ") : "暂无尝试"}</dd></dl>
                <div className="mastery-attempt-form">
                  <label>观测得分<input aria-label={`${masteryGateUiLabels[gateType]}观测得分`} type="number" min="0" max="1" step="0.01" value={form.score} onChange={(event) => setAttempts({ ...attempts, [gateType]: { ...form, score: Number(event.target.value) } })} /></label>
                  <label>证据引用<textarea aria-label={`${masteryGateUiLabels[gateType]}证据引用`} placeholder="assessment_attempt:uuid，每行一个" value={form.evidence} onChange={(event) => setAttempts({ ...attempts, [gateType]: { ...form, evidence: event.target.value } })} /></label>
                  <label>来源引用（可选）<textarea aria-label={`${masteryGateUiLabels[gateType]}来源引用`} placeholder="pilot_source:source-key" value={form.sources} onChange={(event) => setAttempts({ ...attempts, [gateType]: { ...form, sources: event.target.value } })} /></label>
                  <label>备注<textarea aria-label={`${masteryGateUiLabels[gateType]}备注`} value={form.notes} onChange={(event) => setAttempts({ ...attempts, [gateType]: { ...form, notes: event.target.value } })} /></label>
                  <button className="secondary-button" disabled={Boolean(busy) || !snapshot.certification?.courseCompletedAt || !form.evidence.trim()} onClick={() => void act(`记录 ${masteryGateUiLabels[gateType]}尝试`, {
                    action: "record_gate_attempt", goalId: goal.id, clientRequestId: crypto.randomUUID(), gateType,
                    observedScore: form.score, evidenceRefs: form.evidence.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
                    sourceRefs: form.sources.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean), notes: form.notes,
                  })}>记录服务端门槛尝试</button>
                </div>
              </details>
            </article>;
          })}
        </div>

        <div className="learning-card mastery-decision-panel">
          <div className="section-heading"><div><span className="section-kicker">确定性决策</span><h3>统一服务端计算，不接受客户端直接声明掌握</h3></div><ShieldCheck size={20} /></div>
          <button className="primary-button" disabled={Boolean(busy) || !snapshot.certification.courseCompletedAt} onClick={() => void act("运行掌握决策", { action: "evaluate", goalId: goal.id })}>运行八个门槛决策</button>
          {latestDecision ? <div className="mastery-decision-result"><strong>{zhStatus(latestDecision.overallStatus)}</strong><span>综合分 {Math.round(latestDecision.aggregateScore * 100)}%</span><span>证据待确认建议 {latestDecision.growthCandidateId || "真正掌握前不会创建"}</span><small>用户批准前，正式能力保持不变。</small>{latestDecision.blockedReasons?.map((reason) => <p key={reason}>{reason}</p>)}</div> : null}
        </div>

        {snapshot.remediation.some((item) => item.status === "active") ? <div className="learning-card mastery-remediation"><div className="section-heading"><div><span className="section-kicker">掌握差距报告</span><h3>只补未通过的门槛</h3></div><AlertTriangle size={20} /></div>{snapshot.remediation.filter((item) => item.status === "active").map((item) => <article key={item.id}><strong>{masteryGateUiLabels[item.gateType]}</strong><p>{item.diagnosis}</p><ul>{item.targetExercises.map((exercise) => <li key={exercise}>{exercise}</li>)}</ul><small>允许重试 · 以前的尝试仍可审计</small></article>)}</div> : null}

        <div className="learning-card mastery-sources"><h3>所有者批准的静态来源清单</h3><p>这些来源不是实时搜索结果；未读取的正文不会被伪装为已分析。</p>{currentPilot?.sources.map((source) => <a href={source.sourceUrl} target="_blank" rel="noreferrer" key={source.id}><strong>{source.title}</strong><span>{source.role}</span><small>{source.intakeStatus} · {source.contentStatus}</small></a>)}</div>
      </>}
    </section>
  );
}

function GateIcon({ status }: { status: "pending" | "passed" | "failed" | "blocked" | "waiting" }) {
  if (status === "passed") return <CheckCircle2 aria-label="已通过" size={18} />;
  if (status === "failed" || status === "blocked") return <XCircle aria-label={zhStatus(status)} size={18} />;
  return <Clock3 aria-label={zhStatus(status)} size={18} />;
}
