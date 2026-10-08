"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  Brain,
  CheckCircle2,
  Compass,
  FileCheck2,
  Home,
  Network,
  PenLine,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
} from "lucide-react";
import type {
  CognitionContent,
  CognitionItemRecord,
  CognitionModuleId,
  CognitionReflectionRecord,
  CognitionSnapshot,
} from "@/lib/domain/cognition";

const modules: Array<{ id: CognitionModuleId; label: string; short: string }> =
  [
    { id: "thinking_model", label: "每日世界模型", short: "世界模型" },
    {
      id: "book_intelligence",
      label: "每日阅读智能",
      short: "阅读智能",
    },
    {
      id: "business_learning",
      label: "商业继承人训练",
      short: "商业训练",
    },
    { id: "movie_reflection", label: "电影思考", short: "电影反思" },
  ];

const nav = [
  ["/", "今日", Home],
  ["/learning", "深度学习", BookOpen],
  ["/self-input", "自我输入", PenLine],
  ["/digital-life", "数字分身", Brain],
  ["/growth-graph", "成长图谱", Network],
  ["/evidence", "能力证据", FileCheck2],
  ["/project-challenge", "工程挑战", SquareTerminal],
  ["/cognition", "认知成长", Compass],
  ["/timeline", "成长时间线", Activity],
  ["/settings", "设置", Settings],
] as const;

function requestId() {
  return crypto.randomUUID();
}

async function postCognition(body: unknown) {
  const response = await fetch("/api/cognition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as {
    error?: string;
    issues?: Array<{ message: string }>;
  };
  if (!response.ok)
    throw new Error(
      result.error || result.issues?.[0]?.message || "认知成长操作失败",
    );
  return result as {
    item?: CognitionItemRecord;
    reflection?: CognitionReflectionRecord;
    snapshot: CognitionSnapshot;
    duplicate?: boolean;
  };
}

function date(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ContentDetails({ content }: { content: CognitionContent }) {
  return (
    <>
      <div className="cognition-content-grid">
        <article>
          <span>为什么现在推荐</span>
          <p>{content.whyNow}</p>
        </article>
        <article>
          <span>核心机制</span>
          <p>{content.coreMechanism}</p>
        </article>
        <article>
          <span>直观例子</span>
          <p>{content.intuitiveExample}</p>
        </article>
        <article>
          <span>反例与边界</span>
          <p>{content.boundary}</p>
        </article>
        <article>
          <span>与当前状态关系</span>
          <p>{content.contextConnection}</p>
        </article>
        <article>
          <span>实际应用</span>
          <p>{content.practicalApplication}</p>
        </article>
      </div>
      <div className="cognition-module-detail">
        {content.moduleId === "thinking_model" ? (
          <>
            <strong>{content.details.modelName}</strong>
            <p>{content.details.problemSolved}</p>
            <p>今日问题：{content.details.todayQuestion}</p>
          </>
        ) : null}
        {content.moduleId === "book_intelligence" ? (
          <>
            <strong>
              {content.details.workTitle} · {content.details.author}
            </strong>
            <p>推荐主题：{content.details.recommendedSection}</p>
            <ul>
              {content.details.coreIdeas.map((idea) => (
                <li key={idea}>{idea}</li>
              ))}
            </ul>
            <p className="reading-source-boundary">
              {content.details.copyrightNote}
            </p>
          </>
        ) : null}
        {content.moduleId === "business_learning" ? (
          <>
            <strong>
              {content.details.company} · {content.details.weeklyTheme}
            </strong>
            <p>{content.details.businessModel}</p>
            <p className="business-decision">
              CEO 决策问题：{content.details.decisionQuestion}
            </p>
            <div className="business-dimensions">
              {Object.entries(content.details.dimensions).map(
                ([key, value]) => (
                  <span key={key}>
                    <b>{key}</b>
                    {value}
                  </span>
                ),
              )}
            </div>
          </>
        ) : null}
        {content.moduleId === "movie_reflection" ? (
          <>
            <strong>
              {content.details.movieTitle}
              {content.details.releaseYear
                ? ` · ${content.details.releaseYear}`
                : ""}
            </strong>
            <div className="movie-questions">
              {content.details.preWatchQuestions.map((question) => (
                <p key={question}>{question}</p>
              ))}
            </div>
            <p>误读风险：{content.details.misreadingRisk}</p>
          </>
        ) : null}
      </div>
      <div className="reading-source-boundary">
        <b>来源边界：</b>
        {content.sourceNote}{" "}
        {content.shortQuote ? `“${content.shortQuote}”` : "未使用外部原文引文"}
      </div>
      <div className="cognition-source-line">
        <ShieldCheck size={14} /> {content.sourceRefs.length} 条上下文来源 ·
        置信度 {Math.round(content.confidence * 100)}% · {content.sourceStatus}
      </div>
      <p className="cognition-reflection-question">
        今日问题：{content.reflectionQuestion}
      </p>
    </>
  );
}

function ReflectionResult({
  reflection,
}: {
  reflection: CognitionReflectionRecord;
}) {
  if (!reflection.analysis)
    return <p className="cognition-pending">原始反思已保存，分析等待完成。</p>;
  const analysis = reflection.analysis;
  return (
    <div className="cognition-analysis">
      <div className="cognition-analysis-meta">
        <span>
          {reflection.modelMode === "real"
            ? `${reflection.provider} · 真实 AI`
            : "演示 AI"}
        </span>
        <span>置信度 {Math.round(analysis.confidence * 100)}%</span>
        <time>{date(reflection.updatedAt)}</time>
      </div>
      <div className="cognition-analysis-grid">
        <article>
          <span>核心观点</span>
          <p>{analysis.coreViewpoint}</p>
        </article>
        <article>
          <span>隐含假设</span>
          <ul>
            {analysis.implicitAssumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article>
          <span>亮点</span>
          <ul>
            {analysis.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article>
          <span>逻辑漏洞</span>
          <ul>
            {analysis.logicalGaps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article>
          <span>反方观点</span>
          <p>{analysis.opposingView}</p>
        </article>
        <article>
          <span>深度分析</span>
          <p>{analysis.deepAnalysis}</p>
        </article>
      </div>
      <div className="cognition-actions">
        <b>下一步行动</b>
        <ol>
          {analysis.actions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
      <div className="cognition-source-line">
        <ShieldCheck size={14} /> 来源：{analysis.sourceRefs.join("、") || "无"}{" "}
        · Self Reflection 仅作为低可信证据，不会直接修改正式能力
      </div>
    </div>
  );
}

export function CognitionGrowth({
  initialSnapshot,
}: {
  initialSnapshot: CognitionSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeModule, setActiveModule] =
    useState<CognitionModuleId>("thinking_model");
  const [topic, setTopic] = useState("");
  const [reflection, setReflection] = useState("");
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeModuleRef = useRef<CognitionModuleId>("thinking_model");
  const generateId = useRef(requestId());
  const reflectId = useRef(requestId());
  const item = useMemo(
    () =>
      snapshot.items.find((entry) => entry.moduleId === activeModule) || null,
    [snapshot.items, activeModule],
  );
  const itemReflection = item
    ? snapshot.reflections.find((entry) => entry.itemId === item.id)
    : null;

  const load = useCallback(async () => {
    const response = await fetch("/api/cognition", { cache: "no-store" });
    const result = (await response.json()) as CognitionSnapshot & {
      error?: string;
    };
    if (!response.ok) throw new Error(result.error || "认知成长数据加载失败");
    setSnapshot(result);
  }, []);

  async function run(
    label: string,
    task: () => Promise<{ snapshot: CognitionSnapshot }>,
  ) {
    if (busy) return;
    setBusy(label);
    setMessage("");
    setError("");
    try {
      const result = await task();
      setSnapshot(result.snapshot);
      setMessage(label + (label.includes("生成") ? "完成" : "已保存"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : label + "失败");
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    const selectedModule = activeModuleRef.current;
    await run("内容生成", async () => {
      const result = await postCognition({
        action: "generate",
        moduleId: selectedModule,
        topic,
        clientRequestId: generateId.current,
      });
      generateId.current = requestId();
      return result;
    });
  }

  function selectModule(moduleId: CognitionModuleId) {
    // Keep rapid tab -> generate interactions bound to the tab the owner
    // actually selected, even before React completes the visual rerender.
    activeModuleRef.current = moduleId;
    setActiveModule(moduleId);
  }

  async function submitReflection(event: React.FormEvent) {
    event.preventDefault();
    if (!item) return;
    await run("反思分析", async () => {
      const result = await postCognition({
        action: "reflect",
        itemId: item.id,
        reflection,
        decision,
        clientRequestId: reflectId.current,
      });
      reflectId.current = requestId();
      setReflection("");
      setDecision("");
      return result;
    });
  }

  return (
    <div className="shell cognition-page">
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
              className={href === "/cognition" ? "active" : ""}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="side-note">
          <Sparkles size={16} />
          <div>
            <strong>证据驱动认知</strong>
            <span>先保存思考，再分析与复盘</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">Genesis 认知成长层</span>
            <h1>认知成长</h1>
          </div>
          <div className="top-actions">
            <span className="mode demo">
              <Sparkles size={14} />
              演示 / 真实 AI 自动切换
            </span>
          </div>
        </header>
        {error ? (
          <div className="error-banner" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="重试加载"
              onClick={() => void load()}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        ) : null}
        {message ? (
          <div className="learning-success" role="status">
            {message}
          </div>
        ) : null}
        <section className="cognition-intro">
          <span className="section-kicker">上下文 → 认知模型 → 反思证据</span>
          <h2>把世界模型连接到你的真实成长约束</h2>
          <p>
            四个模块按日/周生成一份可验证内容。AI
            只分析上下文与原始反思，不会直接修改正式画像或能力。
          </p>
        </section>
        <div className="cognition-tabs" role="tablist">
          {modules.map((module) => (
            <button
              key={module.id}
              role="tab"
              aria-selected={activeModule === module.id}
              className={activeModule === module.id ? "active" : ""}
              onClick={() => selectModule(module.id)}
            >
              {module.short}
              <small>{module.label}</small>
            </button>
          ))}
        </div>
        <section className="learning-card cognition-content">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                {modules.find((module) => module.id === activeModule)?.label}
              </span>
              <h2>{item?.content.title || "今天生成一份认知内容"}</h2>
            </div>
            <button
              className="icon-button"
              title="刷新认知内容"
              aria-label="刷新认知内容"
              disabled={Boolean(busy)}
              onClick={() => void generate()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <label className="cognition-topic">
            本次关注的问题
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="例如：怎样把今天的模型应用到 Genesis OS？"
              disabled={Boolean(busy)}
            />
          </label>
          {item ? (
            <ContentDetails content={item.content} />
          ) : (
            <div className="cognition-empty">
              <Compass size={22} />
              <p>
                尚未生成今天的内容。点击生成，系统会先读取 Context
                数据包，再调用演示模式或真实 AI 服务。
              </p>
            </div>
          )}
          <button
            className="primary-button cognition-generate"
            disabled={Boolean(busy)}
            onClick={() => void generate()}
          >
            <Sparkles size={15} />
            {busy === "内容生成"
              ? "正在生成…"
              : item
                ? "重新生成（今日幂等）"
                : "生成今日内容"}
          </button>
        </section>
        {item ? (
          <section className="learning-card cognition-reflection">
            <div className="section-heading">
              <div>
                <span className="section-kicker">思考档案</span>
                <h2>先保存你的原始思考</h2>
              </div>
              <PenLine size={20} />
            </div>
            <p className="cognition-note">
              反思会先写入 Self Reflection Evidence，再请求 AI
              分析；分析失败时原文仍然保留。
            </p>
            {itemReflection ? (
              <ReflectionResult reflection={itemReflection} />
            ) : (
              <form onSubmit={(event) => void submitReflection(event)}>
                <label>
                  我的反思
                  <textarea
                    required
                    minLength={10}
                    maxLength={6000}
                    value={reflection}
                    onChange={(event) => setReflection(event.target.value)}
                    placeholder="写下你真正同意、反对或想验证的地方…"
                    disabled={Boolean(busy)}
                  />
                </label>
                <label>
                  我的决策（可选）
                  <textarea
                    maxLength={3000}
                    value={decision}
                    onChange={(event) => setDecision(event.target.value)}
                    placeholder="如果这是商业案例，先写你的选择与依据。"
                    disabled={Boolean(busy)}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={Boolean(busy) || reflection.trim().length < 10}
                >
                  <CheckCircle2 size={15} />
                  {busy === "反思分析" ? "正在保存与分析…" : "保存反思并分析"}
                </button>
              </form>
            )}
          </section>
        ) : null}
        <section className="learning-card cognition-archive">
          <div className="section-heading">
            <div>
              <span className="section-kicker">历史记录</span>
              <h2>思考档案</h2>
            </div>
            <button
              className="icon-button"
              aria-label="刷新历史记录"
              title="刷新历史记录"
              disabled={Boolean(busy)}
              onClick={() => void load()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {snapshot.items.length ? (
            <div className="cognition-archive-list">
              {snapshot.items.map((entry) => (
                <button
                  key={entry.id}
                  className={entry.id === item?.id ? "selected" : ""}
                  onClick={() => selectModule(entry.moduleId)}
                >
                  <span>
                    {
                      modules.find((module) => module.id === entry.moduleId)
                        ?.short
                    }
                  </span>
                  <strong>{entry.content.title}</strong>
                  <time>
                    {entry.periodKey} ·{" "}
                    {entry.modelMode === "real" ? entry.provider : "演示模式"}
                  </time>
                </button>
              ))}
            </div>
          ) : (
            <p className="cognition-note">还没有历史认知记录。</p>
          )}
        </section>
      </main>
    </div>
  );
}
