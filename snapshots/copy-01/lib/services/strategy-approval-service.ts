import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import { strategySchema } from "@/lib/domain/strategy";

const USER_ID = "genesis-owner";
const ACTOR = "genesis-owner";
const now = () => new Date().toISOString();
type CandidateRow = Record<string, unknown>;

export class StrategyApprovalService {
  constructor(private readonly repository: ProfileRepository) {}

  approveCandidate(candidateId: string) {
    const db = this.repository.db;
    return db.transaction(() => {
      const candidate = db.prepare("SELECT * FROM strategy_candidates WHERE id=? AND user_id=?").get(candidateId, USER_ID) as CandidateRow | undefined;
      if (!candidate) throw new Error("STRATEGY_CANDIDATE_NOT_FOUND");
      if (candidate.status !== "pending") throw new Error("STRATEGY_CANDIDATE_ALREADY_DECIDED");

      let generated: unknown;
      try { generated = JSON.parse(String(candidate.generated_strategy_json)); } catch { throw new Error("STRATEGY_CANDIDATE_INVALID"); }
      const data = strategySchema.parse(generated);
      const approvedAt = now();
      const strategyId = randomUUID();
      const transition = db.prepare("UPDATE strategy_candidates SET status='approved',decided_at=?,approved_at=?,approved_by=? WHERE id=? AND user_id=? AND status='pending'")
        .run(approvedAt, approvedAt, ACTOR, candidateId, USER_ID);
      if (!transition.changes) throw new Error("STRATEGY_CANDIDATE_ALREADY_DECIDED");

      const diagnosis = {
        currentPosition: data.currentPosition,
        targetPosition: data.targetPosition,
        opportunity: data.opportunity,
        risk: data.risk,
        priorityRanking: data.priorityRanking,
        abilityGaps: data.abilityGaps,
        candidateId,
      };
      db.prepare("INSERT INTO growth_strategies (id,user_id,period_key,client_request_id,diagnosis_json,strategies_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,fallback_reason,created_at,source_candidate_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(strategyId, USER_ID, `approved:${approvedAt.slice(0, 10)}`, `candidate:${candidateId}`, JSON.stringify(diagnosis), JSON.stringify(data.plans), candidate.evidence_ids_json, data.confidence, candidate.provider, candidate.model, candidate.model_mode, candidate.prompt_version, candidate.fallback_reason, approvedAt, candidateId);
      db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(randomUUID(), USER_ID, "strategy.candidate_approved", "strategy_candidate", candidateId, JSON.stringify({ status: "pending" }), JSON.stringify({ status: "approved", strategyId, approvedBy: ACTOR }), approvedAt);
      return { strategyId, candidateId, approvedAt, approvedBy: ACTOR };
    })();
  }

  rejectCandidate(candidateId: string, rejectReason: string) {
    const db = this.repository.db;
    return db.transaction(() => {
      const candidate = db.prepare("SELECT status FROM strategy_candidates WHERE id=? AND user_id=?").get(candidateId, USER_ID) as { status: string } | undefined;
      if (!candidate) throw new Error("STRATEGY_CANDIDATE_NOT_FOUND");
      if (candidate.status !== "pending") throw new Error("STRATEGY_CANDIDATE_NOT_PENDING");
      const rejectedAt = now();
      const changed = db.prepare("UPDATE strategy_candidates SET status='rejected',decided_at=?,rejected_at=?,rejected_by=?,reject_reason=? WHERE id=? AND user_id=? AND status='pending'")
        .run(rejectedAt, rejectedAt, ACTOR, rejectReason, candidateId, USER_ID);
      if (!changed.changes) throw new Error("STRATEGY_CANDIDATE_NOT_PENDING");
      db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(randomUUID(), USER_ID, "strategy.candidate_rejected", "strategy_candidate", candidateId, JSON.stringify({ status: "pending" }), JSON.stringify({ status: "rejected", rejectedBy: ACTOR, rejectReason }), rejectedAt);
      return { candidateId, rejectedAt, rejectedBy: ACTOR, rejectReason };
    })();
  }
}
