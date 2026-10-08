"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Code2,
  Compass,
  Database,
  FileText,
  FileCheck2,
  FolderKanban,
  Home,
  Link2,
  Map,
  Network,
  PenLine,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
  SquareTerminal,
  Target,
  Upload,
} from "lucide-react";
import type { learningSectionKeys } from "@/lib/navigation";
import {
  LearningAgentPanel,
  type LearningAgentSnapshot,
} from "@/components/learning-agent";
import {
  LearningPhase2Panel,
  type LearningPhase2Snapshot,
} from "@/components/learning-phase2";
import {
  ProjectChallengePanel,
  type ProjectChallengeSnapshot,
} from "@/components/project-challenge";
import {
  DailyLearningLoopPanel,
  type DailyLearningLoopSnapshot,
} from "@/components/daily-learning-loop";
import { GenesisMentorPanel } from "@/components/genesis-mentor";
import { MasteryTruthPanel } from "@/components/mastery-truth";
import type { MasteryPackage } from "@/lib/domain/mastery-package";

type LearningView = (typeof learningSectionKeys)[number];
type Goal = {
  id: string;
  title: string;
  purpose: string;
  currentBasis: string;
  finalGoal: string;
  targetAbility: string;
  currentLevel: number;
  targetLevelScore: number;
  motivation: string;
  targetLevel: string;
  masteryLevel: number;
  dailyMinutes: number;
  weeklyDays: number;
  deadline: string | null;
  engineeringOutcome: string;
  fdeLinked: number | boolean;
  dataKind: string;
  status: string;
};
type ResourceSection = {
  id: string;
  title: string;
  locatorType: string;
  locatorValue: string;
  excerpt: string;
};
type Resource = {
  id: string;
  goalId: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  originalFilename: string | null;
  authorSource: string | null;
  characterCount: number;
  estimatedMinutes: number | null;
  difficulty: number | null;
  status: "queued" | "processing" | "ready" | "failed" | "unsupported";
  statusMessage: string;
  errorCode: string | null;
  coreTopics: string[];
  prerequisites: string[];
  keyConcepts: string[];
  practiceOpportunities: string[];
  sections: ResourceSection[];
};
type Question = {
  id: string;
  type: "concept" | "explanation" | "correction" | "transfer" | "practice";
  prompt: string;
  rubric: string[];
  concept: string;
};
type Diagnostic = {
  id: string;
  goalId: string;
  status: "ready" | "submitted";
  questions: Question[];
  score: number | null;
  optimisticMinutes: number | null;
  realisticMinutes: number | null;
  conservativeMinutes: number | null;
  confidence: number | null;
  prerequisiteGaps: string[];
  uncertainty: string[];
  modelMode: string;
  provider?: string;
};
type Node = {
  id: string;
  goalId: string;
  title: string;
  description: string;
  position: number;
  difficulty: number;
  mastery: number;
  masteryConfidence: number;
  evidenceCount: number;
  status: string;
};
type Stage = {
  key: string;
  label: string;
  prompt: string;
  evidenceType: string | null;
};
type Turn = {
  id: string;
  stageKey: string;
  prompt: string;
  response: string | null;
  feedback: string | null;
  score: number | null;
};
type Session = {
  id: string;
  goalId: string;
  nodeId: string;
  title: string;
  status: string;
  currentStage: number;
  stages: Stage[];
  turns?: Turn[];
  activeStage?: Stage | null;
};
type Review = {
  id: string;
  goalId: string;
  nodeId: string;
  dueAt: string;
  intervalDays: number;
  reason: string;
  status: string;
  isDue: boolean;
};
type Outcome = {
  id: string;
  goalId: string;
  title: string;
  status: string;
  deploymentUrl: string | null;
  codeAuthorship: string;
};
type Estimate = {
  id: string;
  goalId: string;
  optimisticMinutes: number;
  realisticMinutes: number;
  conservativeMinutes: number;
  prerequisiteMinutes: number;
  theoryMinutes: number;
  practiceMinutes: number;
  projectMinutes: number;
  reviewMinutes: number;
  confidence: number;
  uncertaintyJson: string;
};
type Snapshot = {
  goals: Goal[];
  resources: Resource[];
  diagnostics: Diagnostic[];
  nodes: Node[];
  edges: Array<{ prerequisiteNodeId: string; dependentNodeId: string }>;
  sessions: Session[];
  reviews: Review[];
  outcomes: Outcome[];
  evidence: unknown[];
  timeEstimates: Estimate[];
  agent: LearningAgentSnapshot;
  phase2: unknown;
  projectChallenges: unknown;
  dailyLoop: DailyLearningLoopSnapshot;
  masteryPackages: MasteryPackage[];
};

const nav = [
  ["/", "今日", Home],
  ["/learning", "深度学习", BookOpen],
  ["/learning-goals", "学习目标", Target],
  ["/learning-resources", "学习资料", FolderKanban],
  ["/today-learning", "今日学习", Play],
  ["/knowledge-map", "知识地图", Map],
  ["/review-center", "审查中心", RefreshCw],
  ["/project-challenge", "工程挑战", SquareTerminal],
  ["/cognition", "认知成长", Compass],
  ["/self-input", "自我输入", PenLine],
  ["/digital-life", "数字分身", Brain],
  ["/growth-graph", "成长图谱", Network],
  ["/evidence", "能力证据", FileCheck2],
  ["/timeline", "成长时间线", Activity],
  ["/settings", "设置", Settings],
] as const;
const viewTitles: Record<LearningView, string> = {
  learning: "深度学习",
  "learning-goals": "学习目标",
  "learning-resources": "学习资料",
  "today-learning": "今日学习",
  "knowledge-map": "知识地图",
  "review-center": "审查中心",
  "project-challenge": "工程挑战",
};
const questionLabels = {
  concept: "概念题",
  explanation: "开放解释题",
  correction: "纠错题",
  transfer: "迁移题",
  practice: "小型实践",
};
const levelLabels: Record<string, string> = {
  literacy: "了解概念",
  working: "独立做题",
  proficient: "迁移与工程实现",
  expert: "设计优化并教学",
};
const masteryLabels = [
  "",
  "了解概念",
  "能够解释",
  "能够独立做题",
  "能够迁移应用",
  "能够工程实现",
  "能够设计、优化并教给别人",
];
const statusLabels: Record<string, string> = {
  locked: "尚未解锁",
  ready: "可以学习",
  learning: "正在学习",
  review: "需要复习",
  mastered: "已掌握",
};

async function jsonRequest(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as {
    error?: string;
    issues?: Array<{ message: string }>;
  };
  if (!response.ok)
    throw new Error(result.error || result.issues?.[0]?.message || "操作失败");
  return result;
}

function minutes(value: number | null | undefined) {
  if (!value) return "—";
  if (value < 60) return `${value} 分钟`;
  return `${Math.round(value / 6) / 10} 小时`;
}

export function LearningEngine({
  initialSnapshot,
  view,
}: {
  initialSnapshot: Snapshot;
  view: LearningView;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedGoalId, setSelectedGoalId] = useState(
    initialSnapshot.goals[0]?.id || "",
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/learning", { cache: "no-store" });
    const result = (await response.json()) as Snapshot & { error?: string };
    if (!response.ok) throw new Error(result.error || "学习数据加载失败");
    setSnapshot(result);
  }, []);
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
  const goal =
    snapshot.goals.find((item) => item.id === selectedGoalId) ||
    snapshot.goals[0];
  const goalId = goal?.id || "";
  const resources = snapshot.resources.filter((item) => item.goalId === goalId);
  const diagnostic = snapshot.diagnostics.find(
    (item) => item.goalId === goalId,
  );
  const nodes = snapshot.nodes.filter((item) => item.goalId === goalId);
  const reviews = snapshot.reviews.filter((item) => item.goalId === goalId);
  const activeSession = snapshot.sessions.find(
    (item) => item.goalId === goalId && item.status === "active",
  );
  const outcomes = snapshot.outcomes.filter((item) => item.goalId === goalId);
  const estimate = snapshot.timeEstimates?.find(
    (item) => item.goalId === goalId,
  );
  const mode =
    diagnostic?.modelMode === "real"
      ? `${diagnostic.provider || "真实"} AI`
      : diagnostic?.modelMode === "openai"
        ? "OpenAI Responses API"
        : "演示 AI（明确标记）";

  return (
    <div className="shell learning-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">G</span>
          <span>
            <strong>Genesis</strong>
            <small>个人进化系统</small>
          </span>
        </Link>
        <nav>
          {nav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={href === `/${view}` ? "active" : ""}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="side-note">
          <Database size={16} />
          <div>
            <strong>证据驱动掌握</strong>
            <span>点击完成不会提高掌握度</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">AI 深度学习引擎 · 纵向闭环</span>
            <h1>{viewTitles[view]}</h1>
          </div>
          <div className="top-actions">
            <span className={`mode ${mode.startsWith("演示") ? "demo" : ""}`}>
              <Sparkles size={14} />
              {mode}
            </span>
          </div>
        </header>
        {message ? (
          <div
            className={
              /失败|无效|需要|不存在|请先|无法|尚未到期/.test(message)
                ? "error-banner"
                : "learning-success"
            }
            role="status"
          >
            {message}
          </div>
        ) : null}
        {!goal ? (
          <>
            <section className="learning-card context-onboarding">
              <span className="section-kicker">首次进入 · Context 引导</span>
              <h2>先建立一个可诊断的学习目标</h2>
              <div className="context-onboarding-grid">
                <div><span>长期目标</span><strong>成为 FDE</strong></div>
                <div><span>当前阶段</span><strong>大一结束进入大二</strong></div>
                <div><span>方向</span><strong>AI 应用开发</strong></div>
                <div><span>示例</span><strong>Python 工程能力提升</strong></div>
              </div>
            </section>
            <GoalCreator busy={busy} run={run} onCreated={setSelectedGoalId} />
            {view === "today-learning" ? <GenesisMentorPanel /> : null}
          </>
        ) : (
          <>
            <GoalHeader
              goal={goal}
              goals={snapshot.goals}
              goalId={goalId}
              select={setSelectedGoalId}
            />
            <LearningPhase2Panel
              goal={goal}
              view={view}
              initialSnapshot={snapshot.phase2 as LearningPhase2Snapshot}
            />
            {view === "learning" || view === "today-learning" ? (
              <MasteryTruthPanel key={`mastery-${goal.id}`} goal={goal} />
            ) : null}
            {view === "project-challenge" ? (
              <ProjectChallengePanel
                key={goal.id}
                goal={goal}
                initialSnapshot={snapshot.projectChallenges as ProjectChallengeSnapshot}
              />
            ) : null}
            {view === "today-learning" ? (
              <>
                <DailyLearningLoopPanel
                  goalId={goal.id}
                  snapshot={snapshot.dailyLoop}
                  busy={busy}
                  run={run}
                />
                <LearningAgentPanel
                  goal={goal}
                  snapshot={snapshot.agent}
                  baselineReady={diagnostic?.status === "submitted"}
                  busy={busy}
                  run={run}
                />
                <GenesisMentorPanel goal={goal} />
              </>
            ) : null}
            {view === "learning" ? (
              <>
                <LearningDashboard
                  goal={goal}
                  resources={resources}
                  diagnostic={diagnostic}
                  nodes={nodes}
                  reviews={reviews}
                  estimate={estimate}
                  outcomes={outcomes}
                />
                <MasteryPackagePanel
                  masteryPackage={snapshot.masteryPackages.find(
                    (item) => item.goalId === goalId,
                  )}
                />
                <Progress
                  resources={resources}
                  diagnostic={diagnostic}
                  nodes={nodes}
                  sessions={snapshot.sessions.filter(
                    (item) => item.goalId === goalId,
                  )}
                  outcomes={outcomes}
                />
                <ResourcePanel
                  goalId={goalId}
                  resources={resources}
                  busy={busy}
                  run={run}
                />
                <DiagnosticPanel
                  goalId={goalId}
                  diagnostic={diagnostic}
                  estimate={estimate}
                  hasReadyResource={resources.some(
                    (item) => item.status === "ready",
                  )}
                  busy={busy}
                  run={run}
                />
                {diagnostic?.status === "submitted" ? (
                  <>
                    <KnowledgePanel nodes={nodes} reviews={reviews} />
                    <SessionPanel
                      goalId={goalId}
                      activeSession={activeSession}
                      sessions={snapshot.sessions.filter(
                        (item) => item.goalId === goalId,
                      )}
                      nodes={nodes}
                      busy={busy}
                      run={run}
                    />
                    <ReviewCenter
                      reviews={reviews}
                      nodes={nodes}
                      busy={busy}
                      run={run}
                    />
                    <OutcomePanel
                      goal={goal}
                      outcomes={outcomes}
                      busy={busy}
                      run={run}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {view === "learning-goals" ? (
              <>
                <GoalList goals={snapshot.goals} />
                <GoalCreator
                  busy={busy}
                  run={run}
                  onCreated={setSelectedGoalId}
                />
              </>
            ) : null}
            {view === "learning-resources" ? (
              <ResourcePanel
                goalId={goalId}
                resources={resources}
                busy={busy}
                run={run}
              />
            ) : null}
            {view === "today-learning" ? (
              <>
                {diagnostic?.status !== "submitted" ? (
                  <DiagnosticPanel
                    goalId={goalId}
                    diagnostic={diagnostic}
                    estimate={estimate}
                    hasReadyResource={resources.some(
                      (item) => item.status === "ready",
                    )}
                    busy={busy}
                    run={run}
                  />
                ) : (
                  <SessionPanel
                    goalId={goalId}
                    activeSession={activeSession}
                    sessions={snapshot.sessions.filter(
                      (item) => item.goalId === goalId,
                    )}
                    nodes={nodes}
                    busy={busy}
                    run={run}
                  />
                )}
                <OutcomePanel
                  goal={goal}
                  outcomes={outcomes}
                  busy={busy}
                  run={run}
                />
              </>
            ) : null}
            {view === "knowledge-map" ? (
              <>
                {diagnostic?.status === "submitted" ? (
                  <KnowledgePanel nodes={nodes} reviews={reviews} />
                ) : (
                  <DiagnosticPanel
                    goalId={goalId}
                    diagnostic={diagnostic}
                    estimate={estimate}
                    hasReadyResource={resources.some(
                      (item) => item.status === "ready",
                    )}
                    busy={busy}
                    run={run}
                  />
                )}
              </>
            ) : null}
            {view === "review-center" ? (
              <ReviewCenter
                reviews={reviews}
                nodes={nodes}
                busy={busy}
                run={run}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function GoalHeader({
  goal,
  goals,
  goalId,
  select,
}: {
  goal: Goal;
  goals: Goal[];
  goalId: string;
  select: (id: string) => void;
}) {
  return (
    <section className="learning-hero">
      <div>
        <span className="section-kicker">当前学习路径</span>
        <div className="goal-title-row">
          <h2>{goal.title}</h2>
          <select
            value={goalId}
            onChange={(event) => select(event.target.value)}
          >
            {goals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <p>{goal.purpose}</p>
      </div>
      <div className="goal-meta">
        <span>
          {masteryLabels[goal.masteryLevel] || levelLabels[goal.targetLevel]}
        </span>
        <span>
          每天 {goal.dailyMinutes} 分钟 · 每周 {goal.weeklyDays} 天
        </span>
        <span>
          {goal.deadline
            ? `截止 ${new Date(goal.deadline).toLocaleDateString("zh-CN")}`
            : "无硬截止日期"}
        </span>
        <span>{goal.fdeLinked ? "关联 FDE 目标" : "独立学习目标"}</span>
      </div>
    </section>
  );
}

const masteryPackageStatusLabels = {
  not_started: "尚未开始",
  in_progress: "正在积累",
  evidence_ready: "已有证据",
} as const;

function MasteryPackagePanel({
  masteryPackage,
}: {
  masteryPackage?: MasteryPackage;
}) {
  if (!masteryPackage) return null;
  return (
    <section className="learning-card mastery-package" data-testid="mastery-package">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Genesis Mastery Package</span>
          <h3>从资料到掌握认证的完整证据链</h3>
        </div>
        <FileCheck2 size={20} />
      </div>
      <p className="mastery-package-boundary">
        这里汇总已保存的真实记录，不生成掌握结论，也不会修改正式能力。课程完成仍不等于真正掌握。
      </p>
      <ol className="mastery-package-spine">
        {masteryPackage.stages.map((item, index) => (
          <li className={item.status} key={item.key}>
            <i aria-hidden="true">{index + 1}</i>
            <div>
              <header>
                <strong>{item.label}</strong>
                <span>{masteryPackageStatusLabels[item.status]}</span>
              </header>
              <p>{item.summary}</p>
              <small>下一步：{item.nextAction}</small>
            </div>
          </li>
        ))}
      </ol>
      <footer>
        <span>八项硬门槛：{masteryPackage.passedGates}/{masteryPackage.requiredGates}</span>
        <span>正式掌握：未由本汇总声明</span>
        <span>正式能力：未修改</span>
      </footer>
    </section>
  );
}

function LearningDashboard({
  goal,
  resources,
  diagnostic,
  nodes,
  reviews,
  estimate,
  outcomes,
}: {
  goal: Goal;
  resources: Resource[];
  diagnostic?: Diagnostic;
  nodes: Node[];
  reviews: Review[];
  estimate?: Estimate;
  outcomes: Outcome[];
}) {
  const current = nodes.find((item) =>
    ["ready", "learning", "review"].includes(item.status),
  );
  const due = reviews.filter((item) => new Date(item.dueAt) <= new Date());
  const biggestGap =
    diagnostic?.prerequisiteGaps[0] ||
    nodes.find((item) => item.status === "locked")?.title ||
    "等待基线诊断";
  return (
    <section className="learning-card dashboard-card">
      <div className="section-heading">
        <div>
          <span className="section-kicker">学习控制台</span>
          <h3>今天只推进一个可验证的下一步</h3>
        </div>
        <Target size={20} />
      </div>
      <div className="dashboard-grid">
        <div>
          <span>我正在学什么？</span>
          <strong>{goal.title}</strong>
        </div>
        <div>
          <span>为什么学习？</span>
          <strong>{goal.purpose}</strong>
        </div>
        <div>
          <span>当前掌握</span>
          <strong>
            {nodes.length
              ? `${Math.round((nodes.reduce((sum, item) => sum + Number(item.mastery), 0) / nodes.length) * 100)}%`
              : "等待诊断"}
          </strong>
        </div>
        <div>
          <span>今天学什么？</span>
          <strong>{current?.title || "先添加资料并完成诊断"}</strong>
        </div>
        <div>
          <span>预计还需要多久？</span>
          <strong>
            {estimate
              ? `${minutes(estimate.optimisticMinutes)}–${minutes(estimate.conservativeMinutes)}`
              : "诊断后给出范围"}
          </strong>
        </div>
        <div>
          <span>最大知识缺口</span>
          <strong>{biggestGap}</strong>
        </div>
        <div>
          <span>下次复习</span>
          <strong>
            {due.length
              ? `${due.length} 项已到期`
              : reviews[0]
                ? new Date(reviews[0].dueAt).toLocaleDateString("zh-CN")
                : "完成学习后安排"}
          </strong>
        </div>
        <div>
          <span>最终工程作品</span>
          <strong>{outcomes[0]?.title || goal.engineeringOutcome}</strong>
        </div>
      </div>
      <small>
        资料：{resources.filter((item) => item.status === "ready").length}{" "}
        份可引用 · 时间估算置信度{" "}
        {Math.round(
          (estimate?.confidence || diagnostic?.confidence || 0) * 100,
        )}
        %
      </small>
    </section>
  );
}

function Progress({
  resources,
  diagnostic,
  nodes,
  sessions,
  outcomes,
}: {
  resources: Resource[];
  diagnostic?: Diagnostic;
  nodes: Node[];
  sessions: Session[];
  outcomes: Outcome[];
}) {
  const labels = ["目标", "资料", "诊断", "知识地图", "每日会话", "工程成果"];
  const states = [
    true,
    resources.some((item) => item.status === "ready"),
    diagnostic?.status === "submitted",
    nodes.length > 0,
    sessions.some((item) => item.status === "completed"),
    outcomes.length > 0,
  ];
  return (
    <div className="learning-progress">
      {labels.map((label, index) => (
        <div className={states[index] ? "done" : ""} key={label}>
          <i>{states[index] ? <CheckCircle2 size={14} /> : index + 1}</i>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function GoalList({ goals }: { goals: Goal[] }) {
  return (
    <section className="learning-card">
      <div className="section-heading">
        <div>
          <span className="section-kicker">已有目标</span>
          <h3>{goals.length} 条真实学习路径</h3>
        </div>
      </div>
      <div className="goal-list">
        {goals.map((goal) => (
          <article key={goal.id}>
            <strong>{goal.title}</strong>
            <p>{goal.finalGoal}</p>
            <small>
              {masteryLabels[goal.masteryLevel]} · 每周 {goal.weeklyDays} 天 ·{" "}
              {goal.dataKind.toUpperCase()}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

function GoalCreator({
  busy,
  run,
  onCreated,
}: {
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({
    title: "Python工程能力提升",
    purpose: "围绕成为 FDE 的长期目标，建立可迁移的 Python 工程能力并独立交付 AI 应用后端",
    currentBasis: "大一结束进入大二；会借助 AI 编写基础 Python，但工程化、测试、并发和调试能力尚未系统验证",
    finalGoal: "能够独立设计、实现、测试、解释并部署一个可靠的 Python AI 应用后端",
    targetAbility: "Python 工程能力",
    currentLevel: 1,
    targetLevelScore: 4,
    motivation: "成为能深入现场、理解业务并独立交付 AI 解决方案的 FDE",
    targetLevel: "proficient",
    masteryLevel: 5,
    dailyMinutes: 90,
    weeklyDays: 5,
    deadline: "",
    engineeringOutcome:
      "独立完成一个包含 API、参数校验、数据库、错误处理、测试、文档和部署的 AI 应用后端",
    fdeLinked: true,
    dataKind: "user",
  });
  const requestId = useRef(crypto.randomUUID());
  return (
    <form
      className="learning-card goal-creator"
      onSubmit={(event) => {
        event.preventDefault();
        void run("创建学习目标", async () => {
          const result = (await jsonRequest("/api/learning/goals", "POST", {
            ...form,
            deadline: form.deadline
              ? new Date(`${form.deadline}T23:59:59`).toISOString()
              : null,
            clientRequestId: requestId.current,
          })) as { id?: string };
          if (result.id) onCreated(result.id);
          requestId.current = crypto.randomUUID();
        });
      }}
    >
      <span className="section-kicker">学习目标</span>
      <h2>创建一条可诊断、可实践、可交付的学习路径</h2>
      <div className="learning-form-grid">
        <label>
          学习主题
          <input
            required
            minLength={3}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          目标能力等级（0–5）
          <select
            value={form.targetLevelScore}
            onChange={(e) =>
              setForm({
                ...form,
                targetLevelScore: Number(e.target.value),
                masteryLevel: Math.min(6, Number(e.target.value) + 1),
                targetLevel:
                  Number(e.target.value) >= 4
                    ? "proficient"
                    : Number(e.target.value) >= 2
                      ? "working"
                      : "literacy",
              })
            }
          >
            {masteryLabels.slice(1, 6).map((label, index) => (
              <option key={label} value={index + 1}>
                {index + 1}. {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          目标能力
          <input
            required
            minLength={2}
            value={form.targetAbility}
            onChange={(e) => setForm({ ...form, targetAbility: e.target.value })}
          />
        </label>
        <label>
          当前能力等级（0–5）
          <input
            type="number"
            min={0}
            max={4}
            value={form.currentLevel}
            onChange={(e) => setForm({ ...form, currentLevel: Number(e.target.value) })}
          />
        </label>
        <label className="wide">
          学习原因
          <textarea
            required
            minLength={10}
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        </label>
        <label className="wide">
          长期动机
          <textarea
            required
            minLength={5}
            value={form.motivation}
            onChange={(e) => setForm({ ...form, motivation: e.target.value })}
          />
        </label>
        <label className="wide">
          当前基础
          <textarea
            required
            minLength={2}
            value={form.currentBasis}
            onChange={(e) => setForm({ ...form, currentBasis: e.target.value })}
          />
        </label>
        <label className="wide">
          最终目标
          <textarea
            required
            minLength={5}
            value={form.finalGoal}
            onChange={(e) => setForm({ ...form, finalGoal: e.target.value })}
          />
        </label>
        <label>
          每天投入分钟
          <input
            type="number"
            min={10}
            max={480}
            value={form.dailyMinutes}
            onChange={(e) =>
              setForm({ ...form, dailyMinutes: Number(e.target.value) })
            }
          />
        </label>
        <label>
          每周投入天数
          <input
            type="number"
            min={1}
            max={7}
            value={form.weeklyDays}
            onChange={(e) =>
              setForm({ ...form, weeklyDays: Number(e.target.value) })
            }
          />
        </label>
        <label>
          截止日期（可选）
          <input
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={form.fdeLinked}
            onChange={(e) => setForm({ ...form, fdeLinked: e.target.checked })}
          />
          <span>
            <strong>关联 FDE 职业目标</strong>
            <small>只用于学习规划，不自动改写画像</small>
          </span>
        </label>
        <label className="wide">
          最终工程成果
          <input
            required
            minLength={10}
            value={form.engineeringOutcome}
            onChange={(e) =>
              setForm({ ...form, engineeringOutcome: e.target.value })
            }
          />
        </label>
      </div>
      <button className="primary-button" disabled={Boolean(busy)}>
        创建并进入资料阶段
        <ChevronRight size={16} />
      </button>
    </form>
  );
}

function ResourcePanel({
  goalId,
  resources,
  busy,
  run,
}: {
  goalId: string;
  resources: Resource[];
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState("webpage");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const urlId = useRef(crypto.randomUUID());
  const fileId = useRef(crypto.randomUUID());
  return (
    <section className="learning-card">
      <div className="section-heading">
        <div>
          <span className="section-kicker">真实资料入口</span>
          <h3>资料解析、来源定位与失败状态</h3>
        </div>
        <span>
          {resources.filter((item) => item.status === "ready").length} 份可分析
        </span>
      </div>
      <div className="resource-inputs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("添加链接", async () => {
              await jsonRequest("/api/learning/resources/url", "POST", {
                goalId,
                url,
                sourceType,
                title: title || undefined,
                clientRequestId: urlId.current,
              });
              urlId.current = crypto.randomUUID();
              setUrl("");
              setTitle("");
            });
          }}
        >
          <Link2 size={18} />
          <strong>添加网页、文档、GitHub、视频或播放列表</strong>
          <div>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
            >
              <option value="webpage">网页</option>
              <option value="documentation">技术文档</option>
              <option value="github">GitHub 仓库</option>
              <option value="video">视频</option>
              <option value="playlist">播放列表</option>
            </select>
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="自定义标题（可选）"
          />
          <button disabled={Boolean(busy)}>保存并真实解析</button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            void run("上传资料", async () => {
              const data = new FormData();
              data.set("goalId", goalId);
              data.set("clientRequestId", fileId.current);
              data.set("file", file);
              if (title) data.set("title", title);
              const response = await fetch("/api/learning/resources/upload", {
                method: "POST",
                body: data,
              });
              const result = (await response.json()) as { error?: string };
              if (!response.ok) throw new Error(result.error || "上传失败");
              fileId.current = crypto.randomUUID();
              setFile(null);
              setTitle("");
            });
          }}
        >
          <Upload size={18} />
          <strong>上传 PDF / Markdown / TXT / EPUB</strong>
          <input
            required
            type="file"
            accept=".pdf,.md,.markdown,.txt,.epub"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <small>最大 15 MB；扫描 PDF 无文本时会明确提示需要 OCR。</small>
          <button disabled={Boolean(busy) || !file}>
            {busy === "上传资料" ? "正在解析…" : "保存原文件并解析"}
          </button>
        </form>
      </div>
      <div className="resource-list">
        {resources.map((item) => (
          <article key={item.id} className={`resource-item ${item.status}`}>
            <span>
              {item.status === "ready" ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.statusMessage}</p>
              <small>
                {item.sourceType.toUpperCase()} · 来源{" "}
                {item.authorSource ||
                  item.sourceUrl ||
                  item.originalFilename ||
                  item.id}{" "}
                · {item.characterCount.toLocaleString("zh-CN")} 字符 ·{" "}
                {minutes(item.estimatedMinutes)} · 难度 {item.difficulty || "—"}
                /5{item.errorCode ? ` · ${item.errorCode}` : ""}
              </small>
              {item.status === "ready" ? (
                <details>
                  <summary>查看解析结构与引用位置</summary>
                  <div className="resource-analysis">
                    <p>
                      <b>核心主题：</b>
                      {item.coreTopics.join("、") || "未识别"}
                    </p>
                    <p>
                      <b>前置知识：</b>
                      {item.prerequisites.join("、") || "待诊断"}
                    </p>
                    <p>
                      <b>实践机会：</b>
                      {item.practiceOpportunities.join("；") || "待生成"}
                    </p>
                    {item.sections.map((section) => (
                      <blockquote key={section.id}>
                        <strong>{section.title}</strong>
                        <small>
                          {section.locatorType}:{section.locatorValue} · 资料{" "}
                          {item.id.slice(0, 8)}…
                        </small>
                        <p>{section.excerpt}</p>
                      </blockquote>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!resources.length ? (
        <div className="learning-empty">
          <FileText />
          <p>还没有资料。原始文件或链接会先保存；解析失败不会丢失记录。</p>
        </div>
      ) : null}
    </section>
  );
}

function DiagnosticPanel({
  goalId,
  diagnostic,
  estimate,
  hasReadyResource,
  busy,
  run,
}: {
  goalId: string;
  diagnostic?: Diagnostic;
  estimate?: Estimate;
  hasReadyResource: boolean;
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const started = useRef<Record<string, number>>({});
  if (!diagnostic)
    return (
      <section className="learning-card diagnostic-start">
        <Brain size={24} />
        <div>
          <span className="section-kicker">基线诊断</span>
          <h3>五种题型，不靠自我感觉定起点</h3>
          <p>概念、开放解释、纠错、迁移和小型实践共同暴露前置缺口。</p>
        </div>
        <button
          className="primary-button"
          disabled={Boolean(busy) || !hasReadyResource}
          onClick={() =>
            void run("生成基线诊断", () =>
              jsonRequest(`/api/learning/goals/${goalId}/baseline`, "POST", {}),
            )
          }
        >
          {busy === "生成基线诊断" ? "正在生成…" : "生成基线诊断"}
        </button>
        {!hasReadyResource ? (
          <small>先添加至少一份成功解析的资料。</small>
        ) : null}
      </section>
    );
  if (diagnostic.status === "submitted")
    return (
      <section className="learning-card estimate-card">
        <div className="section-heading">
          <div>
            <span className="section-kicker">基线结果</span>
            <h3>学习时间范围与不确定性</h3>
          </div>
          <span className="confidence-chip">
            置信度 {Math.round((diagnostic.confidence || 0) * 100)}%
          </span>
        </div>
        <div className="estimate-grid">
          <div>
            <span>乐观</span>
            <strong>{minutes(diagnostic.optimisticMinutes)}</strong>
          </div>
          <div className="realistic">
            <span>现实</span>
            <strong>{minutes(diagnostic.realisticMinutes)}</strong>
          </div>
          <div>
            <span>保守</span>
            <strong>{minutes(diagnostic.conservativeMinutes)}</strong>
          </div>
          <div>
            <span>基线得分</span>
            <strong>{Math.round((diagnostic.score || 0) * 100)}%</strong>
          </div>
        </div>
        {estimate ? (
          <div className="estimate-breakdown">
            <span>前置补充 {minutes(estimate.prerequisiteMinutes)}</span>
            <span>理论 {minutes(estimate.theoryMinutes)}</span>
            <span>练习 {minutes(estimate.practiceMinutes)}</span>
            <span>工程 {minutes(estimate.projectMinutes)}</span>
            <span>复习 {minutes(estimate.reviewMinutes)}</span>
          </div>
        ) : null}
        <div className="estimate-notes">
          <div>
            <strong>主要前置缺口</strong>
            <p>
              {diagnostic.prerequisiteGaps.length
                ? diagnostic.prerequisiteGaps.join("、")
                : "当前回答未暴露明显缺口，但仍需延迟测试验证。"}
            </p>
          </div>
          <div>
            <strong>主要不确定因素</strong>
            <ul>
              {diagnostic.uncertainty.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  return (
    <form
      className="learning-card"
      onSubmit={(e) => {
        e.preventDefault();
        void run("提交基线诊断", () =>
          jsonRequest(`/api/learning/goals/${goalId}/baseline`, "PATCH", {
            answers: diagnostic.questions.map((q) => ({
              questionId: q.id,
              answer: answers[q.id] || "",
              confidence: confidence[q.id] || 3,
              responseTimeSeconds: Math.max(
                1,
                Math.round(
                  (Date.now() - (started.current[q.id] || Date.now() - 60000)) /
                    1000,
                ),
              ),
            })),
          }),
        );
      }}
    >
      <div className="section-heading">
        <div>
          <span className="section-kicker">
            基线诊断 ·{" "}
            {diagnostic.modelMode === "real"
              ? `${diagnostic.provider || "Real"} AI`
              : diagnostic.modelMode === "openai"
                ? "OpenAI"
                : "Demo"}
          </span>
          <h3>请独立回答，不查资料</h3>
        </div>
        <span>5 题</span>
      </div>
      <div className="question-list">
        {diagnostic.questions.map((question, index) => (
          <label key={question.id}>
            <span>
              {index + 1} · {questionLabels[question.type]}
            </span>
            <strong>{question.prompt}</strong>
            <textarea
              required
              value={answers[question.id] || ""}
              onFocus={() => {
                started.current[question.id] ||= Date.now();
              }}
              onChange={(e) =>
                setAnswers({ ...answers, [question.id]: e.target.value })
              }
            />
            <select
              aria-label={`第 ${index + 1} 题作答自信度`}
              value={confidence[question.id] || 3}
              onChange={(e) =>
                setConfidence({
                  ...confidence,
                  [question.id]: Number(e.target.value),
                })
              }
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option value={value} key={value}>
                  自信度 {value}/5
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button className="primary-button" disabled={Boolean(busy)}>
        提交并生成估时与知识地图
      </button>
    </form>
  );
}

function KnowledgePanel({
  nodes,
  reviews,
}: {
  nodes: Node[];
  reviews: Review[];
}) {
  const firstReady = nodes.find((item) => item.status !== "locked");
  return (
    <section className="learning-card">
      <div className="section-heading">
        <div>
          <span className="section-kicker">知识地图与前置依赖</span>
          <h3>掌握度来自证据，不来自点击</h3>
        </div>
        <Map size={20} />
      </div>
      {firstReady ? (
        <div className="next-reason">
          <strong>为什么下一步是“{firstReady.title}”？</strong>
          <p>
            它是当前依赖已满足且掌握证据最不足的第一个节点；后续节点依赖它，因此先验证这里能减少无效跳跃。
          </p>
        </div>
      ) : null}
      <div className="knowledge-path">
        {nodes.map((node, index) => {
          const review = reviews.find((item) => item.nodeId === node.id);
          return (
            <article key={node.id} className={node.status}>
              <i>{index + 1}</i>
              <div>
                <div>
                  <strong>{node.title}</strong>
                  <span>{statusLabels[node.status] || node.status}</span>
                </div>
                <p>{node.description}</p>
                <div className="mastery-bar">
                  <i
                    style={{
                      width: `${Math.round(Number(node.mastery) * 100)}%`,
                    }}
                  />
                  <span>
                    掌握 {Math.round(Number(node.mastery) * 100)}% · 证据{" "}
                    {node.evidenceCount} · 置信{" "}
                    {Math.round(Number(node.masteryConfidence) * 100)}%
                  </span>
                </div>
                {review ? (
                  <small>
                    下次复习：{new Date(review.dueAt).toLocaleString("zh-CN")}
                    （间隔 {review.intervalDays} 天）
                  </small>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SessionPanel({
  goalId,
  activeSession,
  sessions,
  nodes,
  busy,
  run,
}: {
  goalId: string;
  activeSession?: Session;
  sessions: Session[];
  nodes: Node[];
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}) {
  const [response, setResponse] = useState("");
  const [authorship, setAuthorship] = useState("user_independent");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [confidence, setConfidence] = useState(3);
  const startId = useRef(crypto.randomUUID());
  const answerId = useRef(crypto.randomUUID());
  const stageStarted = useRef<number | null>(null);
  const stage =
    activeSession?.activeStage ||
    activeSession?.stages?.[Number(activeSession?.currentStage || 0)];
  const node = nodes.find((item) => item.id === activeSession?.nodeId);
  if (!activeSession)
    return (
      <section className="learning-card session-start">
        <div>
          <span className="section-kicker">每日交互学习会话</span>
          <h3>21 个连续阶段，一次只推进一个关键点</h3>
          <p>
            回忆 → 前置检查 → 直觉 → 机制 → 定义 → 正反例 → 追问 → 复述 → 找漏洞
            → 重讲 → 基本题 → 纠错 → 迁移 → 实践 → 工程连接 → 掌握证据 →
            复习计划。
          </p>
        </div>
        <button
          className="primary-button"
          disabled={Boolean(busy) || !nodes.length}
          onClick={() =>
            void run("开始学习会话", async () => {
              await jsonRequest(
                `/api/learning/goals/${goalId}/sessions`,
                "POST",
                { clientRequestId: startId.current },
              );
              startId.current = crypto.randomUUID();
            })
          }
        >
          <Play size={15} />
          开始今日会话
        </button>
        <small>
          已完成 {sessions.filter((item) => item.status === "completed").length}{" "}
          次完整会话
        </small>
      </section>
    );
  const turn = activeSession.turns?.find(
    (item) => item.stageKey === stage?.key,
  );
  const total = activeSession.stages.length;
  const submit = () => {
    const payload = {
      clientRequestId: answerId.current,
      response,
      responseTimeSeconds: stageStarted.current
        ? Math.max(1, Math.round((Date.now() - stageStarted.current) / 1000))
        : 1,
      confidence,
      codeAuthorship: stage?.key === "micro_practice" ? authorship : undefined,
      artifactUrl: artifactUrl || undefined,
    };
    void run("提交学习证据", async () => {
      await jsonRequest(
        `/api/learning/sessions/${activeSession.id}`,
        "PATCH",
        payload,
      );
      answerId.current = crypto.randomUUID();
      stageStarted.current = null;
      setResponse("");
    });
  };
  return (
    <section className="learning-card active-session">
      <div className="session-heading">
        <div>
          <span className="section-kicker">{activeSession.title}</span>
          <h3>
            {Number(activeSession.currentStage) + 1}/{total} · {stage?.label}
          </h3>
        </div>
        <span>{node?.title}</span>
      </div>
      <div className="stage-track">
        {activeSession.stages.map((item, index) => (
          <i
            key={item.key}
            className={
              index < Number(activeSession.currentStage)
                ? "done"
                : index === Number(activeSession.currentStage)
                  ? "active"
                  : ""
            }
          />
        ))}
      </div>
      <div className="mentor-prompt">
        <Brain size={18} />
        <p>{stage?.prompt}</p>
      </div>
      {turn?.feedback ? (
        <div className="turn-feedback">
          <strong>上一轮反馈</strong>
          <p>{turn.feedback}</p>
        </div>
      ) : null}
      <textarea
        className="session-response"
        disabled={Boolean(busy)}
        value={response}
        onFocus={() => {
          stageStarted.current ??= Date.now();
        }}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="写下你的解释、推理、代码或实践证据……"
      />
      <div className="practice-proof">
        <label>
          作答自信度
          <select
            disabled={Boolean(busy)}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option value={value} key={value}>
                {value}/5
              </option>
            ))}
          </select>
        </label>
        {stage?.key === "micro_practice" ? (
          <>
            <label>
              代码来源
              <select
                disabled={Boolean(busy)}
                value={authorship}
                onChange={(e) => setAuthorship(e.target.value)}
              >
                <option value="ai_generated">AI 完全生成</option>
                <option value="user_modified">AI 辅助后理解并修改</option>
                <option value="user_independent">用户基本独立完成</option>
              </select>
            </label>
            <label>
              产物链接（可选）
              <input
                disabled={Boolean(busy)}
                type="url"
                value={artifactUrl}
                onChange={(e) => setArtifactUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
          </>
        ) : null}
      </div>
      <button
        className="primary-button"
        disabled={Boolean(busy) || !response.trim()}
        onClick={submit}
      >
        提交回答并识别漏洞
        <ChevronRight size={15} />
      </button>
    </section>
  );
}

function ReviewCenter({
  reviews,
  nodes,
  busy,
  run,
}: {
  reviews: Review[];
  nodes: Node[];
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}) {
  const due = reviews.filter((item) => item.isDue);
  const upcoming = reviews.filter((item) => !item.isDue);
  const mastered = nodes.filter((item) => item.status === "mastered");
  const nodeTitle = (nodeId: string) =>
    nodes.find((item) => item.id === nodeId)?.title || "知识节点";
  return (
    <section className="learning-card">
      <div className="section-heading">
        <div>
          <span className="section-kicker">间隔复习</span>
          <h3>到期后再写入延迟测试证据</h3>
        </div>
        <RefreshCw size={20} />
      </div>
      <div className="review-summary">
        <span>
          今天应复习 <b>{due.length}</b>
        </span>
        <span>
          即将到期 <b>{upcoming.length}</b>
        </span>
        <span>
          稳定掌握 <b>{mastered.length}</b>
        </span>
      </div>
      <div className="review-columns">
        <section>
          <strong>今天复习</strong>
          {due.length ? (
            due.map((item) => (
              <p key={item.id}>
                {nodeTitle(item.nodeId)}
                <small>已到期 · 间隔 {item.intervalDays} 天</small>
              </p>
            ))
          ) : (
            <p className="muted">当前没有到期项目</p>
          )}
        </section>
        <section>
          <strong>即将到期</strong>
          {upcoming.length ? (
            upcoming.slice(0, 6).map((item) => (
              <p key={item.id}>
                {nodeTitle(item.nodeId)}
                <small>{new Date(item.dueAt).toLocaleString("zh-CN")}</small>
              </p>
            ))
          ) : (
            <p className="muted">完成学习会话后自动安排</p>
          )}
        </section>
        <section>
          <strong>已稳定掌握</strong>
          {mastered.length ? (
            mastered.slice(0, 6).map((item) => (
              <p key={item.id}>
                {item.title}
                <small>
                  掌握 {Math.round(Number(item.mastery) * 100)}% ·{" "}
                  {item.evidenceCount} 条证据
                </small>
              </p>
            ))
          ) : (
            <p className="muted">仍需延迟与迁移证据</p>
          )}
        </section>
      </div>
      {due.map((review) => (
        <ReviewForm
          key={review.id}
          review={review}
          node={nodes.find((item) => item.id === review.nodeId)}
          busy={busy}
          run={run}
        />
      ))}
      {!due.length ? (
        <div className="learning-empty">
          <CheckCircle2 />
          <p>
            提前查看不会伪装成延迟测试；下一项：
            {upcoming[0]
              ? `${nodeTitle(upcoming[0].nodeId)}，${new Date(upcoming[0].dueAt).toLocaleString("zh-CN")}`
              : "完成一次学习会话后自动安排"}
            。
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ReviewForm({
  review,
  node,
  busy,
  run,
}: {
  review: Review;
  node?: Node;
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}) {
  const [response, setResponse] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [hintCount, setHintCount] = useState(0);
  const [independenceLevel, setIndependenceLevel] = useState(3);
  const [transferScore, setTransferScore] = useState(0.5);
  const [repeatedError, setRepeatedError] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const started = useRef<number | null>(null);
  return (
    <form
      className="review-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run("提交到期复习", async () => {
          await jsonRequest(`/api/learning/reviews/${review.id}`, "PATCH", {
            clientRequestId: requestId.current,
            response,
            confidence,
            hintCount,
            independenceLevel,
            transferScore,
            repeatedError,
            responseTimeSeconds: started.current
              ? Math.max(1, Math.round((Date.now() - started.current) / 1000))
              : 1,
          });
          requestId.current = crypto.randomUUID();
          started.current = null;
          setResponse("");
        });
      }}
    >
      <strong>{node?.title || "知识节点"}</strong>
      <p>不回看资料，重建因果链，给出一个边界或反例，再说明怎样验证。</p>
      <textarea
        required
        value={response}
        onFocus={() => {
          started.current ??= Date.now();
        }}
        onChange={(e) => setResponse(e.target.value)}
      />
      <select
        aria-label="复习作答自信度"
        value={confidence}
        onChange={(e) => setConfidence(Number(e.target.value))}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <option value={value} key={value}>
            自信度 {value}/5
          </option>
        ))}
      </select>
      <div className="review-signal-grid">
        <label>
          提示次数
          <input
            type="number"
            min={0}
            max={50}
            value={hintCount}
            onChange={(event) => setHintCount(Number(event.target.value))}
          />
        </label>
        <label>
          独立性
          <select
            value={independenceLevel}
            onChange={(event) => setIndependenceLevel(Number(event.target.value))}
          >
            {[0, 1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>独立性 {value}/4</option>
            ))}
          </select>
        </label>
        <label>
          迁移表现
          <select
            value={transferScore}
            onChange={(event) => setTransferScore(Number(event.target.value))}
          >
            <option value={0}>没有迁移</option>
            <option value={0.5}>部分迁移</option>
            <option value={0.8}>可迁移新场景</option>
            <option value={1}>独立迁移并验证</option>
          </select>
        </label>
        <label className="review-error-check">
          <input
            type="checkbox"
            checked={repeatedError}
            onChange={(event) => setRepeatedError(event.target.checked)}
          />
          本次重复出现同一错误
        </label>
      </div>
      <button disabled={Boolean(busy)}>完成复习并重新安排日期</button>
    </form>
  );
}

function OutcomePanel({
  goal,
  outcomes,
  busy,
  run,
}: {
  goal: Goal;
  outcomes: Outcome[];
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: goal.engineeringOutcome,
    artifactUrl: "",
    deploymentUrl: "",
    demoNotes: "",
    retrospective: "",
    codeAuthorship: "user_modified",
    status: "built",
  });
  const requestId = useRef(crypto.randomUUID());
  return (
    <section className="learning-card outcome-card">
      <div className="section-heading">
        <div>
          <span className="section-kicker">最终工程实践</span>
          <h3>部署、展示与复盘</h3>
        </div>
        <Code2 size={20} />
      </div>
      <p>
        成果会写入成长时间线并生成待你批准的画像候选，不会自动改写长期画像。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("记录工程成果", async () => {
            await jsonRequest(
              `/api/learning/goals/${goal.id}/outcome`,
              "POST",
              {
                ...form,
                artifactUrl: form.artifactUrl || null,
                deploymentUrl: form.deploymentUrl || null,
                clientRequestId: requestId.current,
              },
            );
            requestId.current = crypto.randomUUID();
          });
        }}
        className="learning-form-grid"
      >
        <label className="wide">
          成果名称
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          成果/仓库链接
          <input
            type="url"
            value={form.artifactUrl}
            onChange={(e) => setForm({ ...form, artifactUrl: e.target.value })}
          />
        </label>
        <label>
          部署/展示链接
          <input
            type="url"
            value={form.deploymentUrl}
            onChange={(e) =>
              setForm({ ...form, deploymentUrl: e.target.value })
            }
          />
        </label>
        <label>
          代码证据
          <select
            value={form.codeAuthorship}
            onChange={(e) =>
              setForm({ ...form, codeAuthorship: e.target.value })
            }
          >
            <option value="ai_generated">AI 完全生成</option>
            <option value="user_modified">理解并修改 AI 代码</option>
            <option value="user_independent">用户基本独立完成</option>
          </select>
        </label>
        <label>
          当前状态
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="built">已构建</option>
            <option value="deployed">已部署</option>
            <option value="presented">已展示</option>
            <option value="reviewed">已复盘完成</option>
          </select>
        </label>
        <label className="wide">
          演示、测试和验收证据
          <textarea
            required
            minLength={10}
            value={form.demoNotes}
            onChange={(e) => setForm({ ...form, demoNotes: e.target.value })}
          />
        </label>
        <label className="wide">
          复盘：做对、做错、下次改变
          <textarea
            required
            minLength={20}
            value={form.retrospective}
            onChange={(e) =>
              setForm({ ...form, retrospective: e.target.value })
            }
          />
        </label>
        <button className="primary-button" disabled={Boolean(busy)}>
          保存成果、写入时间线并生成画像候选
        </button>
      </form>
      {outcomes.map((item) => (
        <div className="outcome-proof" key={item.id}>
          <CheckCircle2 size={16} />
          <strong>{item.title}</strong>
          <span>
            {item.status} · {item.codeAuthorship}
          </span>
          {item.deploymentUrl ? (
            <a href={item.deploymentUrl} target="_blank" rel="noreferrer">
              打开展示
            </a>
          ) : null}
        </div>
      ))}
    </section>
  );
}
