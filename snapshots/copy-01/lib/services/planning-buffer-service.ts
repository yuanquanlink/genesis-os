import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import { contentHash } from "@/lib/domain/fingerprint";
import {
  planningCandidateInputSchema,
  planningCandidateTransitionSchema,
  type PlanningCandidateApprovalState,
  type PlanningCandidateStatus,
} from "@/lib/domain/planning-buffer";

const OWNER_ID = "genesis-owner";
type Row = Record<string, unknown>;

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function statusOf(value: unknown): PlanningCandidateStatus {
  if (value === "analyzing" || value === "candidate_plan_ready" || value === "approved" || value === "archived") return value;
  return "captured";
}

function approvalOf(value: unknown): PlanningCandidateApprovalState {
  return value === "approved" ? "approved" : "pending";
}

export class PlanningBufferService {
  constructor(private readonly repository: ProfileRepository) {}

  private map(row: Row) {
    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description),
      source: String(row.source),
      category: String(row.category),
      status: statusOf(row.status),
      approvalState: approvalOf(row.approval_state),
      provenance: parseJson<Record<string, unknown>>(row.provenance_json, {}),
      contextEligible: Boolean(row.context_eligible),
      formalMutationAllowed: Boolean(row.formal_mutation_allowed),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      approvedAt: row.approved_at ? String(row.approved_at) : null,
      archivedAt: row.archived_at ? String(row.archived_at) : null,
    };
  }

  snapshot() {
    const rows = this.repository.db.prepare(`SELECT * FROM planning_candidates
      WHERE owner_id=?
      ORDER BY CASE status WHEN 'captured' THEN 0 WHEN 'candidate_plan_ready' THEN 1 WHEN 'analyzing' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,
      created_at DESC LIMIT 150`).all(OWNER_ID) as Row[];
    const candidates = rows.map((row) => this.map(row));
    return {
      candidates,
      counts: {
        active: candidates.filter((item) => item.status !== "archived").length,
        captured: candidates.filter((item) => item.status === "captured").length,
        approved: candidates.filter((item) => item.status === "approved").length,
        archived: candidates.filter((item) => item.status === "archived").length,
      },
      boundary: {
        candidateOnly: true,
        contextEligible: false,
        formalMutationAllowed: false,
        conversionAvailable: false,
      },
    };
  }

  capture(raw: unknown) {
    const input = planningCandidateInputSchema.parse(raw);
    const existing = this.repository.db.prepare("SELECT id FROM planning_candidates WHERE owner_id=? AND client_request_id=?")
      .get(OWNER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, candidateId: existing.id, snapshot: this.snapshot() };

    const id = randomUUID();
    const createdAt = now();
    const provenance = {
      source: input.source,
      capturedBy: "owner",
      capturedAt: createdAt,
      clientRequestId: input.clientRequestId,
      trustClass: "owner_authored_candidate",
    };
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO planning_candidates
        (id,owner_id,client_request_id,title,description,source,category,status,approval_state,provenance_json,
         content_hash,context_eligible,formal_mutation_allowed,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'captured','pending',?,?,0,0,?,?)`)
        .run(id, OWNER_ID, input.clientRequestId, input.title, input.description, input.source, input.category,
          JSON.stringify(provenance), contentHash(`${input.title}\n${input.description}`), createdAt, createdAt);
      this.repository.db.prepare(`INSERT INTO planning_candidate_events
        (id,owner_id,planning_candidate_id,action,from_status,to_status,client_request_id,provenance_json,created_at)
        VALUES (?,?,?,'captured',NULL,'captured',?,?,?)`)
        .run(randomUUID(), OWNER_ID, id, input.clientRequestId, JSON.stringify(provenance), createdAt);
      this.audit("planning_buffer.captured", id, null, { status: "captured", category: input.category, source: input.source }, createdAt);
    })();
    return { duplicate: false, candidateId: id, snapshot: this.snapshot() };
  }

  transition(raw: unknown) {
    const input = planningCandidateTransitionSchema.parse(raw);
    const duplicate = this.repository.db.prepare("SELECT planning_candidate_id FROM planning_candidate_events WHERE owner_id=? AND client_request_id=?")
      .get(OWNER_ID, input.clientRequestId) as { planning_candidate_id: string } | undefined;
    if (duplicate) return { duplicate: true, candidateId: duplicate.planning_candidate_id, snapshot: this.snapshot() };

    const current = this.repository.db.prepare("SELECT * FROM planning_candidates WHERE id=? AND owner_id=?").get(input.id, OWNER_ID) as Row | undefined;
    if (!current) throw new Error("PLANNING_CANDIDATE_NOT_FOUND");
    const from = statusOf(current.status);
    const transition = this.resolveTransition(from, input.action, current.approved_at ? String(current.approved_at) : null);
    const at = now();
    const provenance = {
      action: input.action,
      decidedBy: "owner",
      decidedAt: at,
      priorStatus: from,
      noFormalProjection: true,
    };

    this.repository.db.transaction(() => {
      const result = this.repository.db.prepare(`UPDATE planning_candidates SET
        status=?, approval_state=?, approved_at=?, archived_at=?, updated_at=?
        WHERE id=? AND owner_id=? AND status=?`)
        .run(transition.status, transition.approvalState, transition.approvedAt, transition.archivedAt, at, input.id, OWNER_ID, from);
      if (!result.changes) throw new Error("PLANNING_CANDIDATE_INVALID_TRANSITION");
      this.repository.db.prepare(`INSERT INTO planning_candidate_events
        (id,owner_id,planning_candidate_id,action,from_status,to_status,client_request_id,provenance_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(randomUUID(), OWNER_ID, input.id, transition.eventAction, from, transition.status, input.clientRequestId, JSON.stringify(provenance), at);
      this.audit(`planning_buffer.${transition.eventAction}`, input.id, { status: from }, {
        status: transition.status,
        approvalState: transition.approvalState,
        formalProjectionCreated: false,
      }, at);
    })();
    return { duplicate: false, candidateId: input.id, snapshot: this.snapshot() };
  }

  private resolveTransition(from: PlanningCandidateStatus, action: "approve" | "archive" | "reopen", currentApprovedAt: string | null) {
    if (action === "approve" && (from === "captured" || from === "candidate_plan_ready")) {
      const at = now();
      return { status: "approved" as const, approvalState: "approved" as const, approvedAt: at, archivedAt: null, eventAction: "approved" as const };
    }
    if (action === "archive" && from !== "archived") {
      return {
        status: "archived" as const,
        approvalState: approvalOf(from === "approved" ? "approved" : "pending"),
        approvedAt: from === "approved" ? currentApprovedAt : null,
        archivedAt: now(),
        eventAction: "archived" as const,
      };
    }
    if (action === "reopen" && from === "archived") {
      return { status: "captured" as const, approvalState: "pending" as const, approvedAt: null, archivedAt: null, eventAction: "reopened" as const };
    }
    throw new Error("PLANNING_CANDIDATE_INVALID_TRANSITION");
  }

  private audit(action: string, entityId: string, before: unknown, after: unknown, createdAt: string) {
    this.repository.db.prepare(`INSERT INTO audit_logs
      (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), OWNER_ID, action, "planning_candidate", entityId,
        before === null ? null : JSON.stringify(before), JSON.stringify(after), createdAt);
  }
}
