import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ContextEngine } from "@/lib/ai/context-engine";
import { contentHash } from "@/lib/domain/fingerprint";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();

const insightSchema = z.object({
  abilityTrend: z.string().min(1), bottleneck: z.string().min(1), nextStep: z.string().min(1), risk: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1), confidence: z.number().min(0).max(1), limitations: z.array(z.string()).min(1),
});
const knowledgeInput = z.object({
  type: z.enum(["note", "project", "reading", "idea", "reflection", "course"]), content: z.string().min(10).max(10_000),
  source: z.string().min(1).max(400), tags: z.array(z.string().min(1).max(60)).max(12).default([]), clientRequestId: z.string().uuid(),
});
const actionInput = z.object({ action: z.literal("generate"), clientRequestId: z.string().uuid() });

const parse = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};

function ftsPhrase(raw: string) {
  // User text is data, not an FTS expression. Quote it so operators cannot alter the query grammar.
  return `"${raw.replaceAll('"', '""').trim()}"`;
}

export class ProactiveCompanionService {
  constructor(private readonly repository: ProfileRepository) {}

  private week() {
    const date = new Date();
    const first = new Date(date.getFullYear(), 0, 1);
    const week = Math.ceil(((date.getTime() - first.getTime()) / 86_400_000 + first.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  private refs() {
    return (this.repository.db.prepare("SELECT id FROM evidence_items WHERE user_id=? AND verification_status='verified' AND data_kind='user' ORDER BY captured_at DESC LIMIT 12").all(USER_ID) as Array<{ id: string }>).map((row) => row.id);
  }

  private fallback(ids: string[]) {
    return insightSchema.parse({
      abilityTrend: "Verified evidence is accumulating, but only approved Ability Snapshots establish a formal level change.",
      bottleneck: "The current bottleneck is turning recorded work into a tested and independently inspectable delivery loop.",
      nextStep: "Complete one bounded learning or project task with a test, documentation, and reflection.",
      risk: "Starting parallel directions before verification may dilute strategic execution.",
      evidenceIds: ids.slice(0, 4), confidence: ids.length > 2 ? 0.58 : 0.4,
      limitations: ["This is a Recommendation Candidate; it cannot modify Goal, Ability, Evidence, or Strategy."],
    });
  }

  snapshot() {
    const rows = this.repository.db.prepare("SELECT * FROM proactive_insights WHERE user_id=? ORDER BY week_key DESC LIMIT 12").all(USER_ID) as Row[];
    return {
      insights: rows.map((row) => ({
        id: String(row.id), weekKey: String(row.week_key), status: String(row.status),
        insight: parse(row.insight_json, this.fallback(parse<string[]>(row.evidence_ids_json, []))),
        createdAt: String(row.created_at), provider: String(row.provider), mode: String(row.model_mode),
      })),
      approvedEvidenceCount: this.refs().length,
    };
  }

  async generate(raw: unknown) {
    const input = actionInput.parse(raw);
    const db = this.repository.db;
    const existing = db.prepare("SELECT * FROM proactive_insights WHERE user_id=? AND (client_request_id=? OR week_key=?)").get(USER_ID, input.clientRequestId, this.week()) as Row | undefined;
    if (existing) return { duplicate: true, snapshot: this.snapshot() };

    const ids = this.refs();
    if (!ids.length) return { duplicate: false, unavailable: "Approved Evidence is required before Genesis can generate a Weekly Insight Candidate.", snapshot: this.snapshot() };

    const context = new ContextEngine(this.repository);
    const prepared = context.prepare({ currentPage: "/", currentTask: "weekly proactive insight", currentQuestion: "Identify evidence-linked weekly growth signals.", currentChapter: null, currentConversation: [] }, "full", { includeOperationalMemory: true });
    let insight = this.fallback(ids);
    let provider = "demo";
    let model = "local-proactive-v1";
    let mode: "demo" | "real" = "demo";
    let fallbackReason: string | null = null;
    if (context.isRealConfigured()) {
      try {
        const result = await context.complete({
          module: "proactive_weekly_insight", taskClass: "cheap_daily", maxOutputTokens: 1600, temperature: 0.1,
          schema: insightSchema, schemaName: "weeklyInsight", preparedContext: prepared, workingMemory: prepared.packet!.memory.working,
          messages: [
            { role: "system", content: `Return JSON weekly insight. Cite only these verified Evidence IDs: ${ids.join(",")}. This is a recommendation candidate; do not modify any user data.` },
            { role: "user", content: "Analyze recent learning, Growth Graph, evidence, and approved strategy execution." },
          ],
        });
        insight = insightSchema.parse(result.parsed);
        provider = result.provider; model = result.model; mode = "real";
      } catch {
        fallbackReason = "provider_failed";
      }
    }
    if (insight.evidenceIds.some((id) => !ids.includes(id))) throw new Error("PROACTIVE_INVALID_EVIDENCE");
    db.prepare("INSERT INTO proactive_insights VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      randomUUID(), USER_ID, this.week(), input.clientRequestId, JSON.stringify(insight), JSON.stringify(insight.evidenceIds),
      insight.confidence, provider, model, mode, "proactive-v1", fallbackReason, "pending", now(),
    );
    return { duplicate: false, snapshot: this.snapshot() };
  }

  knowledgeSnapshot(query = "") {
    const normalizedQuery = query.trim();
    const rows = normalizedQuery
      ? this.repository.db.prepare("SELECT item.* FROM knowledge_items_fts f JOIN knowledge_items item ON item.rowid=f.rowid WHERE knowledge_items_fts MATCH ? AND item.user_id=? ORDER BY rank LIMIT 30").all(ftsPhrase(normalizedQuery), USER_ID)
      : this.repository.db.prepare("SELECT * FROM knowledge_items WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(USER_ID);
    return { items: (rows as Row[]).map((row) => ({ id: String(row.id), type: String(row.type), content: String(row.content), source: String(row.source), tags: parse<string[]>(row.tags_json, []), createdAt: String(row.created_at) })) };
  }

  addKnowledge(raw: unknown) {
    const input = knowledgeInput.parse(raw);
    const hash = contentHash(input.content);
    const existing = this.repository.db.prepare("SELECT id FROM knowledge_items WHERE user_id=? AND content_hash=?").get(USER_ID, hash) as { id: string } | undefined;
    if (!existing) this.repository.db.prepare("INSERT INTO knowledge_items (id,user_id,type,content,source,tags_json,data_kind,content_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, input.type, input.content, input.source, JSON.stringify(input.tags), "user", hash, now(), now());
    return { duplicate: Boolean(existing), snapshot: this.knowledgeSnapshot() };
  }
}
