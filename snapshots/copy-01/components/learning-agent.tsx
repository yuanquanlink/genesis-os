"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Play,
  ShieldCheck,
  Target,
} from "lucide-react";

type Goal = {
  id: string;
  title: string;
  targetAbility: string;
  currentLevel: number;
  targetLevelScore: number;
  motivation: string;
};

type Diagnosis = {
  id: string;
  goalId: string;
  currentLevel: number;
  strengths: string[];
  weaknesses: string[];
  learningFocus: string[];
  estimatedDays: number;
  estimatedMinutes: number;
  confidence: number;
  evidenceRefs: string[];
  limitations: string[];
  provider: string;
  modelMode: string;
};

type Curriculum = {
  id: string;
  goalId: string;
  phaseIndex: number;
  phaseKey: string;
  title: string;
  objective: string;
  knowledgePoints: string[];
  exercises: string[];
  project: string;
  acceptanceCriteria: string[];
  status: string;
};

type Mission = {
  id: string;
  goalId: string;
  missionDate: string;
  learningObjective: string;
  learningContent: string[];
  estimatedMinutes: number;
  practiceTask: string;
  acceptanceQuestions: string[];
  reflectionQuestion: string;
  confidence: number;
  sourceRefs: string[];
  status: string;
  provider: string;
  modelMode: string;
};

type Result = {
  id: string;
  goalId: string;
  missionId: string | null;
  completionStatus: string;
  assessmentScore: number;
  assessment: {
    understanding: number;
    practice: number;
    engineering: number;
    feedback: string;
    misconception: string | null;
    nextAction: string;
    limitations: string[];
  } | null;
  evidenceItemId: string | null;
  candidateId: string | null;
  createdAt: string;
};

export type LearningAgentSnapshot = {
  diagnoses: Diagnosis[];
  curricula: Curriculum[];
  missions: Mission[];
  results: Result[];
};

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { error?: string; issues?: Array<{ message: string }> };
  if (!response.ok)
    throw new Error(result.error || result.issues?.[0]?.message || "学习代理操作失败");
  return result;
}

export function LearningAgentPanel({
  goal,
  snapshot,
  baselineReady,
  busy,
  run,
}: {
  goal: Goal;
  snapshot: LearningAgentSnapshot;
  baselineReady: boolean;
  busy: string;
  run: (label: string, task: () => Promise<unknown>) => Promise<void>;
}) {
  const diagnosis = snapshot.diagnoses.find((item) => item.goalId === goal.id);
  const curriculum = snapshot.curricula.filter((item) => item.goalId === goal.id);
  const mission = snapshot.missions.find((item) => item.goalId === goal.id);
  const results = snapshot.results.filter((item) => item.goalId === goal.id);
  const [form, setForm] = useState({
    summary: "",
    practiceOutput: "",
    reflection: "",
    artifactUrl: "",
    completionStatus: "completed",
    confidence: 3,
  });
  const requestId = useRef(crypto.randomUUID());

  return (
    <section className="learning-agent-stack" aria-label="Genesis AI 学习代理">
      <div className="learning-card agent-overview">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Genesis AI 学习代理</span>
            <h2>从计划推进到可验证掌握</h2>
          </div>
          <BrainCircuit size={24} />
        </div>
        <div className="agent-goal-line">
          <div>
            <span>目标能力</span>
            <strong>{goal.targetAbility}</strong>
          </div>
          <div>
            <span>能力跨度</span>
            <strong>{goal.currentLevel}/5 → {goal.targetLevelScore}/5</strong>
          </div>
          <div>
            <span>证据规则</span>
            <strong>审批后才更新成长图谱</strong>
          </div>
        </div>
        {!diagnosis ? (
          <div className="agent-empty">
            <p>读取上下文、成长图谱和证据，先确认真实起点，再生成五阶段课程。</p>
            <button
              className="primary-button"
              disabled={Boolean(busy)}
              onClick={() => void run("生成 Agent 诊断与课程", () => post(`/api/learning-agent/goals/${goal.id}/plan`, {}))}
            >
              <Target size={16} />
              生成能力诊断与五阶段课程
            </button>
          </div>
        ) : null}
      </div>

      {diagnosis ? (
        <div className="learning-card agent-diagnosis">
          <div className="section-heading">
            <div>
              <span className="section-kicker">学习诊断</span>
              <h2>当前基线 {diagnosis.currentLevel}/5</h2>
            </div>
            <span className="agent-confidence">置信度 {Math.round(diagnosis.confidence * 100)}%</span>
          </div>
          <div className="agent-diagnosis-grid">
            <article>
              <strong>已有优势</strong>
              <ul>{diagnosis.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <strong>关键不足</strong>
              <ul>{diagnosis.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <strong>学习重点</strong>
              <ul>{diagnosis.learningFocus.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          </div>
          <div className="agent-evidence-line">
            <ShieldCheck size={15} />
            <span>{diagnosis.evidenceRefs.length} 个上下文 / 成长 / 证据引用 · 预计 {diagnosis.estimatedDays} 天 / {Math.round(diagnosis.estimatedMinutes / 60)} 小时 · {diagnosis.modelMode === "real" ? diagnosis.provider : "演示 AI"}</span>
          </div>
        </div>
      ) : null}

      {curriculum.length ? (
        <div className="learning-card agent-curriculum">
          <div className="section-heading">
            <div>
              <span className="section-kicker">课程引擎</span>
              <h2>五阶段掌握路线</h2>
            </div>
            <GraduationCap size={22} />
          </div>
          <div className="agent-phase-list">
            {curriculum.map((phase) => (
              <details key={phase.id} open={phase.status === "active"}>
                <summary>
                  <span>{phase.phaseIndex}</span>
                  <strong>{phase.title}</strong>
                  <small>{phase.status === "active" ? "当前阶段" : "后续阶段"}</small>
                </summary>
                <div>
                  <p>{phase.objective}</p>
                  <strong>知识点</strong>
                  <ul>{phase.knowledgePoints.map((item) => <li key={item}>{item}</li>)}</ul>
                  <strong>项目</strong>
                  <p>{phase.project}</p>
                  <strong>验收</strong>
                  <ul>{phase.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : null}

      {diagnosis && !mission ? (
        <div className="learning-card agent-empty mission-empty">
          <div>
            <span className="section-kicker">每日学习代理</span>
            <h2>把路线压缩成今天唯一的任务</h2>
            <p>同一目标同一天只会生成一条学习任务，重复请求不会创建重复记录。</p>
          </div>
          <button
            className="primary-button"
            disabled={Boolean(busy)}
            onClick={() => void run("生成今日学习任务", () => post(`/api/learning-agent/goals/${goal.id}/missions`, {}))}
          >
            <Play size={16} />
            生成今日任务
          </button>
        </div>
      ) : null}

      {mission ? (
        <div className="learning-card today-mission">
          <div className="section-heading">
            <div>
              <span className="section-kicker">今日学习任务 · {mission.missionDate}</span>
              <h2>{mission.learningObjective}</h2>
            </div>
            <span className={`mission-status ${mission.status}`}>{mission.status}</span>
          </div>
          <div className="mission-grid">
            <article>
              <span>学习内容</span>
              <ul>{mission.learningContent.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <span>实践任务 · {mission.estimatedMinutes} 分钟</span>
              <p>{mission.practiceTask}</p>
            </article>
            <article>
              <span>验收问题</span>
              <ol>{mission.acceptanceQuestions.map((item) => <li key={item}>{item}</li>)}</ol>
            </article>
            <article>
              <span>反思问题</span>
              <p>{mission.reflectionQuestion}</p>
            </article>
          </div>
          <div className="agent-tutor-entry">
            {baselineReady ? (
              <button
                className="secondary-button"
                disabled={Boolean(busy)}
                onClick={() => void run("启动 AI Tutor", () => post(`/api/learning-agent/goals/${goal.id}/tutor`, { clientRequestId: crypto.randomUUID(), missionId: mission.id }))}
              >
                <BrainCircuit size={16} />
                开始苏格拉底式 AI 导师
              </button>
            ) : (
              <Link className="secondary-button" href="/learning-resources">
                先完成资料基线，再进入 AI 导师
                <ArrowRight size={15} />
              </Link>
            )}
            <small>AI 导师先提问、检查理解并识别误区，不把直接答案当成掌握。</small>
          </div>
        </div>
      ) : null}

      {mission ? (
        <form
          className="learning-card agent-result-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run("保存学习结果并生成证据候选", async () => {
              await post(`/api/learning-agent/goals/${goal.id}/results`, {
                ...form,
                missionId: mission.id,
                artifactUrl: form.artifactUrl || null,
                clientRequestId: requestId.current,
              });
              requestId.current = crypto.randomUUID();
              setForm((value) => ({ ...value, summary: "", practiceOutput: "", reflection: "", artifactUrl: "" }));
            });
          }}
        >
          <div className="section-heading">
            <div>
              <span className="section-kicker">学习结果 → 证据</span>
              <h2>记录结果，不直接宣布学会</h2>
            </div>
            <ClipboardCheck size={22} />
          </div>
          <div className="learning-form-grid">
            <label className="wide">
              今日完成与理解
              <textarea required minLength={10} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
            </label>
            <label className="wide">
              实践产物、测试输出或失败路径
              <textarea required minLength={10} value={form.practiceOutput} onChange={(event) => setForm({ ...form, practiceOutput: event.target.value })} />
            </label>
            <label className="wide">
              复盘：误区与下一次改变
              <textarea required minLength={10} value={form.reflection} onChange={(event) => setForm({ ...form, reflection: event.target.value })} />
            </label>
            <label>
              产物地址（可选）
              <input type="url" value={form.artifactUrl} onChange={(event) => setForm({ ...form, artifactUrl: event.target.value })} />
            </label>
            <label>
              完成状态
              <select value={form.completionStatus} onChange={(event) => setForm({ ...form, completionStatus: event.target.value })}>
                <option value="completed">完成</option>
                <option value="partial">部分完成</option>
                <option value="blocked">遇到阻塞</option>
              </select>
            </label>
            <label>
              自评信心 1–5
              <input type="number" min={1} max={5} value={form.confidence} onChange={(event) => setForm({ ...form, confidence: Number(event.target.value) })} />
            </label>
          </div>
          <button className="primary-button" disabled={Boolean(busy)}>
            <CheckCircle2 size={16} />
            保存结果并交给证据引擎
          </button>
        </form>
      ) : null}

      {results.length ? (
        <div className="learning-card agent-results">
          <div className="section-heading">
            <div>
              <span className="section-kicker">评估引擎</span>
              <h2>学习结果与证据交接</h2>
            </div>
            <Link href="/evidence">审批证据候选 <ArrowRight size={14} /></Link>
          </div>
          <div className="agent-result-list">
            {results.map((result) => (
              <article key={result.id}>
                <div>
                  <strong>掌握评估 {Math.round(result.assessmentScore * 100)}%</strong>
                  <span>{result.evidenceItemId ? result.candidateId ? "待用户审批" : "待证据分析" : "待生成证据"}</span>
                </div>
                {result.assessment ? (
                  <>
                    <div className="result-scores">
                      <span>理解 <b>{result.assessment.understanding}</b></span>
                      <span>实践 <b>{result.assessment.practice}</b></span>
                      <span>工程 <b>{result.assessment.engineering}</b></span>
                    </div>
                    <p>{result.assessment.feedback}</p>
                    {result.assessment.misconception ? <blockquote>误区：{result.assessment.misconception}</blockquote> : null}
                    <small>下一步：{result.assessment.nextAction}</small>
                  </>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
