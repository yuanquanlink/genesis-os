import { approvedContextControlActionSchema, type ContextProjectionSourceDomain } from "@/lib/domain/approved-context-projection";
import type { ProfileRepository } from "@/lib/db/repository";
import { ApprovedContextProjectionService } from "@/lib/services/approved-context-projection-service";
import { ApprovedContextReadService } from "@/lib/services/approved-context-read-service";

const OWNER = "genesis-owner";
type Row = Record<string, unknown>;

export type ApprovedContextControlSource = {
  id: string;
  domain: "goal" | "strategy" | "mission" | "daily_plan";
  title: string;
  truthStatus: string;
  projection: { id: string; freshness: string; projectedAt: string } | null;
};

export class ApprovedContextControlService {
  constructor(private readonly repository: ProfileRepository, private readonly ownerId = OWNER) {}

  snapshot() {
    const db = this.repository.db;
    const rows: Array<Omit<ApprovedContextControlSource, "projection">> = [];
    for (const item of db.prepare("SELECT id,title,status FROM learning_goals WHERE user_id=? AND data_kind='user' AND status IN ('active','completed') AND deleted_at IS NULL ORDER BY updated_at DESC").all(this.ownerId) as Row[]) {
      rows.push({ id: String(item.id), domain: "goal", title: String(item.title), truthStatus: String(item.status) });
    }
    for (const item of db.prepare(`SELECT strategy.id,strategy.strategies_json,candidate.created_at
      FROM growth_strategies strategy JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id AND candidate.user_id=strategy.user_id
      WHERE strategy.user_id=? AND candidate.status='approved' ORDER BY candidate.created_at DESC`).all(this.ownerId) as Row[]) {
      const parsed = this.parseObject(item.strategies_json);
      const title = this.text((parsed.d30 as Record<string, unknown> | undefined)?.goal ?? (parsed.d7 as Record<string, unknown> | undefined)?.goal ?? "已批准战略");
      rows.push({ id: String(item.id), domain: "strategy", title, truthStatus: "approved" });
    }
    for (const item of db.prepare(`SELECT mission.id,mission.title,mission.status FROM missions mission
      JOIN mission_candidates candidate ON candidate.id=mission.source_candidate_id AND candidate.user_id=mission.user_id
      WHERE mission.user_id=? AND candidate.status='approved' AND mission.status IN ('active','completed') ORDER BY mission.created_at DESC`).all(this.ownerId) as Row[]) {
      rows.push({ id: String(item.id), domain: "mission", title: String(item.title), truthStatus: String(item.status) });
    }
    for (const item of db.prepare(`SELECT plan.id,plan.status,plan.plan_json FROM daily_plans plan
      JOIN daily_plan_candidates candidate ON candidate.id=plan.source_candidate_id AND candidate.user_id=plan.user_id
      WHERE plan.user_id=? AND candidate.status='approved' AND plan.status IN ('active','completed') ORDER BY plan.plan_date DESC`).all(this.ownerId) as Row[]) {
      rows.push({ id: String(item.id), domain: "daily_plan", title: this.text(this.parseObject(item.plan_json).title ?? "已批准今日计划"), truthStatus: String(item.status) });
    }
    const projected = new Map(new ApprovedContextReadService(this.repository, this.ownerId).read("daily_operation").items.map((item) => [`${item.sourceDomain}:${item.sourceRecordId}`, item]));
    return {
      purpose: "daily_operation" as const,
      sources: rows.map((item) => {
        const projection = projected.get(`${item.domain}:${item.id}`);
        return { ...item, projection: projection ? { id: projection.projectionId, freshness: projection.freshness, projectedAt: projection.projectedAt } : null };
      }),
      boundary: "这里只列出经所有者批准的正式来源；预览、授权与确认仍是相互独立的所有者操作。",
    };
  }

  execute(raw: unknown) {
    const input = approvedContextControlActionSchema.parse(raw);
    const allowedDomains: ContextProjectionSourceDomain[] = ["goal", "strategy", "mission", "daily_plan"];
    if (input.action === "preview" || input.action === "authorize") {
      if (!allowedDomains.includes(input.sourceDomain)) throw new Error("APPROVED_CONTEXT_DAILY_SOURCE_NOT_SUPPORTED");
    } else if (input.action === "confirm") {
      const row = this.repository.db.prepare("SELECT source_domain,context_purpose FROM approved_context_projection_authorizations WHERE id=? AND user_id=?").get(input.authorizationId, this.ownerId) as Row | undefined;
      if (!row || row.context_purpose !== "daily_operation" || !allowedDomains.includes(row.source_domain as ContextProjectionSourceDomain)) throw new Error("APPROVED_CONTEXT_DAILY_AUTHORIZATION_REQUIRED");
    } else {
      const row = this.repository.db.prepare("SELECT source_domain,context_purpose FROM approved_context_projections WHERE id=? AND user_id=?").get(input.projectionId, this.ownerId) as Row | undefined;
      if (!row || row.context_purpose !== "daily_operation" || !allowedDomains.includes(row.source_domain as ContextProjectionSourceDomain)) throw new Error("APPROVED_CONTEXT_DAILY_PROJECTION_REQUIRED");
    }
    const projection = new ApprovedContextProjectionService(this.repository, this.ownerId);
    if (input.action === "preview") return { preview: projection.preview({ sourceDomain: input.sourceDomain, sourceRecordId: input.sourceRecordId, purpose: "daily_operation" }), snapshot: this.snapshot() };
    if (input.action === "authorize") return { authorization: projection.authorize({ ...input, purpose: "daily_operation", actor: this.ownerId }), snapshot: this.snapshot() };
    if (input.action === "confirm") return { confirmation: projection.confirm({ authorizationId: input.authorizationId, actor: this.ownerId, clientRequestId: input.clientRequestId }), snapshot: this.snapshot() };
    return { revocation: projection.revoke({ projectionId: input.projectionId, reason: input.reason, actor: this.ownerId, clientRequestId: input.clientRequestId }), snapshot: this.snapshot() };
  }

  private parseObject(value: unknown): Record<string, unknown> {
    try { const parsed = JSON.parse(String(value ?? "{}")); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
    catch { return {}; }
  }

  private text(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 300) || "已批准来源"; }
}
