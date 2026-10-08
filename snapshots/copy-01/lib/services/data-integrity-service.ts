import { randomUUID } from "node:crypto";
import { dailyPlanSchema } from "@/lib/domain/personal-operating";
import { memoryCandidateSchema } from "@/lib/domain/personal-memory";
import { missionCandidateSchema } from "@/lib/domain/mission";
import { strategySchema } from "@/lib/domain/strategy";
import type { IntegrityIssue, IntegrityIssueKind, IntegritySnapshot } from "@/lib/domain/data-integrity";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
const ACTOR = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

const parse = (value: unknown) => {
  try { return JSON.parse(String(value)); } catch { return undefined; }
};
const unique = <T>(values: T[]) => [...new Set(values)];

/**
 * Reports cross-module integrity issues without granting the service authority
 * over approved growth data. The only write path rejects invalid non-formal
 * candidates or sends pending evidence back to manual review.
 */
export class DataIntegrityService {
  constructor(private readonly repository: ProfileRepository) {}

  private candidateIssues(
    table: "strategy_candidates" | "mission_candidates" | "memory_candidates" | "daily_plan_candidates",
    entityType: IntegrityIssue["entityType"],
    status: string,
    jsonColumn: string,
    validate: (value: unknown) => { success: boolean },
  ) {
    const rows = this.repository.db.prepare(`SELECT id,${jsonColumn} AS payload FROM ${table} WHERE user_id=? AND status=? ORDER BY created_at ASC`).all(USER_ID, status) as Row[];
    return rows.flatMap((row) => validate(parse(row.payload)).success ? [] : [{
      id: `invalid:${table}:${String(row.id)}`,
      kind: "invalid_candidate" as const,
      entityType,
      entityId: String(row.id),
      detail: "Candidate payload no longer passes its current schema and is excluded from approval.",
      repairable: true,
    }]);
  }

  private duplicateIssues(
    table: "strategy_candidates" | "mission_candidates" | "memory_candidates" | "daily_plan_candidates",
    entityType: IntegrityIssue["entityType"],
    status: string,
    jsonColumn: string,
    additionalKey = "",
  ) {
    const rows = this.repository.db.prepare(`SELECT id,${jsonColumn} AS payload${additionalKey ? `,${additionalKey} AS group_key` : ""} FROM ${table} WHERE user_id=? AND status=? ORDER BY created_at ASC,id ASC`).all(USER_ID, status) as Row[];
    const keepers = new Map<string, string>();
    return rows.flatMap((row) => {
      const key = `${String(row.group_key || "")}:${JSON.stringify(parse(row.payload) ?? String(row.payload))}`;
      const keeper = keepers.get(key);
      if (!keeper) { keepers.set(key, String(row.id)); return []; }
      return [{
        id: `duplicate:${table}:${String(row.id)}`,
        kind: "duplicate_candidate" as const,
        entityType,
        entityId: String(row.id),
        detail: `Duplicates pending candidate ${keeper}; the older candidate is retained.`,
        repairable: true,
      }];
    });
  }

  snapshot(): IntegritySnapshot {
    const db = this.repository.db;
    const issues: IntegrityIssue[] = [
      ...this.candidateIssues("strategy_candidates", "strategy_candidate", "pending", "generated_strategy_json", strategySchema.safeParse),
      ...this.candidateIssues("mission_candidates", "mission_candidate", "candidate", "mission_json", missionCandidateSchema.safeParse),
      ...this.candidateIssues("memory_candidates", "memory_candidate", "pending", "candidate_json", memoryCandidateSchema.safeParse),
      ...this.candidateIssues("daily_plan_candidates", "daily_plan_candidate", "candidate", "plan_json", dailyPlanSchema.safeParse),
      ...this.duplicateIssues("strategy_candidates", "strategy_candidate", "pending", "generated_strategy_json"),
      ...this.duplicateIssues("mission_candidates", "mission_candidate", "candidate", "mission_json", "strategy_id"),
      ...this.duplicateIssues("memory_candidates", "memory_candidate", "pending", "candidate_json"),
      ...this.duplicateIssues("daily_plan_candidates", "daily_plan_candidate", "candidate", "plan_json", "plan_date"),
    ];

    const missingKnowledge = db.prepare("SELECT id,source_knowledge_ids_json FROM memory_candidates WHERE user_id=? AND status='pending'").all(USER_ID) as Row[];
    for (const row of missingKnowledge) {
      const ids = unique(Array.isArray(parse(row.source_knowledge_ids_json)) ? parse(row.source_knowledge_ids_json).map(String) : []);
      const found = ids.length ? Number((db.prepare(`SELECT count(*) AS count FROM knowledge_items WHERE user_id=? AND id IN (${ids.map(() => "?").join(",")})`).get(USER_ID, ...ids) as { count: number }).count) : 0;
      if (!ids.length || found !== ids.length) issues.push({ id: `orphan:memory:${String(row.id)}`, kind: "orphan_candidate_source", entityType: "memory_candidate", entityId: String(row.id), detail: "Pending memory candidate references missing Knowledge Base source(s).", repairable: true });
    }

    const evidenceWithoutSource = db.prepare("SELECT evidence.id FROM evidence_items evidence LEFT JOIN evidence_item_sources source ON source.evidence_item_id=evidence.id WHERE evidence.user_id=? AND evidence.verification_status='pending' GROUP BY evidence.id HAVING count(source.id)=0").all(USER_ID) as Row[];
    for (const row of evidenceWithoutSource) issues.push({ id: `orphan:evidence:${String(row.id)}`, kind: "orphan_evidence_source", entityType: "evidence", entityId: String(row.id), detail: "Pending Evidence has no persisted source link and needs manual review.", repairable: true });

    const formalRows = (entityType: "strategy" | "mission" | "memory", rows: unknown[]) => rows.map((row) => ({ entityType, id: String((row as Row).id) }));
    const formalWarnings = [
      ...formalRows("strategy", db.prepare("SELECT strategy.id FROM growth_strategies strategy LEFT JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id WHERE strategy.user_id=? AND candidate.status!='approved'").all(USER_ID)),
      ...formalRows("mission", db.prepare("SELECT mission.id FROM missions mission LEFT JOIN mission_candidates candidate ON candidate.id=mission.source_candidate_id WHERE mission.user_id=? AND mission.status IN ('active','completed') AND candidate.status!='approved'").all(USER_ID)),
      ...formalRows("memory", db.prepare("SELECT memory.id FROM user_memory_profile memory LEFT JOIN memory_candidates candidate ON candidate.id=memory.source_candidate_id WHERE memory.user_id=? AND memory.status='active' AND candidate.status!='approved'").all(USER_ID)),
    ];
    for (const row of formalWarnings) issues.push({ id: `formal:${String(row.entityType)}:${String(row.id)}`, kind: "formal_reference_warning", entityType: row.entityType, entityId: String(row.id), detail: "Formal record provenance is inconsistent. Genesis will not modify it automatically; inspect audit history.", repairable: false });

    const completedWithoutEvidence = db.prepare("SELECT mission.id FROM missions mission LEFT JOIN mission_evidence link ON link.mission_id=mission.id WHERE mission.user_id=? AND mission.status='completed' GROUP BY mission.id HAVING count(link.id)=0").all(USER_ID) as Row[];
    for (const row of completedWithoutEvidence) issues.push({ id: `orphan:mission:${String(row.id)}`, kind: "formal_reference_warning", entityType: "mission", entityId: String(row.id), detail: "Completed Mission has no linked Evidence record; it cannot be treated as verified delivery.", repairable: false });

    const summary = Object.fromEntries((["invalid_candidate", "duplicate_candidate", "orphan_candidate_source", "orphan_evidence_source", "formal_reference_warning"] as IntegrityIssueKind[]).map((kind) => [kind, issues.filter((issue) => issue.kind === kind).length])) as IntegritySnapshot["summary"];
    const candidateSets: Array<["strategy_candidates" | "mission_candidates" | "memory_candidates" | "daily_plan_candidates", IntegrityIssue["entityType"], string]> = [
      ["strategy_candidates", "strategy_candidate", "pending"],
      ["mission_candidates", "mission_candidate", "candidate"],
      ["memory_candidates", "memory_candidate", "pending"],
      ["daily_plan_candidates", "daily_plan_candidate", "candidate"],
    ];
    const cutoff = Date.now() - 7 * 86_400_000;
    const pendingCandidates = candidateSets.map(([table, entityType, status]) => {
      const rows = db.prepare(`SELECT created_at FROM ${table} WHERE user_id=? AND status=? ORDER BY created_at ASC`).all(USER_ID, status) as Row[];
      const dated = rows.map((row) => String(row.created_at)).filter((value) => Number.isFinite(Date.parse(value)));
      return { entityType, total: rows.length, olderThanSevenDays: dated.filter((value) => Date.parse(value) < cutoff).length, oldestCreatedAt: dated[0] || null };
    }).filter((item) => item.total > 0).sort((left, right) => right.olderThanSevenDays - left.olderThanSevenDays || right.total - left.total);
    return {
      generatedAt: now(),
      issues,
      summary,
      pendingCandidates,
      safetyNote: "Preview is read-only. Apply only rejects invalid or duplicate non-formal candidates and marks pending source-less Evidence as needs_review. Approved Goal, Ability, Evidence, Strategy, Mission, and Memory records are never changed.",
    };
  }

  apply() {
    const preview = this.snapshot();
    const timestamp = now();
    const repaired = { rejectedCandidates: 0, evidenceMarkedNeedsReview: 0 };
    this.repository.db.transaction(() => {
      for (const issue of preview.issues.filter((item) => item.repairable)) {
        if (issue.entityType === "evidence") {
          const result = this.repository.db.prepare("UPDATE evidence_items SET verification_status='needs_review',updated_at=? WHERE id=? AND user_id=? AND verification_status='pending'").run(timestamp, issue.entityId, USER_ID);
          repaired.evidenceMarkedNeedsReview += result.changes;
          continue;
        }
        const table = issue.entityType === "strategy_candidate" ? "strategy_candidates" : issue.entityType === "mission_candidate" ? "mission_candidates" : issue.entityType === "memory_candidate" ? "memory_candidates" : "daily_plan_candidates";
        const pendingStatus = table === "strategy_candidates" || table === "memory_candidates" ? "pending" : "candidate";
        const result = this.repository.db.prepare(`UPDATE ${table} SET status='rejected',rejected_at=?,rejected_by=?,reject_reason=? WHERE id=? AND user_id=? AND status=?`).run(timestamp, ACTOR, "Rejected by confirmed data-integrity cleanup; inspect the retained audit record.", issue.entityId, USER_ID, pendingStatus);
        repaired.rejectedCandidates += result.changes;
      }
      this.repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, "data_integrity.nonformal_repaired", "integrity_report", USER_ID, JSON.stringify(preview.summary), JSON.stringify(repaired), timestamp);
    })();
    return { preview, repaired, snapshot: this.snapshot() };
  }
}
