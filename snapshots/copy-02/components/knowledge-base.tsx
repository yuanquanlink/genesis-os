"use client";

import { useState } from "react";

type Item = { id: string; type: string; content: string; source: string; tags: string[]; createdAt: string };
type Snapshot = { items: Item[] };

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
      if (!response.ok) throw new Error(data.error || "Knowledge search failed");
      setSnapshot(data); setMessage(query.trim() ? `Found ${data.items.length} matching knowledge item(s).` : "Showing recent knowledge.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Knowledge search failed"); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, content, source, tags: [], clientRequestId: crypto.randomUUID() }) });
      const data = await response.json() as { duplicate: boolean; snapshot: Snapshot; error?: string };
      if (!response.ok) throw new Error(data.error || "Knowledge save failed");
      setSnapshot(data.snapshot); setContent(""); setQuery("");
      setMessage(data.duplicate ? "The identical knowledge item already exists." : "Knowledge saved. It is bounded historical context, not formal ability evidence.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Knowledge save failed"); }
    finally { setBusy(false); }
  }

  return <main className="cognition-page" aria-label="Personal Knowledge Base">
    <span className="section-kicker">Personal Knowledge Base / SQLite FTS5</span><h1>Personal Knowledge Base</h1>
    <p>Raw notes are searchable personal material, not automatic ability proof. Verified work must still pass through Evidence and user approval.</p>
    <section className="growth-card"><form onSubmit={save} className="cognition-reflection"><label>Type<select value={type} onChange={(event) => setType(event.target.value)}>{["note", "project", "reading", "idea", "reflection", "course"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Source<input value={source} onChange={(event) => setSource(event.target.value)} /></label><label>Content<textarea required minLength={10} value={content} onChange={(event) => setContent(event.target.value)} /></label><button className="primary-button" disabled={busy}>Save knowledge</button></form></section>
    <section className="growth-card"><form onSubmit={search} className="cognition-reflection"><label>Search knowledge<input aria-label="Search knowledge" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stored notes" /></label><button className="secondary-button" disabled={busy}>Search</button></form>{message ? <p role="status">{message}</p> : null}</section>
    <section className="growth-card"><h2>Knowledge history</h2>{snapshot.items.length ? snapshot.items.map((item) => <article key={item.id}><strong>{item.type} / {item.source}</strong><p>{item.content}</p><small>{item.createdAt}</small></article>) : <p>No matching knowledge items.</p>}</section>
  </main>;
}
