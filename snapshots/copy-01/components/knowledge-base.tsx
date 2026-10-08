"use client";

import { useState } from "react";

type Item = { id: string; type: string; content: string; source: string; tags: string[]; createdAt: string };
type Snapshot = { items: Item[] };
const typeLabel: Record<string, string> = { note: "笔记", project: "项目", reading: "阅读", idea: "想法", reflection: "反思", course: "课程" };

export function KnowledgeBase({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [content, setContent] = useState("");
  const [type, setType] = useState("note");
  const [source, setSource] = useState("manual");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch(`/api/knowledge?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "知识检索失败");
      setSnapshot(data); setMessage(query.trim() ? `找到 ${data.items.length} 条匹配知识。` : "正在显示最近知识。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "知识检索失败"); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, content, source, tags: [], clientRequestId: crypto.randomUUID() }) });
      const data = await response.json() as { duplicate: boolean; snapshot: Snapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "知识保存失败");
      setSnapshot(data.snapshot); setContent(""); setQuery("");
      setMessage(data.duplicate ? "相同知识记录已存在。" : "知识已保存。它是受边界保护的历史材料，不是正式能力证据。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "知识保存失败"); }
    finally { setBusy(false); }
  }

  return <main className="cognition-page" aria-label="个人知识库">
    <span className="section-kicker">个人知识库 · SQLite FTS5</span><h1>知识库</h1>
    <p>原始笔记是可检索的个人材料，不会自动证明能力。真实成果仍必须经过证据与用户审批流程。</p>
    <section className="growth-card"><form onSubmit={save} className="cognition-reflection"><label>类型<select value={type} onChange={(event) => setType(event.target.value)}><option value="note">笔记</option><option value="project">项目</option><option value="reading">阅读</option><option value="idea">想法</option><option value="reflection">反思</option><option value="course">课程</option></select></label><label>来源<input value={source} onChange={(event) => setSource(event.target.value)} /></label><label>内容<textarea required minLength={10} value={content} onChange={(event) => setContent(event.target.value)} /></label><button className="primary-button" disabled={busy}>保存知识</button></form></section>
    <section className="growth-card"><form onSubmit={search} className="cognition-reflection"><label>检索知识<input aria-label="检索知识" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="检索已保存的笔记" /></label><button className="secondary-button" disabled={busy}>检索</button></form>{message ? <p role="status">{message}</p> : null}</section>
    <section className="growth-card"><h2>知识历史</h2>{snapshot.items.length ? snapshot.items.map((item) => <article key={item.id}><strong>{typeLabel[item.type] || item.type} · {item.source === "manual" ? "手动输入" : item.source}</strong><p>{item.content}</p><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small></article>) : <p>没有匹配的知识记录。</p>}</section>
  </main>;
}
