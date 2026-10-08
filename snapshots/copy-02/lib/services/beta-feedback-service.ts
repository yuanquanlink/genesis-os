import { randomUUID } from "node:crypto";
import { betaFeedbackInputSchema, betaFeedbackTransitionSchema } from "@/lib/domain/beta-feedback";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;

type FeedbackStatus = "pending" | "reviewed" | "resolved";
const statusOf = (value: unknown): FeedbackStatus => value === "reviewed" || value === "resolved" ? value : "pending";

export class BetaFeedbackService {
  constructor(private readonly repository: ProfileRepository) {}

  snapshot() {
    const feedback = this.repository.db.prepare("SELECT id,feedback_type,content,status,created_at,reviewed_at,resolved_at FROM beta_feedback WHERE user_id=? ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'reviewed' THEN 1 ELSE 2 END,created_at DESC LIMIT 30").all(USER_ID) as Row[];
    return { feedback: feedback.map((row) => ({
      id: String(row.id),
      feedbackType: String(row.feedback_type) as "issue" | "suggestion" | "difficulty",
      content: String(row.content),
      status: statusOf(row.status),
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    })) };
  }

  submit(raw: unknown) {
    const input = betaFeedbackInputSchema.parse(raw);
    const existing = this.repository.db.prepare("SELECT id FROM beta_feedback WHERE user_id=? AND client_request_id=?").get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, feedbackId: existing.id, snapshot: this.snapshot() };

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.repository.db.prepare("INSERT INTO beta_feedback (id,user_id,client_request_id,feedback_type,content,status,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(id, USER_ID, input.clientRequestId, input.feedbackType, input.content, "pending", createdAt);
    this.repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(randomUUID(), USER_ID, "beta.feedback_recorded", "beta_feedback", id, null, JSON.stringify({ feedbackType: input.feedbackType }), createdAt);
    return { duplicate: false, feedbackId: id, snapshot: this.snapshot() };
  }

  transition(raw: unknown) {
    const input = betaFeedbackTransitionSchema.parse(raw);
    const current = this.repository.db.prepare("SELECT id,status FROM beta_feedback WHERE id=? AND user_id=?").get(input.id, USER_ID) as Row | undefined;
    if (!current) throw new Error("Beta feedback was not found.");
    const from = statusOf(current.status);
    if (from === input.status) return { duplicate: true, feedbackId: input.id, snapshot: this.snapshot() };
    if (!((from === "pending" && input.status === "reviewed") || (from === "reviewed" && input.status === "resolved")))
      throw new Error("Beta feedback status cannot move backward or skip review.");

    const at = new Date().toISOString();
    this.repository.db.transaction(() => {
      const changes = input.status === "reviewed"
        ? this.repository.db.prepare("UPDATE beta_feedback SET status='reviewed',reviewed_at=? WHERE id=? AND user_id=? AND status='pending'").run(at, input.id, USER_ID).changes
        : this.repository.db.prepare("UPDATE beta_feedback SET status='resolved',resolved_at=? WHERE id=? AND user_id=? AND status='reviewed'").run(at, input.id, USER_ID).changes;
      if (!changes) throw new Error("Beta feedback status changed before this update could be applied.");
      this.repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(randomUUID(), USER_ID, "beta.feedback_status_changed", "beta_feedback", input.id, JSON.stringify({ status: from }), JSON.stringify({ status: input.status }), at);
    })();
    return { duplicate: false, feedbackId: input.id, snapshot: this.snapshot() };
  }
}
