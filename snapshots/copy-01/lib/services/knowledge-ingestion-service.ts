import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  failKnowledgeIngestionSchema,
  finishKnowledgeIngestionSchema,
  queueKnowledgeIngestionSchema,
  startKnowledgeIngestionSchema,
} from "@/lib/domain/knowledge-intelligence";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

function parseJson(value: unknown) {
  try { return JSON.parse(String(value || "{}")) as Record<string, unknown>; } catch { return {}; }
}

function sanitizeErrorCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_.-]/g, "_").slice(0, 80);
}

function sanitizeErrorMessage(value: string) {
  return value
    .replace(/(api[_ -]?key|token|password|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export class KnowledgeIngestionService {
  constructor(private readonly repository: ProfileRepository) {}

  private trustedObject(id: string, type: "source" | "artifact") {
    const row = this.repository.db.prepare(
      "SELECT * FROM knowledge_objects WHERE id=? AND user_id=? AND object_type=? AND archived_at IS NULL",
    ).get(id, USER_ID, type) as Row | undefined;
    if (!row) throw new Error(`KNOWLEDGE_${type.toUpperCase()}_NOT_FOUND`);
    if (!["not_required", "approved"].includes(String(row.approval_status)) || row.validation_status === "invalid") {
      throw new Error("KNOWLEDGE_INGESTION_TRUSTED_SOURCE_REQUIRED");
    }
    return row;
  }

  private run(runId: string) {
    const row = this.repository.db.prepare(
      "SELECT * FROM knowledge_ingestion_runs WHERE id=? AND user_id=?",
    ).get(runId, USER_ID) as Row | undefined;
    if (!row) throw new Error("KNOWLEDGE_INGESTION_NOT_FOUND");
    return row;
  }

  private audit(action: string, runId: string, before: unknown, after: unknown) {
    this.repository.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(randomUUID(), USER_ID, action, "knowledge_ingestion_run", runId, JSON.stringify(before), JSON.stringify(after), now());
  }

  queue(raw: unknown) {
    const input = queueKnowledgeIngestionSchema.parse(raw);
    this.trustedObject(input.sourceId, "source");
    if (input.artifactId) {
      this.trustedObject(input.artifactId, "artifact");
      const artifact = this.repository.db.prepare("SELECT source_id FROM knowledge_artifacts WHERE id=?").get(input.artifactId) as { source_id: string };
      if (artifact.source_id !== input.sourceId) throw new Error("KNOWLEDGE_SOURCE_RELATION_MISMATCH");
    }
    const existing = this.repository.db.prepare(
      "SELECT id FROM knowledge_ingestion_runs WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, runId: existing.id, snapshot: this.snapshot() };

    const id = randomUUID();
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_ingestion_runs (
          id,user_id,client_request_id,source_id,artifact_id,status,attempt_count,max_attempts,
          processing_metadata_json,created_at,updated_at
        ) VALUES (?,?,?,?,?,'queued',0,?,?,?,?)
      `).run(id, USER_ID, input.clientRequestId, input.sourceId, input.artifactId, input.maxAttempts, JSON.stringify(input.processingMetadata), timestamp, timestamp);
      this.audit("knowledge.ingestion_queued", id, null, { status: "queued", sourceId: input.sourceId, artifactId: input.artifactId });
    })();
    return { duplicate: false, runId: id, snapshot: this.snapshot() };
  }

  start(raw: unknown) {
    const input = startKnowledgeIngestionSchema.parse(raw);
    const run = this.run(input.runId);
    if (!["queued", "retry_pending"].includes(String(run.status))) throw new Error("KNOWLEDGE_INGESTION_NOT_STARTABLE");
    if (Number(run.attempt_count) >= Number(run.max_attempts)) throw new Error("KNOWLEDGE_INGESTION_ATTEMPTS_EXHAUSTED");
    const timestamp = now();
    this.repository.db.transaction(() => {
      const changed = this.repository.db.prepare(`
        UPDATE knowledge_ingestion_runs SET status='processing',attempt_count=attempt_count+1,
          processor_name=?,processor_version=?,processing_metadata_json=?,started_at=?,
          last_error_code=NULL,last_error_message=NULL,updated_at=?
        WHERE id=? AND user_id=? AND status IN ('queued','retry_pending') AND attempt_count < max_attempts
      `).run(input.processor.name, input.processor.version, JSON.stringify(input.processor.metadata), timestamp, timestamp, input.runId, USER_ID);
      if (!changed.changes) throw new Error("KNOWLEDGE_INGESTION_NOT_STARTABLE");
      if (run.artifact_id) {
        this.repository.db.prepare(`
          UPDATE knowledge_artifacts SET extraction_status='processing',parser_name=?,parser_version=?,parser_metadata_json=? WHERE id=?
        `).run(input.processor.name, input.processor.version, JSON.stringify(input.processor.metadata), run.artifact_id);
      }
      this.audit("knowledge.ingestion_started", input.runId, { status: run.status }, { status: "processing", attempt: Number(run.attempt_count) + 1 });
    })();
    return { runId: input.runId, snapshot: this.snapshot() };
  }

  finish(raw: unknown) {
    const input = finishKnowledgeIngestionSchema.parse(raw);
    const run = this.run(input.runId);
    if (run.status !== "processing") throw new Error("KNOWLEDGE_INGESTION_NOT_PROCESSING");
    const timestamp = now();
    const merged = { ...parseJson(run.processing_metadata_json), ...input.processingMetadata };
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        UPDATE knowledge_ingestion_runs SET status=?,processing_metadata_json=?,completed_at=?,failed_at=NULL,updated_at=?
        WHERE id=? AND user_id=? AND status='processing'
      `).run(input.outcome, JSON.stringify(merged), timestamp, timestamp, input.runId, USER_ID);
      if (run.artifact_id) {
        this.repository.db.prepare(`
          UPDATE knowledge_artifacts SET extraction_status=?,content_reference=?,content_hash=?,
            parser_metadata_json=?,extracted_at=? WHERE id=?
        `).run(input.outcome, input.contentReference, input.contentHash, JSON.stringify(merged), timestamp, run.artifact_id);
      }
      this.audit("knowledge.ingestion_finished", input.runId, { status: "processing" }, { status: input.outcome });
    })();
    return { runId: input.runId, outcome: input.outcome, snapshot: this.snapshot() };
  }

  fail(raw: unknown) {
    const input = failKnowledgeIngestionSchema.parse(raw);
    const run = this.run(input.runId);
    if (run.status !== "processing") throw new Error("KNOWLEDGE_INGESTION_NOT_PROCESSING");
    const timestamp = now();
    const code = sanitizeErrorCode(input.errorCode);
    const message = sanitizeErrorMessage(input.errorMessage);
    const merged = { ...parseJson(run.processing_metadata_json), ...input.processingMetadata };
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        UPDATE knowledge_ingestion_runs SET status='failed',processing_metadata_json=?,last_error_code=?,
          last_error_message=?,failed_at=?,updated_at=? WHERE id=? AND user_id=? AND status='processing'
      `).run(JSON.stringify(merged), code, message, timestamp, timestamp, input.runId, USER_ID);
      if (run.artifact_id) this.repository.db.prepare("UPDATE knowledge_artifacts SET extraction_status='failed' WHERE id=?").run(run.artifact_id);
      this.audit("knowledge.ingestion_failed", input.runId, { status: "processing" }, { status: "failed", errorCode: code });
    })();
    return { runId: input.runId, recoverable: Number(run.attempt_count) < Number(run.max_attempts), snapshot: this.snapshot() };
  }

  requestRetry(runId: string) {
    const run = this.run(runId);
    if (run.status !== "failed") throw new Error("KNOWLEDGE_INGESTION_NOT_FAILED");
    if (Number(run.attempt_count) >= Number(run.max_attempts)) throw new Error("KNOWLEDGE_INGESTION_ATTEMPTS_EXHAUSTED");
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare("UPDATE knowledge_ingestion_runs SET status='retry_pending',retry_requested_at=?,updated_at=? WHERE id=? AND user_id=? AND status='failed'")
        .run(timestamp, timestamp, runId, USER_ID);
      if (run.artifact_id) this.repository.db.prepare("UPDATE knowledge_artifacts SET extraction_status='pending' WHERE id=?").run(run.artifact_id);
      this.audit("knowledge.ingestion_retry_requested", runId, { status: "failed" }, { status: "retry_pending" });
    })();
    return { runId, snapshot: this.snapshot() };
  }

  snapshot() {
    return (this.repository.db.prepare(
      "SELECT * FROM knowledge_ingestion_runs WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[]).map((row) => ({
      id: String(row.id), sourceId: String(row.source_id), artifactId: row.artifact_id ? String(row.artifact_id) : null,
      status: String(row.status), attemptCount: Number(row.attempt_count), maxAttempts: Number(row.max_attempts),
      processor: row.processor_name ? { name: String(row.processor_name), version: String(row.processor_version), metadata: parseJson(row.processing_metadata_json) } : null,
      lastError: row.last_error_code ? { code: String(row.last_error_code), message: String(row.last_error_message) } : null,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }));
  }
}
