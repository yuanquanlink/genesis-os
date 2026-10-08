"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileArchive,
  FileCode2,
  GitBranch,
  Play,
  ShieldCheck,
  SquareTerminal,
  Upload,
  XCircle,
} from "lucide-react";

type Criterion = {
  key: string;
  label: string;
  status: "pass" | "partial" | "fail";
  evidence: string[];
};

type Verification = {
  id: string;
  status: "pass" | "partial" | "fail" | "blocked" | "timeout";
  isolationLevel: "local_dev_restricted";
  criteria: Criterion[];
  failedCriteria: string[];
  testResults: { status?: string; stdout?: string; stderr?: string };
  aiReview: {
    summary?: string;
    score?: number;
    confidence?: number;
    strengths?: string[];
    weaknesses?: string[];
    limitations?: string[];
  };
  improvementPlan: string[];
  durationMs: number;
  peakMemoryBytes: number | null;
  createdAt: string;
};

type Defense = {
  id: string;
  status: "pending" | "answered" | "evaluated";
  questions: Array<{
    key: string;
    question: string;
    focus: string;
    expectedSignals: string[];
  }>;
  answers: Array<{
    questionKey: string;
    userAnswer: string;
    score: number;
    aiFeedback: string;
    misconception: string | null;
  }>;
  overallScore: number | null;
  designExplanationScore: number | null;
  confidence: number | null;
};

type Submission = {
  id: string;
  sourceType: "zip" | "local_path" | "git_url" | "github_url";
  originalName: string;
  sourceUrl: string | null;
  revisionNumber: number;
  aiAssistanceCount: number;
  userModificationCount: number;
  selfReportedIndependence: number;
  status: string;
  createdAt: string;
  analysis: null | {
    primaryLanguage: string;
    fileCount: number;
    totalBytes: number;
    structure: string[];
    manifests: string[];
    readme: {
      present?: boolean;
      hasRunSteps?: boolean;
      hasOpenApi?: boolean;
      hasReflection?: boolean;
    };
    tests: { files?: string[]; hasUnit?: boolean; hasIntegration?: boolean };
    migrations: string[];
    apiRoutes: Array<{ method: string; route: string; file: string }>;
    securityFindings: Array<{
      file: string;
      line: number;
      code: string;
      message: string;
      severity: string;
    }>;
    analysisScore: number;
  };
  verifications: Verification[];
  defense: Defense | null;
  independence: null | { independenceScore: number; rationaleJson?: string };
  result: null | {
    status: "pass" | "partial" | "fail";
    machineScore: number;
    codeReviewScore: number;
    defenseScore: number;
    independenceScore: number;
    achievedAbilities: string[];
    superficialAbilities: string[];
    remediation: string[];
    nextChallenge: string[];
    evidenceItemId: string | null;
    candidateId: string | null;
    candidateStatus: "pending" | "approved" | "rejected" | null;
    candidateProposedLevel: number | null;
    previousAbilityLevel: number;
    maxApprovableLevel: number;
    abilityChange: null | {
      previousLevel: number;
      approvedLevel: number;
      reason: string;
      approvedAt: string;
    };
  };
};

type Challenge = {
  id: string;
  goalId: string;
  challengeTitle: string;
  targetAbilities: string[];
  requirements: string[];
  acceptanceCriteria: string[];
  difficulty: number;
  deadline: string | null;
  maxAiAssistance: number;
  requiredTests: string[];
  requiredDocs: string[];
  deploymentRequirement: string;
  allowNetwork: boolean;
  status: string;
  submissions: Submission[];
};

export type ProjectChallengeSnapshot = {
  challenges: Challenge[];
  runner: {
    kind: "restricted_local";
    isolationLevel: "local_dev_restricted";
    productionSafe: false;
    networkDefault: "blocked_best_effort";
    limits: { timeoutMs: number; memoryMb: number; outputKb: number };
  };
};

type Goal = {
  id: string;
  title: string;
  targetAbility: string;
  engineeringOutcome: string;
};

const fastApiRequirements = [
  "至少 4 个真实 API endpoint",
  "Pydantic 请求/响应模型",
  "参数校验",
  "SQLite/PostgreSQL 数据库",
  "结构化异常处理",
  "至少一项身份认证",
  "单元测试",
  "集成测试",
  "OpenAPI 文档",
  "README 与运行步骤",
  "可本地运行",
  "至少一个真实 AI Provider 适配器并在测试中隔离外部调用",
  "项目复盘",
];

async function responseJson<T>(response: Response) {
  const data = (await response.json()) as T & {
    error?: string;
    issues?: Array<{ message: string }>;
  };
  if (!response.ok)
    throw new Error(
      data.error || data.issues?.[0]?.message || "工程挑战操作失败",
    );
  return data;
}

const percent = (value: number | null | undefined) =>
  `${Math.round(Number(value || 0) * 100)}%`;
const statusText = (value: string) =>
  ({
    pass: "通过",
    partial: "部分通过",
    fail: "未通过",
    blocked: "已阻塞",
    timeout: "已超时",
    pending: "待处理",
    answered: "已作答",
    evaluated: "已评估",
    approved: "已批准",
    rejected: "已拒绝",
  })[value] || value;
const dateText = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未设置";

export function ProjectChallengePanel({
  goal,
  initialSnapshot,
}: {
  goal: Goal;
  initialSnapshot: ProjectChallengeSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedId, setSelectedId] = useState(
    initialSnapshot.challenges.find((item) => item.goalId === goal.id)?.id ||
      "",
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const requestIds = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/project-challenges?goalId=${encodeURIComponent(goal.id)}`,
      { cache: "no-store" },
    );
    const data = await responseJson<ProjectChallengeSnapshot>(response);
    setSnapshot(data);
    setSelectedId((current) =>
      data.challenges.some((item) => item.id === current)
        ? current
        : data.challenges[0]?.id || "",
    );
  }, [goal.id]);

  const run = async (
    key: string,
    action: (clientRequestId: string) => Promise<void>,
  ) => {
    if (busy) return;
    setBusy(key);
    setMessage("");
    const clientRequestId = requestIds.current[key] || crypto.randomUUID();
    requestIds.current[key] = clientRequestId;
    try {
      await action(clientRequestId);
      delete requestIds.current[key];
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "工程挑战操作失败");
    } finally {
      setBusy("");
    }
  };

  const challenges = useMemo(
    () => snapshot.challenges.filter((item) => item.goalId === goal.id),
    [snapshot.challenges, goal.id],
  );
  const challenge =
    challenges.find((item) => item.id === selectedId) || challenges[0];

  return (
    <div className="project-challenge-root" data-testid="project-challenge">
      {message ? (
        <div
          className={
            /失败|拒绝|无效|不在|缺少/.test(message)
              ? "error-banner"
              : "learning-success"
          }
          role="status"
        >
          {message}
        </div>
      ) : null}
      <section className="learning-card runner-boundary">
        <div className="section-heading">
          <div>
            <span className="section-kicker">
              安全代码执行 · 明确安全边界
            </span>
            <h2>受限本地执行器</h2>
          </div>
          <ShieldCheck size={24} />
        </div>
        <p>
          用户代码只在独立临时副本和子进程中执行；默认阻断网络，净化环境变量，限制时间、内存与输出，超时强制终止进程树。
        </p>
        <div className="runner-metrics">
          <span>
            <b>{snapshot.runner.limits.timeoutMs / 1000}s</b> 默认超时
          </span>
          <span>
            <b>{snapshot.runner.limits.memoryMb}MB</b> 内存监测
          </span>
          <span>
            <b>{snapshot.runner.limits.outputKb}KB</b> 输出上限
          </span>
          <span>
            <b>尽力隔离</b> 网络阻断
          </span>
        </div>
        <div className="runner-warning">
          <AlertTriangle size={16} />
          <span>
            仅本地单用户开发使用，不是生产级容器沙箱；Windows
            当前没有内核级网络隔离、受限用户令牌或作业对象强制内存上限。
          </span>
        </div>
      </section>

      <ChallengeCreator
        goal={goal}
        busy={busy}
        run={run}
        onMessage={setMessage}
      />

      {challenges.length ? (
        <section className="learning-card challenge-workspace">
          <div className="section-heading">
            <div>
              <span className="section-kicker">挑战工作区</span>
              <h2>正式工程挑战</h2>
            </div>
            <select
              aria-label="选择工程挑战"
              value={challenge?.id || ""}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {challenges.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.challengeTitle}
                </option>
              ))}
            </select>
          </div>
          {challenge ? (
            <ChallengeDetail
              challenge={challenge}
              busy={busy}
              run={run}
              setMessage={setMessage}
            />
          ) : null}
        </section>
      ) : (
        <section className="learning-card challenge-empty">
          <SquareTerminal size={26} />
          <div>
            <h2>还没有正式工程挑战</h2>
            <p>
              创建 Challenge 后再提交 ZIP 或白名单内本地路径。远程 Git
              地址只安全保存，不会自动 clone 或执行。
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function ChallengeCreator({
  goal,
  busy,
  run,
  onMessage,
}: {
  goal: Goal;
  busy: string;
  run: (key: string, action: (id: string) => Promise<void>) => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const [title, setTitle] = useState(`${goal.title} · 正式工程挑战`);
  const [abilities, setAbilities] = useState(
    `${goal.targetAbility || goal.title}, API 设计, 测试工程`,
  );
  const [difficulty, setDifficulty] = useState(4);
  const [deadline, setDeadline] = useState("");
  const [maxAi, setMaxAi] = useState(3);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void run("create-challenge", async (clientRequestId) => {
      const response = await fetch(`/api/project-challenges/goals/${goal.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": clientRequestId,
        },
        body: JSON.stringify({
          clientRequestId,
          challengeTitle: title,
          targetAbilities: abilities
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean),
          requirements: fastApiRequirements,
          acceptanceCriteria: fastApiRequirements,
          difficulty,
          deadline: deadline
            ? new Date(`${deadline}T23:59:59`).toISOString()
            : null,
          maxAiAssistance: maxAi,
          requiredTests: [
            "单元测试",
            "API 集成测试",
            "参数失败测试",
            "持久化测试",
          ],
          requiredDocs: ["README", "OpenAPI", "项目复盘"],
          deploymentRequirement:
            goal.engineeringOutcome || "Dockerfile 与本地运行步骤",
          allowNetwork: false,
        }),
      });
      const result = await responseJson<{ duplicate?: boolean }>(response);
      onMessage(
        result.duplicate
          ? "检测到重复创建请求，已返回原工程挑战。"
          : "工程挑战已创建，验收标准已固化。 ",
      );
    });
  };

  return (
    <details className="learning-card challenge-creator">
      <summary>
        <span>
          <b>创建工程挑战</b>
          <small>固定验收标准、AI 协助上限与交付边界</small>
        </span>
        <ChevronRight size={17} />
      </summary>
      <form onSubmit={submit}>
        <label>
          Challenge 标题
          <input
            aria-label="项目挑战标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={5}
            maxLength={180}
            required
          />
        </label>
        <label>
          目标能力
          <input
            aria-label="项目挑战目标能力"
            value={abilities}
            onChange={(event) => setAbilities(event.target.value)}
            required
          />
        </label>
        <div className="challenge-form-grid">
          <label>
            难度（1–5）
            <input
              aria-label="项目挑战难度"
              type="number"
              min="1"
              max="5"
              value={difficulty}
              onChange={(event) => setDifficulty(Number(event.target.value))}
            />
          </label>
          <label>
            截止日期
            <input
              aria-label="项目挑战截止日期"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </label>
          <label>
            最多 AI 提示次数
            <input
              aria-label="项目挑战 AI 协助上限"
              type="number"
              min="0"
              max="100"
              value={maxAi}
              onChange={(event) => setMaxAi(Number(event.target.value))}
            />
          </label>
        </div>
        <p className="muted">
          网络策略固定为禁止；需要外网依赖的挑战应在未来生产容器 Runner
          中使用显式域名白名单。
        </p>
        <button
          className="primary-button"
          disabled={busy === "create-challenge" || title.trim().length < 5}
        >
          {busy === "create-challenge" ? "正在创建…" : "创建正式工程挑战"}
          <ChevronRight size={15} />
        </button>
      </form>
    </details>
  );
}

function ChallengeDetail({
  challenge,
  busy,
  run,
  setMessage,
}: {
  challenge: Challenge;
  busy: string;
  run: (key: string, action: (id: string) => Promise<void>) => Promise<void>;
  setMessage: (value: string) => void;
}) {
  return (
    <div className="challenge-detail">
      <header>
        <div>
          <span className={`challenge-status ${challenge.status}`}>
            {challenge.status}
          </span>
          <h3>{challenge.challengeTitle}</h3>
          <p>
            难度 {challenge.difficulty}/5 · AI 协助上限{" "}
            {challenge.maxAiAssistance} 次 · 截止 {dateText(challenge.deadline)}
          </p>
        </div>
        <div className="ability-tags">
          {challenge.targetAbilities.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </header>
      <details className="criteria-disclosure">
        <summary>
          查看 {challenge.acceptanceCriteria.length} 条机器与人工验收标准
        </summary>
        <ol>
          {challenge.acceptanceCriteria.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </details>
      <SubmissionForm
        challengeId={challenge.id}
        busy={busy}
        run={run}
        setMessage={setMessage}
      />
      <div className="submission-list">
        {challenge.submissions.map((submission) => (
          <SubmissionCard
            key={submission.id}
            challenge={challenge}
            submission={submission}
            busy={busy}
            run={run}
            setMessage={setMessage}
          />
        ))}
        {!challenge.submissions.length ? (
          <p className="muted">
            尚无提交。ZIP 和白名单本地路径可进入分析与 Runner；Git URL
            当前只记录来源。
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SubmissionForm({
  challengeId,
  busy,
  run,
  setMessage,
}: {
  challengeId: string;
  busy: string;
  run: (key: string, action: (id: string) => Promise<void>) => Promise<void>;
  setMessage: (value: string) => void;
}) {
  const [sourceType, setSourceType] = useState<
    "zip" | "local_path" | "git_url" | "github_url"
  >("zip");
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [aiCount, setAiCount] = useState(0);
  const [modificationCount, setModificationCount] = useState(1);
  const [independence, setIndependence] = useState(3);
  const key = `submit:${challengeId}`;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(key, async (clientRequestId) => {
      let response: Response;
      if (sourceType === "zip") {
        if (!file) throw new Error("请选择 ZIP 项目文件");
        const form = new FormData();
        form.set("clientRequestId", clientRequestId);
        form.set("aiAssistanceCount", String(aiCount));
        form.set("userModificationCount", String(modificationCount));
        form.set("selfReportedIndependence", String(independence));
        form.set("file", file);
        response = await fetch(
          `/api/project-challenges/${challengeId}/submissions`,
          {
            method: "POST",
            headers: { "Idempotency-Key": clientRequestId },
            body: form,
          },
        );
      } else {
        response = await fetch(
          `/api/project-challenges/${challengeId}/submissions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": clientRequestId,
            },
            body: JSON.stringify({
              clientRequestId,
              sourceType,
              localPath: sourceType === "local_path" ? source : null,
              sourceUrl: sourceType === "local_path" ? null : source,
              aiAssistanceCount: aiCount,
              userModificationCount: modificationCount,
              selfReportedIndependence: independence,
            }),
          },
        );
      }
      const result = await responseJson<{
        duplicate?: boolean;
        duplicateReason?: string;
      }>(response);
      setMessage(
        result.duplicate
          ? `重复提交未新增记录${result.duplicateReason ? `：${result.duplicateReason}` : ""}`
          : sourceType.includes("url")
            ? "仓库地址已安全记录；提交 ZIP 或白名单本地路径后才能执行。"
            : "项目已导入并完成静态仓库分析。 ",
      );
    });
  };

  return (
    <form className="submission-form" onSubmit={submit}>
      <div className="section-heading">
        <div>
          <span className="section-kicker">仓库提交</span>
          <h3>提交项目</h3>
        </div>
        <Upload size={20} />
      </div>
      <div className="source-tabs" role="group" aria-label="项目提交方式">
        {(["zip", "local_path", "git_url", "github_url"] as const).map(
          (type) => (
            <button
              type="button"
              key={type}
              className={sourceType === type ? "active" : ""}
              onClick={() => setSourceType(type)}
            >
              {type === "zip"
                ? "ZIP"
                : type === "local_path"
                  ? "本地路径"
                  : type === "git_url"
                    ? "Git URL"
                    : "GitHub"}
            </button>
          ),
        )}
      </div>
      {sourceType === "zip" ? (
        <label className="file-drop">
          <FileArchive size={20} />
          <span>{file?.name || "选择不超过 20MB 的 ZIP 项目"}</span>
          <input
            aria-label="ZIP 项目文件"
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            required
          />
        </label>
      ) : (
        <label>
          {sourceType === "local_path" ? "服务端白名单内绝对路径" : "仓库地址"}
          <input
            aria-label="项目来源"
            type={sourceType === "local_path" ? "text" : "url"}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder={
              sourceType === "local_path"
                ? "例如 C:\\projects\\fastapi-service"
                : "https://github.com/owner/repository"
            }
            required
          />
        </label>
      )}
      <div className="submission-meta-grid">
        <label>
          AI 提示次数
          <input
            aria-label="AI 提示次数"
            type="number"
            min="0"
            max="1000"
            value={aiCount}
            onChange={(event) => setAiCount(Number(event.target.value))}
          />
        </label>
        <label>
          用户修改次数
          <input
            aria-label="用户修改次数"
            type="number"
            min="0"
            max="10000"
            value={modificationCount}
            onChange={(event) =>
              setModificationCount(Number(event.target.value))
            }
          />
        </label>
        <label>
          自评独立性
          <select
            aria-label="自评独立性"
            value={independence}
            onChange={(event) => setIndependence(Number(event.target.value))}
          >
            {[0, 1, 2, 3, 4].map((item) => (
              <option key={item} value={item}>
                {item}/4
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="primary-button" disabled={busy === key}>
        {busy === key ? "正在导入与分析…" : "提交项目并分析"}
        <ChevronRight size={15} />
      </button>
    </form>
  );
}

function SubmissionCard({
  challenge,
  submission,
  busy,
  run,
  setMessage,
}: {
  challenge: Challenge;
  submission: Submission;
  busy: string;
  run: (key: string, action: (id: string) => Promise<void>) => Promise<void>;
  setMessage: (value: string) => void;
}) {
  const latest = submission.verifications[0];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [approvedLevel, setApprovedLevel] = useState(2);
  const [nextImprovement, setNextImprovement] = useState(
    "进入更高难度、带并发、监控和真实部署的工程挑战",
  );
  const verifyKey = `verify:${submission.id}`;
  const defenseKey = `defense:${submission.id}`;
  const answerKey = `answer:${submission.defense?.id || submission.id}`;
  const maxApprovableLevel = submission.result?.maxApprovableLevel ?? 5;
  const effectiveApprovedLevel = Math.min(approvedLevel, maxApprovableLevel);

  const post = (key: string, url: string, label: string) =>
    void run(key, async (clientRequestId) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": clientRequestId,
        },
        body: JSON.stringify({ clientRequestId }),
      });
      await responseJson(response);
      setMessage(label);
    });

  const submitDefense = () => {
    if (!submission.defense) return;
    void run(answerKey, async (clientRequestId) => {
      const response = await fetch(
        `/api/project-challenges/defenses/${submission.defense!.id}/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": clientRequestId,
          },
          body: JSON.stringify({
            clientRequestId,
            answers: submission.defense!.questions.map((question) => ({
              questionKey: question.key,
              answer: answers[question.key] || "",
              answerDurationSeconds: 90,
              confidence: 4,
            })),
          }),
        },
      );
      await responseJson(response);
      setMessage(
        "答辩已评估，独立性评分与能力证据待确认建议已生成；正式能力仍未自动修改。 ",
      );
    });
  };

  const decide = (action: "approve" | "reject") => {
    const candidateId = submission.result?.candidateId;
    if (!candidateId) return;
    const key = `candidate:${candidateId}:${action}`;
    void run(key, async () => {
      const response = await fetch(
        `/api/growth-graph/candidates/${candidateId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "approve"
              ? {
                  action,
                  name: challenge.targetAbilities[0],
                  currentLevel: effectiveApprovedLevel,
                  nextImprovement,
                }
              : { action },
          ),
        },
      );
      await responseJson(response);
      setMessage(
        action === "approve"
          ? "能力证据待确认建议已批准，成长图谱与能力快照已更新。"
          : "能力证据待确认建议已拒绝，正式能力未修改。",
      );
    });
  };

  return (
    <article className="submission-card">
      <header>
        <div>
          <span>
            Revision {submission.revisionNumber} · {submission.sourceType}
          </span>
          <h4>{submission.originalName}</h4>
          <small>
            {dateText(submission.createdAt)} · AI {submission.aiAssistanceCount}{" "}
            次 · 修改 {submission.userModificationCount} 次 · 自评独立性{" "}
            {submission.selfReportedIndependence}/4
          </small>
        </div>
        <FileCode2 size={21} />
      </header>
      {submission.analysis ? (
        <RepositoryAnalysis analysis={submission.analysis} />
      ) : (
        <div className="remote-only">
          <GitBranch size={16} />
          <span>
            远程仓库地址已保存，但服务端未
            clone、未读取认证信息，也未执行代码。请改用 ZIP
            或允许目录内的本地路径。
          </span>
        </div>
      )}

      {submission.analysis ? (
        <div className="challenge-actions">
          <button
            className="primary-button"
            disabled={busy === verifyKey}
            onClick={() =>
              post(
                verifyKey,
                `/api/project-challenges/submissions/${submission.id}/verify`,
                "机器验收与 AI 代码审查已保存。",
              )
            }
          >
            {busy === verifyKey ? "受限执行中…" : "运行安全验收"}
            <Play size={14} />
          </button>
          {latest ? (
            <span className={`verdict ${latest.status}`}>
              {latest.status.toUpperCase()}
            </span>
          ) : null}
        </div>
      ) : null}

      {latest ? <VerificationResult verification={latest} /> : null}

      {latest &&
      ["pass", "partial"].includes(latest.status) &&
      !submission.defense ? (
        <button
          className="secondary-button"
          disabled={busy === defenseKey}
          onClick={() =>
            post(
              defenseKey,
              `/api/project-challenges/submissions/${submission.id}/defense`,
              "答辩模式已生成 6 道随机工程追问。",
            )
          }
        >
          {busy === defenseKey ? "正在生成答辩…" : "进入答辩模式"}
          <ChevronRight size={14} />
        </button>
      ) : null}

      {submission.defense ? (
        <div className="defense-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">答辩模式</span>
              <h4>工程口头答辩</h4>
            </div>
            <span className={`verdict ${submission.defense.status}`}>
              {statusText(submission.defense.status)}
            </span>
          </div>
          {submission.defense.status === "pending" ? (
            <>
              {submission.defense.questions.map((question, index) => (
                <label key={question.key}>
                  <span>
                    {index + 1}. {question.question}
                  </span>
                  <small>关注：{question.focus}</small>
                  <textarea
                    aria-label={`答辩问题 ${index + 1}`}
                    minLength={10}
                    value={answers[question.key] || ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <button
                className="primary-button"
                disabled={
                  busy === answerKey ||
                  submission.defense.questions.some(
                    (item) => (answers[item.key] || "").trim().length < 10,
                  )
                }
                onClick={submitDefense}
              >
                {busy === answerKey ? "正在评估答辩…" : "提交答辩并计算独立性"}
              </button>
            </>
          ) : (
            <DefenseResult defense={submission.defense} />
          )}
        </div>
      ) : null}

      {submission.result ? (
        <div className="challenge-final">
          <div className="final-score-row">
            <span className={`verdict ${submission.result.status}`}>
              {statusText(submission.result.status)}
            </span>
            <b>机器 {percent(submission.result.machineScore)}</b>
            <b>审查 {percent(submission.result.codeReviewScore)}</b>
            <b>答辩 {percent(submission.result.defenseScore)}</b>
            <b>独立性 {percent(submission.result.independenceScore)}</b>
          </div>
          {submission.result.candidateStatus === "pending" ? (
            <div className="candidate-approval">
              <h4>能力证据待确认建议等待用户批准</h4>
              <p>
                批准前成长图谱不会改变。候选建议{" "}
                {submission.result.candidateProposedLevel ?? "—"}
                /5；当前正式等级 {submission.result.previousAbilityLevel}
                /5。证据审批单次最多提升 1 级，本次上限{" "}
                {maxApprovableLevel}/5。
              </p>
              <div>
                <label>
                  批准等级
                  <select
                    aria-label="批准能力等级"
                    value={effectiveApprovedLevel}
                    onChange={(event) =>
                      setApprovedLevel(Number(event.target.value))
                    }
                  >
                    {Array.from(
                      { length: maxApprovableLevel + 1 },
                      (_, item) => (
                        <option key={item} value={item}>
                          {item}/5
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  下一步提升
                  <input
                    aria-label="下一步提升"
                    value={nextImprovement}
                    onChange={(event) => setNextImprovement(event.target.value)}
                  />
                </label>
              </div>
              <div className="candidate-actions">
                <button
                  className="primary-button"
                  disabled={busy.startsWith("candidate:")}
                  onClick={() => decide("approve")}
                >
                  批准并更新成长图谱
                  <CheckCircle2 size={14} />
                </button>
                <button
                  className="danger-button"
                  disabled={busy.startsWith("candidate:")}
                  onClick={() => decide("reject")}
                >
                  拒绝
                  <XCircle size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="candidate-state">
              <CheckCircle2 size={17} />
              <span>
                {submission.result.candidateStatus === "approved"
                  ? "能力证据已批准，能力快照已持久化"
                  : submission.result.candidateStatus === "rejected"
                    ? "能力证据已拒绝，正式能力未修改"
                    : "能力证据正在等待分析"}
              </span>
            </div>
          )}
          {submission.result.abilityChange ? (
            <div className="ability-change">
              <span>
                过去 <b>{submission.result.abilityChange.previousLevel}/5</b>
              </span>
              <ChevronRight size={15} />
              <span>
                现在 <b>{submission.result.abilityChange.approvedLevel}/5</b>
              </span>
              <p>{submission.result.abilityChange.reason}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function RepositoryAnalysis({
  analysis,
}: {
  analysis: NonNullable<Submission["analysis"]>;
}) {
  return (
    <div className="repository-analysis">
      <div className="analysis-metrics">
        <span>
          <b>{analysis.fileCount}</b> 文件
        </span>
        <span>
          <b>{analysis.apiRoutes.length}</b> API 路由
        </span>
        <span>
          <b>{analysis.tests.files?.length || 0}</b> 测试文件
        </span>
        <span>
          <b>{analysis.migrations.length}</b> 迁移
        </span>
        <span>
          <b>{percent(analysis.analysisScore)}</b> 静态完整度
        </span>
      </div>
      <details>
        <summary>查看仓库结构、路由与安全发现</summary>
        <div className="analysis-details">
          <section>
            <strong>路由</strong>
            {analysis.apiRoutes.map((route) => (
              <code key={`${route.method}:${route.route}`}>
                {route.method} {route.route}
              </code>
            ))}
          </section>
          <section>
            <strong>清单</strong>
            {analysis.manifests.map((item) => (
              <code key={item}>{item}</code>
            ))}
          </section>
          <section>
            <strong>安全扫描</strong>
            {analysis.securityFindings.length ? (
              analysis.securityFindings.map((item) => (
                <code
                  key={`${item.file}:${item.line}:${item.code}`}
                  className={item.severity}
                >
                  {item.file}:{item.line} {item.code}
                </code>
              ))
            ) : (
              <code>未发现高危静态模式</code>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}

function VerificationResult({ verification }: { verification: Verification }) {
  return (
    <div className="verification-result">
      <div className="verification-summary">
        <SquareTerminal size={18} />
        <div>
          <strong>
            机器验证 · {statusText(verification.status)}
          </strong>
          <span>
            {verification.isolationLevel} · {verification.durationMs}ms ·
            峰值内存{" "}
            {verification.peakMemoryBytes
              ? `${Math.round(verification.peakMemoryBytes / 1024 / 1024)}MB`
              : "未取得"}
          </span>
        </div>
      </div>
      <div className="criteria-grid">
        {verification.criteria.map((item) => (
          <details key={item.key} className={item.status}>
            <summary>
              {item.status === "pass" ? (
                <CheckCircle2 size={14} />
              ) : item.status === "partial" ? (
                <AlertTriangle size={14} />
              ) : (
                <XCircle size={14} />
              )}
              <span>{item.label}</span>
              <b>{statusText(item.status)}</b>
            </summary>
            {item.evidence.map((entry) => (
              <p key={entry}>{entry}</p>
            ))}
          </details>
        ))}
      </div>
      <details className="ai-review">
        <summary>AI 代码审查与改进计划</summary>
        <p>{verification.aiReview.summary || "审查摘要未返回"}</p>
        {verification.aiReview.strengths?.length ? (
          <>
            <strong>已验证优点</strong>
            <ul>
              {verification.aiReview.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}
        {verification.improvementPlan.length ? (
          <>
            <strong>改进计划</strong>
            <ol>
              {verification.improvementPlan.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </>
        ) : null}
      </details>
      <details className="runner-output">
        <summary>测试 stdout / stderr</summary>
        <pre>{verification.testResults.stdout || "(stdout 为空)"}</pre>
        {verification.testResults.stderr ? (
          <pre className="stderr">{verification.testResults.stderr}</pre>
        ) : null}
      </details>
    </div>
  );
}

function DefenseResult({ defense }: { defense: Defense }) {
  return (
    <div className="defense-result">
      <div className="defense-scores">
        <span>
          总分 <b>{percent(defense.overallScore)}</b>
        </span>
        <span>
          设计解释 <b>{percent(defense.designExplanationScore)}</b>
        </span>
        <span>
          置信度 <b>{percent(defense.confidence)}</b>
        </span>
      </div>
      {defense.answers.map((answer, index) => (
        <details key={answer.questionKey}>
          <summary>
            第 {index + 1} 题 · {percent(answer.score)}
          </summary>
          <blockquote>{answer.userAnswer}</blockquote>
          <p>{answer.aiFeedback}</p>
          {answer.misconception ? (
            <small>误区：{answer.misconception}</small>
          ) : null}
        </details>
      ))}
    </div>
  );
}
