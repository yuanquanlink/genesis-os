"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  Compass,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  FileCheck2,
  Home,
  Moon,
  Network,
  PenLine,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import type { SectionKey } from "@/lib/navigation";
import { DailyLifeLoop } from "@/components/daily-life-loop";
import { ProactiveCompanion } from "@/components/proactive-companion";
import { PersonalOperatingLoop } from "@/components/personal-operating-loop";

type Evidence = {
  id: string;
  sourceEntryId: string;
  excerpt: string;
  confidence: number;
  createdAt: string;
};
type Fact = {
  id: string;
  content: string;
  factType: string;
  confidence: number;
  sourceEntryId: string;
  evidenceExcerpt: string;
  evidenceCount: number;
  lastVerifiedAt: string;
  status: string;
  updatedAt: string;
  evidences: Evidence[];
  versions: Array<{
    version: number;
    content: string;
    confidence: number;
    reason: string;
    createdAt: string;
  }>;
};
type Entry = {
  id: string;
  content: string;
  category: string;
  tags: string[];
  importance: number;
  occurredAt: string;
  allowAi: boolean;
  status: string;
  dataKind: string;
  duplicateOfEntryId: string | null;
};
type Snapshot = {
  user: { name: string; longTermGoal: string; currentStage: string };
  entries: Entry[];
  proposals: Array<{
    id: string;
    sourceEntryId: string;
    proposedContent: string;
    factType: string;
    evidenceExcerpt: string;
    confidence: number;
    possibleImpact: string;
    status: "pending" | "approved" | "rejected";
    modelMode: "demo" | "real" | "openai";
    provider: string;
    evidenceCount: number;
    createdAt: string;
  }>;
  facts: Fact[];
  inactiveFacts: Fact[];
  timeline: Array<{
    id: string;
    eventType: string;
    title: string;
    summary: string;
    sourceId: string;
    occurredAt: string;
    children: Array<{
      id: string;
      eventType: string;
      title: string;
      summary: string;
    }>;
  }>;
  cleanupPreview: {
    entries: number;
    proposals: number;
    timelineEvents: number;
    confirmedFacts: number;
    protectedEntries: number;
  };
  usage: Array<{
    id: string;
    purpose: string;
    provider: string;
    taskClass: string | null;
    requestId: string | null;
    model: string;
    mode: string;
    latencyMs: number;
    success: boolean;
    createdAt: string;
  }>;
};

const nav = [
  { key: "today", href: "/", label: "今日", icon: Home },
  { key: "usage", href: "/usage", label: "使用概览", icon: BarChart3 },
  { key: "knowledge", href: "/knowledge", label: "知识库", icon: BookOpen },
  { key: "memory", href: "/memory", label: "长期记忆", icon: Brain },
  { key: "learning", href: "/learning", label: "深度学习", icon: BookOpen },
  { key: "self-input", href: "/self-input", label: "自我输入", icon: PenLine },
  {
    key: "digital-life",
    href: "/digital-life",
    label: "数字生命",
    icon: Brain,
  },
  { key: "growth-graph", href: "/growth-graph", label: "成长图谱", icon: Network },
  { key: "evidence", href: "/evidence", label: "成长证据", icon: FileCheck2 },
  { key: "project-challenge", href: "/project-challenge", label: "工程挑战", icon: SquareTerminal },
  { key: "cognition", href: "/cognition", label: "认知成长", icon: Compass },
  { key: "strategy", href: "/strategy", label: "战略中枢", icon: Compass },
  { key: "missions", href: "/missions", label: "行动任务", icon: Check },
  { key: "monthly-review", href: "/monthly-review", label: "Monthly Review", icon: BarChart3 },
  { key: "timeline", href: "/timeline", label: "成长时间线", icon: Activity },
  { key: "settings", href: "/settings", label: "设置", icon: Settings },
] as const;

const labels: Record<string, string> = {
  experience: "经历",
  learning: "学习",
  project: "项目",
  reflection: "反思",
  decision: "决定",
  goal: "目标",
  state: "状态",
  capability: "能力",
  interest: "兴趣",
  value: "价值取向",
  pattern: "行为模式",
  risk: "风险",
  opportunity: "机会",
};
const categories = [
  "experience",
  "learning",
  "project",
  "reflection",
  "decision",
  "goal",
  "state",
];
const inputPresets = [
  { label: "学习记录", category: "learning", tag: "learning" },
  { label: "项目进度", category: "project", tag: "project" },
  { label: "比赛经历", category: "experience", tag: "competition" },
  { label: "阅读记录", category: "learning", tag: "reading" },
  { label: "想法记录", category: "reflection", tag: "idea" },
  { label: "情绪状态", category: "state", tag: "mood" },
  { label: "阶段目标", category: "goal", tag: "stage-goal" },
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function Confidence({ value }: { value: number }) {
  return (
    <span className="confidence" title={`置信度 ${Math.round(value * 100)}%`}>
      <i style={{ width: `${Math.round(value * 100)}%` }} />
      {Math.round(value * 100)}%
    </span>
  );
}

async function mutate(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

export function GenesisApp({
  section,
  initialSnapshot,
}: {
  section: SectionKey;
  initialSnapshot: Snapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const data = (await response.json()) as Snapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "数据加载失败");
      setSnapshot(data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "数据加载失败");
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const pendingCount = snapshot.proposals.filter(
    (item) => item.status === "pending",
  ).length;
  const latestProvider = snapshot.usage[0]?.provider;
  const aiMode =
    latestProvider && latestProvider !== "demo"
      ? `${latestProvider} Real AI`
      : "Demo AI";
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">G</span>
          <span>
            <strong>Genesis</strong>
            <small>个人进化系统</small>
          </span>
        </Link>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={section === item.key ? "active" : ""}
              >
                <Icon size={17} />
                {item.label}
                {item.key === "digital-life" && pendingCount ? (
                  <b>{pendingCount}</b>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="side-note">
          <ShieldCheck size={16} />
          <div>
            <strong>批准后才进入画像</strong>
            <span>AI 推测不会自动成为事实</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="eyebrow">{snapshot.user.currentStage}</span>
            <h1>{nav.find((item) => item.key === section)?.label || "今日"}</h1>
          </div>
          <div className="top-actions">
            <span className={`mode ${aiMode === "Demo AI" ? "demo" : ""}`}>
              <Sparkles size={14} />
              {aiMode}
            </span>
            <button
              className="icon-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="切换主题"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
        {error ? (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => void load()}>重试</button>
          </div>
        ) : null}
        {section === "today" ? <Today snapshot={snapshot} /> : null}
        {section === "self-input" ? (
          <SelfInput snapshot={snapshot} onChanged={load} />
        ) : null}
        {section === "digital-life" ? (
          <DigitalLife snapshot={snapshot} onChanged={load} />
        ) : null}
        {section === "timeline" ? (
          <Timeline snapshot={snapshot} onChanged={load} />
        ) : null}
        {section === "settings" ? (
          <SettingsView snapshot={snapshot} onChanged={load} />
        ) : null}
      </main>
    </div>
  );
}

function Today({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="page-grid today-grid">
      <DailyLifeLoop />
      <PersonalOperatingLoop />
      <ProactiveCompanion />
      <section className="focus-panel">
        <span className="section-kicker">现在最重要的事</span>
        <h2>把学习变成可验证的工程能力</h2>
        <p>
          从真实资料开始，经基线诊断、知识地图、深度会话、延迟复习和工程成果形成证据；掌握度不会因“点击完成”而上涨。
        </p>
        <div className="focus-proof">
          <div>
            <span>学习闭环</span>
            <strong>资料解析 → 诊断 → 教学 → 迁移 → 工程交付 → 复盘</strong>
          </div>
          <div>
            <span>记忆边界</span>
            <strong>学习结果进入时间线，长期画像仍需你亲自批准</strong>
          </div>
        </div>
        <Link href="/learning" className="primary-link">
          进入深度学习引擎
          <ChevronRight size={16} />
        </Link>
      </section>
      <aside className="status-panel">
        <span className="section-kicker">长期方向</span>
        <h3>{snapshot.user.longTermGoal}</h3>
        <div className="metric-row">
          <span>原始记录</span>
          <strong>{snapshot.entries.length}</strong>
        </div>
        <div className="metric-row">
          <span>正式画像</span>
          <strong>{snapshot.facts.length}</strong>
        </div>
        <div className="metric-row">
          <span>待判断候选</span>
          <strong>
            {
              snapshot.proposals.filter((item) => item.status === "pending")
                .length
            }
          </strong>
        </div>
      </aside>
      <section className="recent-panel full-span">
        <div className="section-heading">
          <div>
            <span className="section-kicker">最近变化</span>
            <h3>主要成长事件</h3>
          </div>
          <Link href="/timeline">查看时间线</Link>
        </div>
        <div className="compact-timeline">
          {snapshot.timeline.slice(0, 4).map((item) => (
            <div key={item.id}>
              <span>{formatDate(item.occurredAt)}</span>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SelfInput({
  snapshot,
  onChanged,
}: {
  snapshot: Snapshot;
  onChanged: () => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("experience");
  const [tags, setTags] = useState("");
  const [importance, setImportance] = useState(3);
  const [allowAi, setAllowAi] = useState(true);
  const [isTest, setIsTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const draftRequestId = useRef<string | null>(null);
  const changed = () => {
    draftRequestId.current = null;
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const clientRequestId = draftRequestId.current ?? crypto.randomUUID();
      draftRequestId.current = clientRequestId;
      const response = await fetch("/api/self-entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": clientRequestId,
        },
        body: JSON.stringify({
          content,
          category,
          tags: tags
            .split(/[,，]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
          importance,
          occurredAt: new Date().toISOString(),
          allowAi,
          clientRequestId,
          dataKind: isTest ? "test" : "user",
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        errorId?: string;
        candidates?: unknown[];
        analysisStatus?: string;
        duplicate?: boolean;
      };
      if (!response.ok)
        throw new Error(
          `${result.error || "保存失败"}${result.errorId ? `（错误编号 ${result.errorId}）` : ""}`,
        );
      setMessage(
        result.message ||
          (result.analysisStatus === "failed"
            ? "原文已保存，但候选生成失败。"
            : `原文已保存，生成 ${result.candidates?.length ?? 0} 条新候选。`),
      );
      if (result.analysisStatus !== "failed") {
        draftRequestId.current = null;
        setContent("");
        setTags("");
      }
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }
  const primaryEntries = snapshot.entries.filter(
    (entry) => entry.status !== "duplicate",
  );
  return (
    <div className="page-grid input-grid">
      <form className="entry-form" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <span className="section-kicker">原始证据</span>
            <h2>今天发生了什么？</h2>
          </div>
          <span className="privacy-pill">
            <Database size={14} />
            原文完整保存
          </span>
        </div>
        <textarea
          value={content}
          onChange={(event) => {
            changed();
            setContent(event.target.value);
          }}
          minLength={10}
          maxLength={10000}
          required
          placeholder="写下真实发生的经历、学习、决定或状态变化……"
        />
        <div className="input-preset-row" aria-label="快速输入类型">
          {inputPresets.map((preset) => <button type="button" key={preset.label} onClick={() => {
            changed();
            setCategory(preset.category);
            setTags((current) => current.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).includes(preset.tag) ? current : [current, preset.tag].filter(Boolean).join(", "));
          }}>{preset.label}</button>)}
        </div>
        <div className="form-row">
          <label>
            类型
            <select
              value={category}
              onChange={(event) => {
                changed();
                setCategory(event.target.value);
              }}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {labels[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            标签
            <input
              value={tags}
              onChange={(event) => {
                changed();
                setTags(event.target.value);
              }}
              placeholder="工程, 闭环（逗号分隔）"
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            重要程度
            <div className="importance">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  type="button"
                  onClick={() => {
                    changed();
                    setImportance(level);
                  }}
                  className={importance === level ? "selected" : ""}
                  key={level}
                >
                  {level}
                </button>
              ))}
            </div>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={allowAi}
              onChange={(event) => {
                changed();
                setAllowAi(event.target.checked);
              }}
            />
            <span>
              <strong>允许用于长期画像</strong>
              <small>AI 只生成候选，仍需你确认</small>
            </span>
          </label>
        </div>
        <label className="test-marker">
          <input
            type="checkbox"
            checked={isTest}
            onChange={(event) => {
              changed();
              setIsTest(event.target.checked);
            }}
          />
          标记为测试数据（之后可在设置中安全清除）
        </label>
        <button
          className="primary-button"
          disabled={saving || content.trim().length < 10}
        >
          {saving ? "正在保存并分析…" : "保存原文并提取候选"}
          <ChevronRight size={16} />
        </button>
        <small>每条已保存输入都会同步为待评估 Evidence；只有通过既有 Evidence Candidate 审批后，才可能影响正式能力。</small>
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
      </form>
      <aside className="records-panel">
        <span className="section-kicker">最近原始记录</span>
        <h3>{snapshot.entries.length} 条可追溯输入</h3>
        {primaryEntries.slice(0, 20).map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            duplicates={snapshot.entries.filter(
              (item) => item.duplicateOfEntryId === entry.id,
            )}
            onChanged={onChanged}
          />
        ))}
      </aside>
    </div>
  );
}

function EntryCard({
  entry,
  duplicates,
  onChanged,
}: {
  entry: Entry;
  duplicates: Entry[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(entry.category);
  const [tags, setTags] = useState(entry.tags.join(", "));
  const [dataKind, setDataKind] = useState(entry.dataKind);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await mutate(`/api/self-entries/${entry.id}`, body);
      await onChanged();
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="record">
      <div>
        <span>
          {labels[entry.category] || entry.category} ·{" "}
          {entry.dataKind === "user" ? "正式" : entry.dataKind.toUpperCase()}
        </span>
        <time>{formatDate(entry.occurredAt)}</time>
      </div>
      <p className="record-preview">{entry.content}</p>
      <details>
        <summary>查看完整原文</summary>
        <div className="full-source">{entry.content}</div>
      </details>
      {duplicates.length ? (
        <details className="duplicate-sources">
          <summary>关联 {duplicates.length} 条重复来源</summary>
          {duplicates.map((duplicate) => (
            <div key={duplicate.id}>
              <time>{formatDate(duplicate.occurredAt)}</time>
              <p>{duplicate.content}</p>
              <small>来源 {duplicate.id.slice(0, 8)}… · 原文与时间均保留</small>
            </div>
          ))}
        </details>
      ) : null}
      <small>
        {entry.allowAi ? "允许 AI 分析" : "仅保存"} · 重要度 {entry.importance}
        /5 · {entry.status}
      </small>
      {editing ? (
        <div className="manage-box">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {labels[item]}
              </option>
            ))}
          </select>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
          <select
            value={dataKind}
            onChange={(event) => setDataKind(event.target.value)}
            aria-label="数据属性"
          >
            <option value="user">正式数据</option>
            <option value="test">测试数据</option>
            <option value="demo">Demo 数据</option>
          </select>
          <button
            disabled={busy}
            onClick={() =>
              void act({
                action: "edit_metadata",
                category,
                tags: tags
                  .split(/[,，]/)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
                dataKind,
              })
            }
          >
            保存标签、类型和数据属性
          </button>
        </div>
      ) : null}
      <div className="text-actions">
        <button onClick={() => setEditing(!editing)}>编辑标签/类型</button>
        <button
          disabled={busy}
          onClick={() =>
            void act({ action: "archive", reason: "用户在原始输入管理中归档" })
          }
        >
          归档
        </button>
        <button
          disabled={busy}
          onClick={() => void act({ action: "mark_duplicate" })}
        >
          标记/合并重复
        </button>
        <button
          className="danger"
          onClick={() => setConfirmDelete(confirmDelete ? "" : "pending")}
        >
          删除
        </button>
      </div>
      {confirmDelete ? (
        <div className="confirm-row">
          <input
            value={confirmDelete === "pending" ? "" : confirmDelete}
            onChange={(event) => setConfirmDelete(event.target.value)}
            placeholder="输入 DELETE 二次确认"
          />
          <button
            disabled={busy || confirmDelete !== "DELETE"}
            onClick={() =>
              void act({ action: "delete", reason: "用户二次确认删除原始输入" })
            }
          >
            <Trash2 size={13} />
            确认删除
          </button>
        </div>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </article>
  );
}

function DigitalLife({
  snapshot,
  onChanged,
}: {
  snapshot: Snapshot;
  onChanged: () => Promise<void>;
}) {
  const pending = snapshot.proposals.filter(
    (item) => item.status === "pending",
  );
  return (
    <div className="digital-page">
      <section className="profile-hero">
        <div>
          <span className="section-kicker">证据化数字生命</span>
          <h2>{snapshot.user.longTermGoal}</h2>
          <p>所有长期画像均由用户批准，并保留支持证据与版本历史。</p>
        </div>
        <div className="profile-score">
          <strong>{snapshot.facts.length}</strong>
          <span>条有效事实</span>
        </div>
      </section>
      <section className="proposal-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">需要你的判断</span>
            <h3>画像候选更新</h3>
          </div>
          <span>{pending.length} 条待处理</span>
        </div>
        {pending.length ? (
          <div className="proposal-list">
            {pending.map((proposal) => (
              <Proposal
                key={proposal.id}
                proposal={proposal}
                onChanged={onChanged}
              />
            ))}
          </div>
        ) : (
          <Empty
            icon={Check}
            title="没有待处理候选"
            text="重复候选会合并证据，不会反复出现在这里。"
          />
        )}
      </section>
      <section className="fact-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">长期档案</span>
            <h3>已由你确认的事实</h3>
          </div>
          <span>{snapshot.facts.length} 条有效</span>
        </div>
        <div className="fact-grid">
          {snapshot.facts.map((fact) => (
            <FactCard
              key={fact.id}
              fact={fact}
              allFacts={snapshot.facts}
              onChanged={onChanged}
            />
          ))}
        </div>
        {snapshot.inactiveFacts.length ? (
          <div className="inactive-section">
            <h3>已归档、合并或删除的画像</h3>
            {snapshot.inactiveFacts.map((fact) => (
              <InactiveFact key={fact.id} fact={fact} onChanged={onChanged} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Proposal({
  proposal,
  onChanged,
}: {
  proposal: Snapshot["proposals"][number];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(proposal.proposedContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(action: "approve" | "reject" | "edit") {
    setBusy(true);
    setError("");
    try {
      await mutate(
        `/api/profile-proposals/${proposal.id}`,
        action === "edit" ? { action, content } : { action },
      );
      setEditing(false);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "处理失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="proposal-card">
      <div className="proposal-meta">
        <span>{labels[proposal.factType] || proposal.factType}</span>
        <span className={proposal.modelMode === "demo" ? "demo-tag" : "ai-tag"}>
          {proposal.modelMode === "demo"
            ? "Demo 提取"
            : `${proposal.provider} Real AI`}
        </span>
        <span>{proposal.evidenceCount} 条证据</span>
        <Confidence value={proposal.confidence} />
      </div>
      {editing ? (
        <textarea
          className="edit-area"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      ) : (
        <h4>{proposal.proposedContent}</h4>
      )}
      <div className="evidence-box">
        <span>证据原文</span>
        <p>“{proposal.evidenceExcerpt}”</p>
      </div>
      <p className="impact">
        <strong>可能影响：</strong>
        {proposal.possibleImpact}
      </p>
      <div className="proposal-actions">
        {editing ? (
          <>
            <button
              disabled={busy || content.trim().length < 4}
              onClick={() => void decide("edit")}
            >
              <Check size={15} />
              保存修改
            </button>
            <button onClick={() => setEditing(false)}>取消</button>
          </>
        ) : (
          <>
            <button
              className="approve"
              disabled={busy}
              onClick={() => void decide("approve")}
            >
              <Check size={15} />
              批准
            </button>
            <button disabled={busy} onClick={() => setEditing(true)}>
              <PenLine size={15} />
              修改
            </button>
            <button
              className="reject"
              disabled={busy}
              onClick={() => void decide("reject")}
            >
              <X size={15} />
              拒绝
            </button>
          </>
        )}
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
    </article>
  );
}

function FactCard({
  fact,
  allFacts,
  onChanged,
}: {
  fact: Fact;
  allFacts: Fact[];
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<
    "" | "edit" | "merge" | "archive" | "delete"
  >("");
  const [content, setContent] = useState(fact.content);
  const [reason, setReason] = useState("");
  const [targetFactId, setTargetFactId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await mutate(`/api/profile-facts/${fact.id}`, body);
      setMode("");
      setReason("");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="fact-card">
      <div className="fact-top">
        <span>{labels[fact.factType] || fact.factType}</span>
        <span>{fact.evidenceCount} 条证据</span>
        <Confidence value={fact.confidence} />
      </div>
      <h4>{fact.content}</h4>
      <div className="evidence-line">
        <FileText size={14} />
        最后验证 {formatDate(fact.lastVerifiedAt)}
      </div>
      <details className="evidence-details">
        <summary>查看所有支持证据（{fact.evidences.length}）</summary>
        {fact.evidences.map((item) => (
          <blockquote key={item.id}>
            “{item.excerpt}”
            <small>
              来源 {item.sourceEntryId.slice(0, 8)}… ·{" "}
              {formatDate(item.createdAt)} · {Math.round(item.confidence * 100)}
              %
            </small>
          </blockquote>
        ))}
      </details>
      <details className="version-details">
        <summary>历史版本（{fact.versions.length}）</summary>
        {fact.versions.map((version) => (
          <div key={version.version}>
            <p>
              v{version.version} · {version.content}
            </p>
            <small>
              {version.reason} · {formatDate(version.createdAt)}
            </small>
            {version.content !== fact.content ? (
              <button
                onClick={() =>
                  void act({
                    action: "restore_version",
                    version: version.version,
                  })
                }
              >
                恢复此版本
              </button>
            ) : null}
          </div>
        ))}
      </details>
      <div className="text-actions">
        <button onClick={() => setMode("edit")}>修改</button>
        <button onClick={() => setMode("merge")}>合并重复画像</button>
        <button onClick={() => setMode("archive")}>归档</button>
        <button className="danger" onClick={() => setMode("delete")}>
          删除
        </button>
      </div>
      {mode ? (
        <div className="manage-box">
          {mode === "edit" ? (
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          ) : null}
          {mode === "merge" ? (
            <select
              value={targetFactId}
              onChange={(event) => setTargetFactId(event.target.value)}
            >
              <option value="">选择保留的目标画像</option>
              {allFacts
                .filter((item) => item.id !== fact.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.content}
                  </option>
                ))}
            </select>
          ) : null}
          {mode !== "merge" ? (
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                mode === "delete"
                  ? "输入删除原因（二次确认）"
                  : "说明修改原因（至少 4 个字）"
              }
            />
          ) : (
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="说明合并原因（至少 4 个字）"
            />
          )}
          <div>
            <button
              disabled={
                busy ||
                reason.trim().length < 4 ||
                (mode === "merge" && !targetFactId)
              }
              onClick={() =>
                void act(
                  mode === "edit"
                    ? { action: "edit", content, reason }
                    : mode === "merge"
                      ? { action: "merge", targetFactId, reason }
                      : { action: mode, reason },
                )
              }
            >
              确认{mode === "delete" ? "删除" : "操作"}
            </button>
            <button onClick={() => setMode("")}>取消</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </article>
  );
}

function InactiveFact({
  fact,
  onChanged,
}: {
  fact: Fact;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function restore() {
    setBusy(true);
    try {
      await mutate(`/api/profile-facts/${fact.id}`, {
        action: "restore",
        reason: "用户从历史画像中恢复",
      });
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="inactive-fact">
      <div>
        <strong>{fact.content}</strong>
        <small>
          {fact.status} · {fact.evidenceCount} 条证据
        </small>
      </div>
      {fact.status !== "merged" ? (
        <button disabled={busy} onClick={() => void restore()}>
          恢复
        </button>
      ) : (
        <span>证据已保留在合并目标</span>
      )}
      {error ? <p className="inline-error">{error}</p> : null}
    </article>
  );
}

function Timeline({
  snapshot,
  onChanged,
}: {
  snapshot: Snapshot;
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState("all");
  const [confirming, setConfirming] = useState("");
  const entries = useMemo(
    () =>
      snapshot.timeline.filter(
        (item) =>
          filter === "all" ||
          (filter === "self"
            ? item.eventType === "self_entry"
            : item.eventType !== "self_entry"),
      ),
    [snapshot.timeline, filter],
  );
  async function hide(id: string) {
    await mutate(`/api/life-events/${id}`, { action: "hide" });
    setConfirming("");
    await onChanged();
  }
  return (
    <section className="timeline-page">
      <div className="timeline-intro">
        <span className="section-kicker">一次操作，一个主要事件</span>
        <h2>主事件承载变化，子事件保留细节</h2>
        <p>候选提取等内部步骤折叠在同一次输入下，避免视觉上重复。</p>
      </div>
      <div className="filter-row">
        <button
          className={filter === "all" ? "selected" : ""}
          onClick={() => setFilter("all")}
        >
          全部
        </button>
        <button
          className={filter === "self" ? "selected" : ""}
          onClick={() => setFilter("self")}
        >
          原始输入
        </button>
        <button
          className={filter === "profile" ? "selected" : ""}
          onClick={() => setFilter("profile")}
        >
          画像变化
        </button>
      </div>
      {entries.length ? (
        <div className="timeline-list">
          {entries.map((item, index) => (
            <article key={item.id}>
              <div className="timeline-rail">
                <i />
                <span>{index === entries.length - 1 ? "起点" : ""}</span>
              </div>
              <div className="timeline-content">
                <time>{formatDate(item.occurredAt)}</time>
                <span className="event-type">
                  {item.eventType === "self_entry" ? "原始输入" : "画像变化"}
                </span>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                {item.children.length ? (
                  <details>
                    <summary>展开 {item.children.length} 个子事件</summary>
                    {item.children.map((child) => (
                      <div className="child-event" key={child.id}>
                        <strong>{child.title}</strong>
                        <span>{child.summary}</span>
                      </div>
                    ))}
                  </details>
                ) : null}
                <small>来源 ID · {item.sourceId.slice(0, 8)}…</small>
                <button
                  className="hide-event"
                  onClick={() =>
                    setConfirming(confirming === item.id ? "" : item.id)
                  }
                >
                  隐藏测试记录
                </button>
                {confirming === item.id ? (
                  <button
                    className="danger-confirm"
                    onClick={() => void hide(item.id)}
                  >
                    再次点击确认隐藏
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={Clock3}
          title="没有符合筛选条件的事件"
          text="提交一条真实输入后，主要事件会出现在这里。"
        />
      )}
    </section>
  );
}

function SettingsView({
  snapshot,
  onChanged,
}: {
  snapshot: Snapshot;
  onChanged: () => Promise<void>;
}) {
  const [preview, setPreview] = useState(snapshot.cleanupPreview);
  const [confirmation, setConfirmation] = useState("");
  const [keep, setKeep] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function request(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/data-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as typeof preview & {
        error?: string;
        status?: string;
      };
      if (!response.ok) throw new Error(data.error || "清理失败");
      setPreview(data);
      if (data.status === "cleared") {
        setMessage("测试与 Demo 数据已清理，审计日志已记录。");
        setConfirmation("");
        await onChanged();
        const refreshed = await fetch("/api/data-cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview" }),
        });
        if (refreshed.ok)
          setPreview((await refreshed.json()) as typeof preview);
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "清理失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-page">
      <span className="section-kicker">数据治理</span>
      <h2>清除测试与 Demo 数据</h2>
      <p>
        只处理明确标记为 <code>test</code> 或 <code>demo</code>{" "}
        的数据，不使用内容猜测。正式数据不会进入此次清理范围。
      </p>
      <div className="cleanup-counts">
        <div>
          <strong>{preview.entries}</strong>
          <span>原始输入</span>
        </div>
        <div>
          <strong>{preview.proposals}</strong>
          <span>候选</span>
        </div>
        <div>
          <strong>{preview.timelineEvents}</strong>
          <span>时间线事件</span>
        </div>
        <div>
          <strong>{preview.confirmedFacts}</strong>
          <span>关联正式画像</span>
        </div>
      </div>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => void request({ action: "preview" })}
      >
        刷新删除预览
      </button>
      <label className="check-label cleanup-check">
        <input
          type="checkbox"
          checked={keep}
          onChange={(event) => setKeep(event.target.checked)}
        />
        <span>
          <strong>保留已正式确认的画像及其原始证据</strong>
          <small>当前将保护 {preview.protectedEntries} 条证据来源</small>
        </span>
      </label>
      <label className="cleanup-confirm">
        二次确认：输入 CLEAR_TEST_DATA
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </label>
      <button
        className="danger-button"
        disabled={busy || confirmation !== "CLEAR_TEST_DATA"}
        onClick={() =>
          void request({
            action: "execute",
            confirmation,
            keepConfirmedFacts: keep,
          })
        }
      >
        <Trash2 size={15} />
        清除明确标记的测试与 Demo 数据
      </button>
      {message ? <p className="form-message">{message}</p> : null}
    </section>
  );
}

function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <Icon size={22} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
