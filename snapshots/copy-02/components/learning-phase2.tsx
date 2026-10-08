"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Code2,
  FileSearch,
  GitBranch,
  History,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type JsonRecord = Record<string, unknown>;
type Phase2Question = {
  id: string;
  key: string;
  type: string;
  question: string;
  concept: string;
  difficulty: number;
  expectedSkill: string;
  rubric: string[];
  options: string[];
  sourceReference: string;
};
type Phase2Assessment = JsonRecord & {
  id: string;
  goalId: string;
  status: string;
  assessmentType: string;
  modelMode: string;
  questions: Phase2Question[];
  attempts: JsonRecord[];
};
type Phase2Node = JsonRecord & {
  id: string;
  title: string;
  learningState: string;
  mastery: number;
  masteryConfidence: number;
  evidenceCount: number;
  whyNow: string;
  prerequisites: string[];
  nextConcepts: string[];
  resourceRefs: string[];
  misconceptions: string[];
  lastStudiedAt: string | null;
  lastAssessedAt: string | null;
  nextReviewAt: string | null;
};
type ResourceIntelligence = JsonRecord & {
  id: string;
  resourceId: string;
  title: string;
  intelligenceStatus: string;
  confirmedAuthor: string | null;
  difficulty: number | null;
  estimatedMinutes: number | null;
  confidence: number;
  chapters: Array<{ title: string; locator: string }>;
  concepts: string[];
  prerequisites: string[];
  practiceOpportunities: string[];
  citations: Array<{ locatorType: string; locatorValue: string; excerpt: string }>;
  limitations: string[];
};
type Phase2Review = JsonRecord & {
  id: string;
  nodeId: string;
  dueAt: string;
  intervalDays: number;
  reason: string;
  stability: number;
  lapseCount: number;
  isDue: boolean;
};
type Handoff = JsonRecord & {
  evidenceItemId: string;
  sourceType: string;
  sourceId: string;
  verificationStatus: string;
  candidateStatus: string | null;
};

export type LearningPhase2Snapshot = {
  resources: ResourceIntelligence[];
  assessments: Phase2Assessment[];
  adjustments: JsonRecord[];
  codeAssessments: JsonRecord[];
  nodes: Phase2Node[];
  reviews: Phase2Review[];
  reviewAttempts: JsonRecord[];
  estimates: JsonRecord[];
  masterySnapshots: JsonRecord[];
  evidenceHandoffs: Handoff[];
  dashboard: {
    goal: JsonRecord | null;
    whyNow: string;
    todayMission: JsonRecord | null;
    weakestConcept: Phase2Node | null;
    dueReviews: Phase2Review[];
    evidenceCount: number;
    project: JsonRecord | null;
    latestAdjustment: JsonRecord | null;
    latestEstimate: JsonRecord | null;
  };
};

const emptySnapshot: LearningPhase2Snapshot = {
  resources: [], assessments: [], adjustments: [], codeAssessments: [], nodes: [], reviews: [], reviewAttempts: [], estimates: [], masterySnapshots: [], evidenceHandoffs: [],
  dashboard: { goal: null, whyNow: "先完成资料解析和基线诊断。", todayMission: null, weakestConcept: null, dueReviews: [], evidenceCount: 0, project: null, latestAdjustment: null, latestEstimate: null },
};

const typeLabels: Record<string, string> = {
  concept_explanation: "概念解释",
  choice: "选择题",
  true_false: "判断题",
  correction: "纠错题",
  transfer: "迁移题",
  code_task: "代码任务",
  mini_project: "微型工程",
  delayed_recall: "延迟回忆",
};
const stateLabels: Record<string, string> = {
  locked: "未解锁", ready: "可学习", learning: "学习中", weak: "薄弱", mastered: "已掌握", review_due: "待复习",
};
const intelligenceLabels: Record<string, string> = {
  waiting: "等待处理", processing: "解析中", ready: "可引用", incomplete: "内容不完整", failed: "解析失败",
};

function value(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}
function percent(value: unknown) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}
function time(value: unknown) {
  if (!value) return "尚无记录";
  return new Date(String(value)).toLocaleString("zh-CN");
}
async function requestJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as JsonRecord;
  if (!response.ok) throw new Error(value(result.error, "请求失败"));
  return result;
}

export function LearningPhase2Panel({
  goal,
  view,
  initialSnapshot,
}: {
  goal: { id: string; title: string; targetAbility: string; engineeringOutcome: string };
  view: string;
  initialSnapshot?: LearningPhase2Snapshot;
}) {
  const initial = initialSnapshot?.dashboard.goal?.id === goal.id ? initialSnapshot : emptySnapshot;
  const [snapshot, setSnapshot] = useState<LearningPhase2Snapshot>(initial);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/learning-phase2?goalId=${encodeURIComponent(goal.id)}`, { cache: "no-store" });
    const result = (await response.json()) as LearningPhase2Snapshot & { error?: string };
    if (!response.ok) throw new Error(result.error || "Phase 2 数据加载失败");
    setSnapshot(result);
  }, [goal.id]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/learning-phase2?goalId=${encodeURIComponent(goal.id)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as LearningPhase2Snapshot & { error?: string };
        if (!response.ok) throw new Error(result.error || "Phase 2 数据加载失败");
        if (active) setSnapshot(result);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "Phase 2 数据加载失败");
      });
    return () => {
      active = false;
    };
  }, [goal.id]);
  const run = async (label: string, task: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(label);
    setMessage("");
    try {
      await task();
      await load();
      setMessage(`${label}完成`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label}失败`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="phase2-root" data-testid="learning-phase2">
      {message ? <div className={/失败|无效|不存在|需要/.test(message) ? "error-banner" : "learning-success"} role="status">{message}</div> : null}
      {view === "today-learning" || view === "learning" ? <Phase2Dashboard goal={goal} snapshot={snapshot} /> : null}
      {view === "today-learning" ? (
        <>
          <FormalAssessmentPanel goalId={goal.id} snapshot={snapshot} busy={busy} run={run} />
          <CodeAssessmentPanel goal={goal} snapshot={snapshot} busy={busy} run={run} />
        </>
      ) : null}
      {view === "learning-resources" ? <ResourceIntelligencePanel resources={snapshot.resources} /> : null}
      {view === "knowledge-map" ? <ConceptGraphPanel nodes={snapshot.nodes} /> : null}
      {view === "review-center" ? <ReviewIntelligencePanel snapshot={snapshot} /> : null}
    </div>
  );
}

function Phase2Dashboard({ goal, snapshot }: { goal: { title: string; engineeringOutcome: string }; snapshot: LearningPhase2Snapshot }) {
  const dashboard = snapshot.dashboard;
  const mission = dashboard.todayMission;
  const estimate = dashboard.latestEstimate;
  const project = dashboard.project;
  const adjustment = dashboard.latestAdjustment;
  const rows = [
    ["正在学习", goal.title],
    ["为什么现在学", dashboard.whyNow],
    ["今日唯一主任务", value(mission?.learningObjective, "先生成今日 Mission")],
    ["预计多久", mission ? `${value(mission.estimatedMinutes)} 分钟` : estimate ? `现实 ${value(estimate.realisticMinMinutes)}–${value(estimate.realisticMaxMinutes)} 分钟` : "等待基线估时"],
    ["当前最弱概念", dashboard.weakestConcept ? `${dashboard.weakestConcept.title} · 掌握 ${percent(dashboard.weakestConcept.mastery)}` : "等待可验证节点"],
    ["今日复习", dashboard.dueReviews.length ? `${dashboard.dueReviews.length} 项到期` : "当前无到期复习"],
    ["掌握证据", `${dashboard.evidenceCount} 条分维度 Mastery Evidence`],
    ["工程目标缺口", value(project?.status) === "reviewed" ? "工程挑战已验收" : value(project?.challengeDescription, goal.engineeringOutcome)],
    ["最近路线变化", adjustment ? `${value(adjustment.action)}：${value(adjustment.reason)}` : "尚无自动调整；完成 Assessment 后再判断"],
  ];
  return (
    <section className="learning-card phase2-dashboard" data-testid="phase2-dashboard">
      <div className="section-heading"><div><span className="section-kicker">Learning Agent Phase 2</span><h3>今天的学习决策</h3></div><BrainCircuit size={20} /></div>
      <div className="phase2-dashboard-list">{rows.map(([label, content], index) => <div key={label}><i>{index + 1}</i><span>{label}</span><strong>{content}</strong></div>)}</div>
      {estimate ? <div className="phase2-estimate"><Clock3 size={16} /><span>动态工期：乐观 {value(estimate.optimisticMinutes)} 分钟 · 现实 {value(estimate.realisticMinMinutes)}–{value(estimate.realisticMaxMinutes)} 分钟 · 保守 {value(estimate.conservativeMinutes)} 分钟</span><small>{value(estimate.calibrationReason)}</small></div> : null}
    </section>
  );
}

function FormalAssessmentPanel({ goalId, snapshot, busy, run }: { goalId: string; snapshot: LearningPhase2Snapshot; busy: string; run: (label: string, task: () => Promise<unknown>) => Promise<void> }) {
  const active = snapshot.assessments.find((item) => item.status === "ready");
  const latest = snapshot.assessments[0];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [hints, setHints] = useState<Record<string, number>>({});
  const [independence, setIndependence] = useState<Record<string, number>>({});
  const [assessmentType, setAssessmentType] = useState("immediate");
  const started = useRef<Record<string, number>>({});
  const createRequestId = useRef(crypto.randomUUID());
  const submitRequestId = useRef(crypto.randomUUID());
  const handoff = latest ? snapshot.evidenceHandoffs.find((item) => item.sourceId === latest.id) : null;
  const create = () => run("生成正式 Assessment", async () => {
    await requestJson(`/api/learning-phase2/goals/${goalId}/assessments`, { clientRequestId: createRequestId.current, nodeId: null, missionId: null, assessmentType });
    createRequestId.current = crypto.randomUUID();
  });
  const submit = () => {
    if (!active) return Promise.resolve();
    return run("提交正式 Assessment", async () => {
      await requestJson(`/api/learning-phase2/assessments/${active.id}/submit`, {
        clientRequestId: submitRequestId.current,
        answers: active.questions.map((question) => ({
          questionId: question.id,
          userAnswer: answers[question.id] || "",
          answerDurationSeconds: Math.max(1, Math.round((Date.now() - (started.current[question.id] || Date.now() - 1_000)) / 1_000)),
          confidence: confidence[question.id] || 3,
          hintCount: hints[question.id] || 0,
          independenceLevel: independence[question.id] ?? 3,
        })),
      });
      submitRequestId.current = crypto.randomUUID();
      setAnswers({}); setConfidence({}); setHints({}); setIndependence({});
    });
  };
  return (
    <section className="learning-card phase2-assessment" data-testid="formal-assessment">
      <div className="section-heading"><div><span className="section-kicker">Formal Assessment</span><h3>验证掌握，不接受“点击完成”</h3></div><ClipboardCheck size={20} /></div>
      {!active ? <div className="phase2-action-row"><select aria-label="评估类型" value={assessmentType} onChange={(event) => setAssessmentType(event.target.value)}><option value="immediate">即时综合评估</option><option value="delayed">延迟回忆评估</option><option value="review">复习评估</option><option value="project">工程阶段评估</option></select><button className="primary-button" disabled={Boolean(busy) || !snapshot.nodes.length} onClick={() => void create()}>{busy === "生成正式 Assessment" ? <LoaderCircle className="spin" size={16} /> : <ClipboardCheck size={16} />}生成 8 种题型</button></div> : null}
      {latest?.status === "graded" && !active ? <div className="phase2-result"><CheckCircle2 size={18} /><div><strong>最近评估已评分</strong><p>{latest.attempts.length} 道原始作答已保存；候选状态：{handoff?.candidateStatus || handoff?.verificationStatus || "等待 Evidence 分析"}。批准前不会修改正式能力。</p></div></div> : null}
      {active ? <form onSubmit={(event) => { event.preventDefault(); void submit(); }}><div className="phase2-question-list">{active.questions.map((question, index) => <fieldset key={question.id} onFocus={() => { started.current[question.id] ||= Date.now(); }}><legend>{index + 1}. {typeLabels[question.type] || question.type} · 难度 {question.difficulty}/5</legend><strong>{question.question}</strong><small>验证：{question.expectedSkill} · 来源 {question.sourceReference}</small>{question.options.length ? <select required value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}><option value="">选择答案</option>{question.options.map((option) => <option key={option}>{option}</option>)}</select> : <textarea required value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="写出机制、边界、失败路径和可验证证据" />}<div className="phase2-answer-meta"><select aria-label={`第 ${index + 1} 题自信度`} value={confidence[question.id] || 3} onChange={(event) => setConfidence((current) => ({ ...current, [question.id]: Number(event.target.value) }))}>{[1,2,3,4,5].map((item) => <option key={item} value={item}>自信 {item}/5</option>)}</select><label>提示次数<input type="number" min={0} max={50} value={hints[question.id] || 0} onChange={(event) => setHints((current) => ({ ...current, [question.id]: Number(event.target.value) }))} /></label><select aria-label={`第 ${index + 1} 题独立性`} value={independence[question.id] ?? 3} onChange={(event) => setIndependence((current) => ({ ...current, [question.id]: Number(event.target.value) }))}>{[0,1,2,3,4].map((item) => <option key={item} value={item}>独立性 {item}/4</option>)}</select></div></fieldset>)}</div><button className="primary-button" disabled={Boolean(busy)}><ShieldCheck size={16} />提交原始作答并生成证据候选</button></form> : null}
    </section>
  );
}

function CodeAssessmentPanel({ goal, snapshot, busy, run }: { goal: { id: string; title: string }; snapshot: LearningPhase2Snapshot; busy: string; run: (label: string, task: () => Promise<unknown>) => Promise<void> }) {
  const [form, setForm] = useState({ language: "python", filename: "main.py", sourceCode: "", userExplanation: "", changedConditionAnswer: "", failureAnalysis: "", hintCount: 0, independenceLevel: 3 });
  const requestId = useRef(crypto.randomUUID());
  const latest = snapshot.codeAssessments[0];
  const handoff = latest ? snapshot.evidenceHandoffs.find((item) => item.sourceId === latest.id) : null;
  const update = (key: string, next: string | number) => setForm((current) => ({ ...current, [key]: next }));
  return (
    <section className="learning-card phase2-code" data-testid="code-assessment">
      <div className="section-heading"><div><span className="section-kicker">Code Assessment</span><h3>代码能运行，不等于已经掌握</h3></div><Code2 size={20} /></div>
      {latest ? <div className="phase2-result"><GitBranch size={18} /><div><strong>最近静态评估 {percent(latest.weightedScore)}</strong><p>{value(latest.feedback)} · 候选 {handoff?.candidateStatus || "待分析/审批"}</p>{Array.isArray(latest.followUpQuestions) ? <ul>{latest.followUpQuestions.map((question) => <li key={String(question)}>{String(question)}</li>)}</ul> : null}</div></div> : null}
      <form onSubmit={(event) => { event.preventDefault(); void run("提交 Code Assessment", async () => { await requestJson(`/api/learning-phase2/goals/${goal.id}/code-assessments`, { ...form, clientRequestId: requestId.current, nodeId: null, filename: form.filename || null }); requestId.current = crypto.randomUUID(); }); }}>
        <div className="phase2-code-meta"><label>语言<input required value={form.language} onChange={(event) => update("language", event.target.value)} /></label><label>文件名<input value={form.filename} onChange={(event) => update("filename", event.target.value)} /></label><label className="phase2-file">读取本地代码<input type="file" accept=".py,.ts,.tsx,.js,.jsx,.java,.go,.rs,.sql,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((sourceCode) => setForm((current) => ({ ...current, filename: file.name, sourceCode }))); }} /></label></div>
        <label>用户代码<textarea required minLength={10} className="code-input" value={form.sourceCode} onChange={(event) => update("sourceCode", event.target.value)} placeholder="粘贴或读取代码。服务端只做静态评估，不执行不可信代码。" /></label>
        <div className="phase2-explanations"><label>为什么这样写？<textarea required minLength={10} value={form.userExplanation} onChange={(event) => update("userExplanation", event.target.value)} /></label><label>条件变化时怎么办？<textarea required minLength={10} value={form.changedConditionAnswer} onChange={(event) => update("changedConditionAnswer", event.target.value)} /></label><label>哪里可能失败？<textarea required minLength={10} value={form.failureAnalysis} onChange={(event) => update("failureAnalysis", event.target.value)} /></label></div>
        <div className="phase2-answer-meta"><label>AI 提示次数<input type="number" min={0} max={50} value={form.hintCount} onChange={(event) => update("hintCount", Number(event.target.value))} /></label><select aria-label="代码独立性" value={form.independenceLevel} onChange={(event) => update("independenceLevel", Number(event.target.value))}>{[0,1,2,3,4].map((item) => <option key={item} value={item}>独立性 {item}/4</option>)}</select><button className="primary-button" disabled={Boolean(busy)}><Code2 size={16} />提交静态评估</button></div>
      </form>
    </section>
  );
}

function ResourceIntelligencePanel({ resources }: { resources: ResourceIntelligence[] }) {
  return <section className="learning-card phase2-resources" data-testid="resource-intelligence"><div className="section-heading"><div><span className="section-kicker">Resource Intelligence</span><h3>只分析真实读取的内容</h3></div><FileSearch size={20} /></div>{resources.length ? <div className="phase2-resource-list">{resources.map((resource) => <details key={resource.id} open={resources.length === 1}><summary><span><b>{resource.title}</b><small>{intelligenceLabels[resource.intelligenceStatus] || resource.intelligenceStatus} · 置信 {percent(resource.confidence)}</small></span><ChevronDown size={16} /></summary><div className="phase2-resource-body"><p>作者：{resource.confirmedAuthor || "未确认，不推测"} · 难度 {resource.difficulty || "—"}/5 · 预计 {resource.estimatedMinutes || "—"} 分钟</p><div><strong>核心概念</strong><span>{resource.concepts.join("、") || "未提取"}</span></div><div><strong>前置知识</strong><span>{resource.prerequisites.join("、") || "未确认"}</span></div><div><strong>章节与定位</strong><ul>{resource.chapters.slice(0, 12).map((chapter) => <li key={`${chapter.title}:${chapter.locator}`}>{chapter.title} · {chapter.locator}</li>)}</ul></div><div><strong>可引用位置</strong><ul>{resource.citations.slice(0, 8).map((citation, index) => <li key={`${citation.locatorType}:${citation.locatorValue}:${index}`}>{citation.locatorType}:{citation.locatorValue} · {citation.excerpt}</li>)}</ul></div>{resource.limitations.length ? <div className="phase2-limit"><AlertTriangle size={15} /><span>{resource.limitations.join("；")}</span></div> : null}</div></details>)}</div> : <div className="learning-empty"><FileSearch /><p>添加资料后先保存原始记录，再显示 waiting、processing、ready、incomplete 或 failed。</p></div>}</section>;
}

function ConceptGraphPanel({ nodes }: { nodes: Phase2Node[] }) {
  return <section className="learning-card phase2-concepts" data-testid="concept-graph"><div className="section-heading"><div><span className="section-kicker">Concept Graph</span><h3>节点、依赖与证据状态</h3></div><GitBranch size={20} /></div><div className="phase2-node-list">{nodes.map((node, index) => <article key={node.id}><i>{index + 1}</i><div><header><strong>{node.title}</strong><span>{stateLabels[node.learningState] || node.learningState}</span></header><p>{node.whyNow || "当前节点尚无可解释的推进原因。"}</p><div className="mastery-bar"><i style={{ width: percent(node.mastery) }} /><span>掌握 {percent(node.mastery)} · 置信 {percent(node.masteryConfidence)} · {node.evidenceCount} 条证据</span></div><dl><dt>前置</dt><dd>{node.prerequisites.join("、") || "无"}</dd><dt>下一步</dt><dd>{node.nextConcepts.join("、") || "工程挑战"}</dd><dt>资料引用</dt><dd>{node.resourceRefs.join("、") || "尚无可靠引用"}</dd><dt>已识别误区</dt><dd>{node.misconceptions.join("；") || "尚无"}</dd><dt>学习 / 评估 / 复习</dt><dd>{time(node.lastStudiedAt)} / {time(node.lastAssessedAt)} / {time(node.nextReviewAt)}</dd></dl></div></article>)}</div>{!nodes.length ? <div className="learning-empty"><GitBranch /><p>完成基线诊断后生成可追溯的概念依赖图。</p></div> : null}</section>;
}

function ReviewIntelligencePanel({ snapshot }: { snapshot: LearningPhase2Snapshot }) {
  const overdue = snapshot.reviews.filter((item) => item.isDue);
  const upcoming = snapshot.reviews.filter((item) => !item.isDue);
  return <section className="learning-card phase2-review" data-testid="review-intelligence"><div className="section-heading"><div><span className="section-kicker">Review Scheduler</span><h3>间隔有原因，历史不覆盖</h3></div><History size={20} /></div><div className="review-summary"><span>今日 / 逾期 <b>{overdue.length}</b></span><span>即将到期 <b>{upcoming.length}</b></span><span>历史作答 <b>{snapshot.reviewAttempts.length}</b></span></div><div className="phase2-review-list">{snapshot.reviews.map((review) => <article key={review.id}><RefreshCw size={16} /><div><strong>{review.isDue ? "应立即复习" : time(review.dueAt)}</strong><p>{review.reason}</p><small>间隔 {review.intervalDays} 天 · 稳定度 {Number(review.stability || 0).toFixed(1)} · 遗忘失败 {review.lapseCount || 0} 次</small></div></article>)}</div>{snapshot.reviewAttempts.length ? <div className="phase2-history"><strong>最近复习历史</strong>{snapshot.reviewAttempts.slice(0, 12).map((attempt) => <p key={String(attempt.id)}><span>{value(attempt.nodeTitle)} · {percent(attempt.score)} · 独立性 {value(attempt.independenceLevel)}/4 · 提示 {value(attempt.hintCount, "0")}</span><small>{time(attempt.createdAt)} · 下次间隔 {value(attempt.nextIntervalDays)} 天</small></p>)}</div> : null}</section>;
}
