import { randomUUID } from "node:crypto";
import path from "node:path";
import { ProfileRepository } from "../lib/db/repository";

const dbPath = path.resolve(process.cwd(), process.env.GENESIS_DB_PATH || "./data/genesis.db");
const repository = new ProfileRepository(dbPath);
const apply = process.argv.includes("--apply-nonformal");

type DuplicateGroup = { fingerprint: string; count: number; ids: string; keeper_id: string };
const entryGroups = repository.db.prepare(`
  SELECT normalized_content_hash fingerprint, count(*) count, group_concat(id) ids,
         (SELECT e2.id FROM self_entries e2 WHERE e2.user_id=e.user_id AND e2.normalized_content_hash=e.normalized_content_hash AND e2.deleted_at IS NULL ORDER BY e2.created_at,e2.id LIMIT 1) keeper_id
  FROM self_entries e WHERE deleted_at IS NULL AND normalized_content_hash IS NOT NULL
  GROUP BY user_id,normalized_content_hash HAVING count(*)>1
`).all() as DuplicateGroup[];
const proposalGroups = repository.db.prepare(`
  SELECT fact_type||':'||canonical_value fingerprint, count(*) count, group_concat(id) ids,
         (SELECT p2.id FROM profile_update_proposals p2 WHERE p2.user_id=p.user_id AND p2.fact_type=p.fact_type AND p2.canonical_value=p.canonical_value AND p2.deleted_at IS NULL ORDER BY p2.created_at,p2.id LIMIT 1) keeper_id
  FROM profile_update_proposals p WHERE deleted_at IS NULL AND canonical_value IS NOT NULL
  GROUP BY user_id,fact_type,canonical_value HAVING count(*)>1
`).all() as DuplicateGroup[];
const factGroups = repository.db.prepare(`
  SELECT fact_type||':'||canonical_value fingerprint, count(*) count, group_concat(id) ids,
         (SELECT f2.id FROM profile_facts f2 WHERE f2.user_id=f.user_id AND f2.fact_type=f.fact_type AND f2.canonical_value=f.canonical_value ORDER BY f2.created_at,f2.id LIMIT 1) keeper_id
  FROM profile_facts f WHERE canonical_value IS NOT NULL
  GROUP BY user_id,fact_type,canonical_value HAVING count(*)>1
`).all() as DuplicateGroup[];

const report = {
  mode: apply ? "apply-nonformal" : "preview-only",
  database: dbPath,
  duplicateEntries: entryGroups,
  duplicateCandidates: proposalGroups,
  duplicateFormalFacts: factGroups,
  formalFactsChanged: 0,
  note: apply
    ? "已标记重复原始输入并合并非正式候选证据；正式画像仅报告、未自动修改。"
    : "预览模式未修改任何数据。确认后使用 npm run data:cleanup -- --apply-nonformal。正式画像始终只报告。",
};

if (apply) {
  const timestamp = new Date().toISOString();
  repository.db.transaction(() => {
    for (const group of entryGroups) {
      const ids = group.ids.split(",").filter((id) => id !== group.keeper_id);
      for (const id of ids) {
        repository.db.prepare("UPDATE self_entries SET status='duplicate',duplicate_of_entry_id=?,archived_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL")
          .run(group.keeper_id, timestamp, timestamp, id);
        repository.db.prepare("UPDATE life_events SET hidden_at=? WHERE source_type='self_entry' AND source_id=?").run(timestamp, id);
      }
    }
    for (const group of proposalGroups) {
      const ids = group.ids.split(",").filter((id) => id !== group.keeper_id);
      for (const id of ids) {
        const proposal = repository.db.prepare("SELECT status FROM profile_update_proposals WHERE id=?").get(id) as { status: string } | undefined;
        if (!proposal || proposal.status === "approved") continue;
        repository.db.prepare(`INSERT OR IGNORE INTO profile_proposal_evidence
          (id,proposal_id,source_entry_id,evidence_excerpt,evidence_hash,confidence,created_at)
          SELECT lower(hex(randomblob(16))),?,source_entry_id,evidence_excerpt,evidence_hash,confidence,created_at FROM profile_proposal_evidence WHERE proposal_id=?`)
          .run(group.keeper_id, id);
        repository.db.prepare("UPDATE profile_update_proposals SET deleted_at=? WHERE id=?").run(timestamp, id);
      }
      repository.db.prepare("UPDATE profile_update_proposals SET evidence_count=(SELECT count(*) FROM profile_proposal_evidence WHERE proposal_id=?) WHERE id=?")
        .run(group.keeper_id, group.keeper_id);
    }
    repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(randomUUID(), "genesis-owner", "duplicate_cleanup.nonformal_applied", "database", "genesis-owner", JSON.stringify({ entryGroups: entryGroups.length, proposalGroups: proposalGroups.length, factGroups: factGroups.length }), JSON.stringify({ formalFactsChanged: 0 }), timestamp);
  })();
}

console.log(JSON.stringify(report, null, 2));
repository.close();
