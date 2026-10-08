import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import type {
  ResearchConsumer,
  ResearchOperation,
  ResearchResult,
  ResearchSource,
} from "@/lib/domain/research";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const parseJson = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};

export type ResearchRunRecord = {
  id: string;
  clientRequestId: string;
  operation: ResearchOperation;
  input: string;
  provider: "tavily";
  status: "running" | "completed" | "failed";
  consumers: ResearchConsumer[];
  providerRequestId: string | null;
  answer: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  sources: ResearchSource[];
};

export class ResearchRepository {
  constructor(private readonly repository: ProfileRepository) {}
  private get db() { return this.repository.db; }

  private audit(action: string, entityId: string, after: unknown) {
    this.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)",
    ).run(randomUUID(), USER_ID, action, "research_run", entityId, JSON.stringify(after), now());
  }

  private mapRun(record: Record<string, unknown>): ResearchRunRecord {
    const sources = this.db.prepare(
      "SELECT * FROM research_sources WHERE run_id=? ORDER BY relevance_score DESC,retrieved_at DESC",
    ).all(record.id) as Array<Record<string, unknown>>;
    return {
      id: String(record.id),
      clientRequestId: String(record.client_request_id),
      operation: record.operation as ResearchOperation,
      input: String(record.input_text),
      provider: "tavily",
      status: record.status as ResearchRunRecord["status"],
      consumers: parseJson(record.consumers_json, []),
      providerRequestId: record.provider_request_id ? String(record.provider_request_id) : null,
      answer: record.answer ? String(record.answer) : null,
      latencyMs: record.latency_ms === null ? null : Number(record.latency_ms),
      errorCode: record.error_code ? String(record.error_code) : null,
      createdAt: String(record.created_at),
      completedAt: record.completed_at ? String(record.completed_at) : null,
      sources: sources.map((source) => ({
        source: "tavily",
        title: String(source.title),
        url: String(source.url),
        summary: String(source.summary),
        relevanceScore: Number(source.relevance_score),
        retrievedAt: String(source.retrieved_at),
        publishedAt: source.published_at ? String(source.published_at) : null,
        sourceType: (source.source_type || "web") as ResearchSource["sourceType"],
      })),
    };
  }

  byClientRequest(clientRequestId: string) {
    const record = this.db.prepare(
      "SELECT * FROM research_runs WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, clientRequestId) as Record<string, unknown> | undefined;
    return record ? this.mapRun(record) : null;
  }

  create(input: {
    clientRequestId: string;
    operation: ResearchOperation;
    value: string;
    consumers: ResearchConsumer[];
  }) {
    const existing = this.byClientRequest(input.clientRequestId);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    this.db.prepare(
      "INSERT INTO research_runs (id,user_id,client_request_id,operation,input_text,provider,status,consumers_json,created_at) VALUES (?,?,?,?,?,'tavily','running',?,?)",
    ).run(id, USER_ID, input.clientRequestId, input.operation, input.value, JSON.stringify(input.consumers), timestamp);
    this.audit("research.run_started", id, {
      operation: input.operation,
      consumers: input.consumers,
    });
    return { ...this.get(id)!, duplicate: false };
  }

  complete(id: string, result: ResearchResult) {
    this.db.transaction(() => {
      this.db.prepare(
        "UPDATE research_runs SET status='completed',provider_request_id=?,answer=?,latency_ms=?,error_code=NULL,completed_at=? WHERE id=? AND status='running'",
      ).run(result.requestId, result.answer, result.latencyMs, result.createdAt, id);
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO research_sources (id,run_id,provider,title,url,summary,source_type,relevance_score,published_at,retrieved_at) VALUES (?,?,'tavily',?,?,?,?,?,?,?)",
      );
      for (const source of result.sources)
        insert.run(randomUUID(), id, source.title, source.url, source.summary, source.sourceType,
          source.relevanceScore, source.publishedAt, source.retrievedAt);
      this.audit("research.run_completed", id, {
        providerRequestId: result.requestId,
        sourceCount: result.sources.length,
      });
    })();
    return this.get(id)!;
  }

  fail(id: string, errorCode: string) {
    const timestamp = now();
    this.db.prepare(
      "UPDATE research_runs SET status='failed',error_code=?,completed_at=? WHERE id=? AND status='running'",
    ).run(errorCode, timestamp, id);
    this.audit("research.run_failed", id, { errorCode });
    return this.get(id)!;
  }

  get(id: string) {
    const record = this.db.prepare(
      "SELECT * FROM research_runs WHERE id=? AND user_id=?",
    ).get(id, USER_ID) as Record<string, unknown> | undefined;
    return record ? this.mapRun(record) : null;
  }

  list(limit = 30) {
    return (this.db.prepare(
      "SELECT * FROM research_runs WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
    ).all(USER_ID, limit) as Array<Record<string, unknown>>).map((record) => this.mapRun(record));
  }
}
