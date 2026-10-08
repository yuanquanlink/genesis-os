import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ProfileCandidate, SelfEntryInput } from "@/lib/domain/profile";
import { canonicalProfileValue, contentHash, profileFingerprint, textSimilarity } from "@/lib/domain/fingerprint";
import { PROFILE_EXTRACTOR_PROMPT_VERSION } from "@/lib/ai/prompt-versions";

const USER_ID = "genesis-owner";
const CONTENT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export type ProposalRecord = {
  id: string; sourceEntryId: string; proposedContent: string; factType: string;
  evidenceExcerpt: string; confidence: number; possibleImpact: string;
  status: "pending" | "approved" | "rejected"; modelMode: "demo" | "real" | "openai"; provider: string;
  evidenceCount: number; createdAt: string;
};

export type EvidenceRecord = { id: string; sourceEntryId: string; excerpt: string; confidence: number; createdAt: string };
export type FactRecord = {
  id: string; content: string; factType: string; confidence: number; sourceEntryId: string;
  evidenceExcerpt: string; evidenceCount: number; lastVerifiedAt: string; status: string;
  updatedAt: string; evidences: EvidenceRecord[];
  versions: Array<{ version: number; content: string; confidence: number; reason: string; createdAt: string }>;
};

export type ProfileSnapshot = {
  user: { name: string; longTermGoal: string; currentStage: string };
  entries: Array<{ id: string; content: string; category: string; tags: string[]; importance: number; occurredAt: string; allowAi: boolean; status: string; dataKind: string; duplicateOfEntryId: string | null }>;
  proposals: ProposalRecord[];
  facts: FactRecord[];
  inactiveFacts: FactRecord[];
  timeline: Array<{ id: string; eventType: string; title: string; summary: string; sourceId: string; occurredAt: string; children: Array<{ id: string; eventType: string; title: string; summary: string }> }>;
  cleanupPreview: CleanupPreview;
  usage: Array<{ id: string; purpose: string; provider: string; taskClass: string | null; requestId: string | null; model: string; mode: string; promptVersion: string | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number; success: boolean; errorCode: string | null; createdAt: string }>;
};

export type CleanupPreview = { entries: number; proposals: number; timelineEvents: number; confirmedFacts: number; protectedEntries: number };
export type ProposalCreationResult = { records: ProposalRecord[]; evidenceUpdates: Array<{ factId: string; content: string; added: boolean }>; reusedPending: number; suppressedRejected: number };

function now() { return new Date().toISOString(); }
function row<T>(value: unknown): T { return value as T; }
function jsonArray(value: unknown) { try { return JSON.parse(String(value)) as string[]; } catch { return []; } }

export class ProfileRepository {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const migrationDirectory = path.join(process.cwd(), "lib", "db", "migrations");
    const migrations = fs.readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort();
    const applied = this.db.prepare("SELECT 1 FROM schema_migrations WHERE name=?");
    const recordMigration = this.db.prepare("INSERT INTO schema_migrations (name,applied_at) VALUES (?,?)");
    for (const name of migrations) {
      if (applied.get(name)) continue;
      const sql = fs.readFileSync(path.join(migrationDirectory, name), "utf8");
      this.db.pragma("foreign_keys = OFF");
      try {
        this.db.transaction(() => {
          this.db.exec(sql);
          const violations = this.db.pragma("foreign_key_check") as unknown[];
          if (violations.length)
            throw new Error(`Migration ${name} introduced foreign-key violations`);
          recordMigration.run(name, now());
        })();
      } finally {
        this.db.pragma("foreign_keys = ON");
      }
    }
    const timestamp = now();
    this.db.prepare("INSERT OR IGNORE INTO users (id,name,long_term_goal,current_stage,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(USER_ID, "Genesis 用户", "成为能独立交付真实解决方案的 FDE", "大一结束 · 基础夯实与项目闭环期", 0, timestamp, timestamp);
    this.backfillDataQuality();
  }

  close() { this.db.close(); }

  private backfillDataQuality() {
    this.db.transaction(() => {
      const entries = this.db.prepare("SELECT * FROM self_entries").all() as Array<Record<string, unknown>>;
      const updateEntry = this.db.prepare("UPDATE self_entries SET normalized_content_hash=?,idempotency_key=COALESCE(idempotency_key,client_request_id) WHERE id=?");
      const addKey = this.db.prepare("INSERT OR IGNORE INTO idempotency_keys (idempotency_key,user_id,entry_id,request_hash,created_at) VALUES (?,?,?,?,?)");
      for (const entry of entries) {
        const hash = contentHash(String(entry.content));
        updateEntry.run(hash, entry.id);
        addKey.run(entry.client_request_id, entry.user_id, entry.id, hash, entry.created_at);
      }

      const proposals = this.db.prepare("SELECT * FROM profile_update_proposals ORDER BY created_at,id").all() as Array<Record<string, unknown>>;
      const updateProposal = this.db.prepare("UPDATE profile_update_proposals SET normalized_content_hash=?,canonical_value=?,canonical_value_hash=?,profile_dimension=? WHERE id=?");
      const addProposalEvidence = this.db.prepare("INSERT OR IGNORE INTO profile_proposal_evidence (id,proposal_id,source_entry_id,evidence_excerpt,evidence_hash,confidence,created_at) VALUES (?,?,?,?,?,?,?)");
      for (const proposal of proposals) {
        const canonical = canonicalProfileValue(String(proposal.fact_type), String(proposal.proposed_content));
        const fingerprint = profileFingerprint(String(proposal.fact_type), String(proposal.proposed_content));
        try { updateProposal.run(contentHash(String(proposal.proposed_content)), canonical, fingerprint, proposal.fact_type, proposal.id); }
        catch { updateProposal.run(contentHash(String(proposal.proposed_content)), canonical, `${fingerprint}:${proposal.id}`, proposal.fact_type, proposal.id); }
        addProposalEvidence.run(randomUUID(), proposal.id, proposal.source_entry_id, proposal.evidence_excerpt, contentHash(String(proposal.evidence_excerpt)), proposal.confidence, proposal.created_at);
      }

      const facts = this.db.prepare("SELECT * FROM profile_facts ORDER BY created_at,id").all() as Array<Record<string, unknown>>;
      const updateFact = this.db.prepare("UPDATE profile_facts SET normalized_content_hash=?,canonical_value=?,canonical_value_hash=?,profile_dimension=?,last_verified_at=COALESCE(last_verified_at,updated_at) WHERE id=?");
      const addFactEvidence = this.db.prepare("INSERT OR IGNORE INTO profile_fact_evidence (id,profile_fact_id,source_entry_id,proposal_id,evidence_excerpt,evidence_hash,confidence,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM self_entries WHERE id=?)");
      for (const fact of facts) {
        const canonical = canonicalProfileValue(String(fact.fact_type), String(fact.content));
        const fingerprint = profileFingerprint(String(fact.fact_type), String(fact.content));
        try { updateFact.run(contentHash(String(fact.content)), canonical, fingerprint, fact.fact_type, fact.id); }
        catch { updateFact.run(contentHash(String(fact.content)), canonical, `${fingerprint}:${fact.id}`, fact.fact_type, fact.id); }
        const proposal = row<Record<string, unknown> | undefined>(this.db.prepare("SELECT * FROM profile_update_proposals WHERE id=?").get(fact.proposal_id));
        if (proposal) addFactEvidence.run(randomUUID(), fact.id, fact.source_id, proposal.id, proposal.evidence_excerpt, contentHash(String(proposal.evidence_excerpt)), fact.confidence, fact.created_at, fact.source_id);
      }
      this.db.exec("UPDATE profile_update_proposals SET evidence_count=(SELECT count(*) FROM profile_proposal_evidence e WHERE e.proposal_id=profile_update_proposals.id)");
      this.db.exec("UPDATE profile_facts SET evidence_count=(SELECT count(*) FROM profile_fact_evidence e WHERE e.profile_fact_id=profile_facts.id)");
      this.db.exec("UPDATE life_events SET data_kind=COALESCE((SELECT data_kind FROM self_entries e WHERE e.id=life_events.source_id),data_kind) WHERE source_type='self_entry'");
      this.db.exec("UPDATE life_events SET data_kind=COALESCE((SELECT e.data_kind FROM profile_facts f JOIN self_entries e ON e.id=f.source_id WHERE f.id=life_events.source_id),data_kind) WHERE source_type='profile_fact'");
    })();
  }

  findEntryByRequestId(requestId: string) {
    return this.db.prepare("SELECT entry_id AS id FROM idempotency_keys WHERE idempotency_key=?").get(requestId) as { id: string } | undefined;
  }

  createEntry(input: SelfEntryInput) {
    return this.db.transaction(() => {
      const requestHash = contentHash(input.content);
      const keyed = this.findEntryByRequestId(input.clientRequestId);
      if (keyed) return { id: keyed.id, duplicate: true, duplicateReason: "idempotency_key" as const };
      const cutoff = new Date(Date.now() - CONTENT_DEDUPE_WINDOW_MS).toISOString();
      const sameContent = this.db.prepare("SELECT id FROM self_entries WHERE user_id=? AND normalized_content_hash=? AND created_at>=? AND status='active' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1")
        .get(USER_ID, requestHash, cutoff) as { id: string } | undefined;
      if (sameContent) {
        this.db.prepare("INSERT INTO idempotency_keys (idempotency_key,user_id,entry_id,request_hash,created_at) VALUES (?,?,?,?,?)")
          .run(input.clientRequestId, USER_ID, sameContent.id, requestHash, now());
        this.audit("self_entry.duplicate_suppressed", "self_entry", sameContent.id, null, { idempotencyKey: input.clientRequestId, reason: "same_content_window" });
        return { id: sameContent.id, duplicate: true, duplicateReason: "same_content_window" as const };
      }
      const id = randomUUID();
      const timestamp = now();
      this.db.prepare("INSERT INTO self_entries (id,user_id,client_request_id,idempotency_key,normalized_content_hash,content,category,tags_json,importance,occurred_at,allow_ai,data_kind,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, USER_ID, input.clientRequestId, input.clientRequestId, requestHash, input.content, input.category, JSON.stringify(input.tags), input.importance, input.occurredAt, input.allowAi ? 1 : 0, input.dataKind, timestamp, timestamp);
      this.db.prepare("INSERT INTO idempotency_keys (idempotency_key,user_id,entry_id,request_hash,created_at) VALUES (?,?,?,?,?)")
        .run(input.clientRequestId, USER_ID, id, requestHash, timestamp);
      this.db.prepare("INSERT INTO life_events (id,user_id,event_type,title,summary,source_type,source_id,occurred_at,created_at,data_kind,is_primary) VALUES (?,?,?,?,?,?,?,?,?,?,1)")
        .run(randomUUID(), USER_ID, "self_entry", "新增自我输入", input.content.slice(0, 160), "self_entry", id, input.occurredAt, timestamp, input.dataKind);
      this.audit("self_entry.created", "self_entry", id, null, { ...input, contentHash: requestHash });
      return { id, duplicate: false, duplicateReason: null };
    })();
  }

  private proposalRecord(record: Record<string, unknown>): ProposalRecord {
    return { id: String(record.id), sourceEntryId: String(record.source_entry_id), proposedContent: String(record.proposed_content), factType: String(record.fact_type), evidenceExcerpt: String(record.evidence_excerpt), confidence: Number(record.confidence), possibleImpact: String(record.possible_impact), status: record.status as ProposalRecord["status"], modelMode: record.model_mode as ProposalRecord["modelMode"], provider: String(record.provider || (record.model_mode === "demo" ? "demo" : "openai")), evidenceCount: Number(record.evidence_count || 1), createdAt: String(record.created_at) };
  }

  private findSimilarFact(candidate: ProfileCandidate) {
    const records = this.db.prepare("SELECT * FROM profile_facts WHERE user_id=? AND fact_type=? AND status='active' AND is_active=1 AND deleted_at IS NULL").all(USER_ID, candidate.factType) as Array<Record<string, unknown>>;
    const fingerprint = profileFingerprint(candidate.factType, candidate.content);
    return records.find((record) => record.canonical_value_hash === fingerprint || record.normalized_content_hash === contentHash(candidate.content) || textSimilarity(String(record.content), candidate.content) >= 0.86);
  }

  private findSimilarProposal(candidate: ProfileCandidate) {
    const records = this.db.prepare("SELECT * FROM profile_update_proposals WHERE user_id=? AND fact_type=? AND deleted_at IS NULL ORDER BY created_at ASC").all(USER_ID, candidate.factType) as Array<Record<string, unknown>>;
    const fingerprint = profileFingerprint(candidate.factType, candidate.content);
    return records.find((record) => record.canonical_value_hash === fingerprint || record.normalized_content_hash === contentHash(candidate.content) || textSimilarity(String(record.proposed_content), candidate.content) >= 0.86);
  }

  private addFactEvidence(fact: Record<string, unknown>, sourceEntryId: string, proposalId: string | null, excerpt: string, confidence: number) {
    const timestamp = now();
    const result = this.db.prepare("INSERT OR IGNORE INTO profile_fact_evidence (id,profile_fact_id,source_entry_id,proposal_id,evidence_excerpt,evidence_hash,confidence,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(randomUUID(), fact.id, sourceEntryId, proposalId, excerpt, contentHash(excerpt), confidence, timestamp);
    if (!result.changes) return false;
    const nextConfidence = Math.min(0.95, Math.max(Number(fact.confidence), confidence) + 0.02);
    this.db.prepare("UPDATE profile_facts SET evidence_count=(SELECT count(*) FROM profile_fact_evidence WHERE profile_fact_id=?),confidence=?,last_verified_at=?,updated_at=? WHERE id=?")
      .run(fact.id, nextConfidence, timestamp, timestamp, fact.id);
    this.audit("profile_fact.evidence_added", "profile_fact", String(fact.id), null, { sourceEntryId, excerpt, confidence });
    return true;
  }

  createProposalsDeduplicated(entryId: string, candidates: ProfileCandidate[], mode: "demo" | "real" | "openai", provider = mode === "demo" ? "demo" : "openai"): ProposalCreationResult {
    return this.db.transaction(() => {
      const entry = row<Record<string, unknown>>(this.db.prepare("SELECT * FROM self_entries WHERE id=?").get(entryId));
      const parent = row<{ id: string } | undefined>(this.db.prepare("SELECT id FROM life_events WHERE source_type='self_entry' AND source_id=? AND is_primary=1 ORDER BY created_at LIMIT 1").get(entryId));
      const records: ProposalRecord[] = [];
      const evidenceUpdates: ProposalCreationResult["evidenceUpdates"] = [];
      let reusedPending = 0;
      let suppressedRejected = 0;
      const seen = new Set<string>();
      const timestamp = now();
      for (const candidate of candidates) {
        const canonical = canonicalProfileValue(candidate.factType, candidate.content);
        const fingerprint = profileFingerprint(candidate.factType, candidate.content);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const fact = this.findSimilarFact(candidate);
        if (fact) {
          const added = this.addFactEvidence(fact, entryId, null, candidate.evidenceExcerpt, candidate.confidence);
          evidenceUpdates.push({ factId: String(fact.id), content: String(fact.content), added });
          continue;
        }
        const existing = this.findSimilarProposal(candidate);
        if (existing) {
          const insert = this.db.prepare("INSERT OR IGNORE INTO profile_proposal_evidence (id,proposal_id,source_entry_id,evidence_excerpt,evidence_hash,confidence,created_at) VALUES (?,?,?,?,?,?,?)")
            .run(randomUUID(), existing.id, entryId, candidate.evidenceExcerpt, contentHash(candidate.evidenceExcerpt), candidate.confidence, timestamp);
          if (insert.changes) this.db.prepare("UPDATE profile_update_proposals SET evidence_count=(SELECT count(*) FROM profile_proposal_evidence WHERE proposal_id=?),updated_at=? WHERE id=?").run(existing.id, timestamp, existing.id);
          if (existing.status === "rejected") suppressedRejected += 1; else reusedPending += 1;
          continue;
        }
        const id = randomUUID();
        this.db.prepare("INSERT INTO profile_update_proposals (id,user_id,source_entry_id,proposed_content,fact_type,evidence_excerpt,confidence,possible_impact,status,model_mode,provider,normalized_content_hash,canonical_value,canonical_value_hash,profile_dimension,evidence_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(id, USER_ID, entryId, candidate.content, candidate.factType, candidate.evidenceExcerpt, candidate.confidence, candidate.possibleImpact, "pending", mode, provider, contentHash(candidate.content), canonical, fingerprint, candidate.factType, 1, timestamp, timestamp);
        this.db.prepare("INSERT INTO profile_proposal_evidence (id,proposal_id,source_entry_id,evidence_excerpt,evidence_hash,confidence,created_at) VALUES (?,?,?,?,?,?,?)")
          .run(randomUUID(), id, entryId, candidate.evidenceExcerpt, contentHash(candidate.evidenceExcerpt), candidate.confidence, timestamp);
        records.push({ id, sourceEntryId: entryId, proposedContent: candidate.content, factType: candidate.factType, evidenceExcerpt: candidate.evidenceExcerpt, confidence: candidate.confidence, possibleImpact: candidate.possibleImpact, status: "pending", modelMode: mode, provider, evidenceCount: 1, createdAt: timestamp });
      }
      if (candidates.length && parent) {
        this.db.prepare("INSERT INTO life_events (id,user_id,event_type,title,summary,source_type,source_id,occurred_at,created_at,parent_event_id,is_primary,data_kind) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)")
          .run(randomUUID(), USER_ID, "profile_candidates_processed", "画像候选已处理", `新增 ${records.length}，复用 ${reusedPending}，已有画像新增证据 ${evidenceUpdates.filter((item) => item.added).length}，已拒绝重复 ${suppressedRejected}`, "self_entry", entryId, entry.occurred_at, timestamp, parent.id, entry.data_kind);
      }
      return { records, evidenceUpdates, reusedPending, suppressedRejected };
    })();
  }

  createProposals(entryId: string, candidates: ProfileCandidate[], mode: "demo" | "real" | "openai", provider?: string) {
    return this.createProposalsDeduplicated(entryId, candidates, mode, provider).records;
  }

  proposalsForEntry(entryId: string): ProposalRecord[] {
    const records = this.db.prepare("SELECT DISTINCT p.* FROM profile_update_proposals p LEFT JOIN profile_proposal_evidence e ON e.proposal_id=p.id WHERE (p.source_entry_id=? OR e.source_entry_id=?) AND p.deleted_at IS NULL ORDER BY p.created_at ASC").all(entryId, entryId) as Array<Record<string, unknown>>;
    return records.map((record) => this.proposalRecord(record));
  }

  hasProcessedProfileCandidates(entryId: string) {
    return Boolean(this.db.prepare("SELECT 1 FROM life_events WHERE source_type='self_entry' AND source_id=? AND event_type='profile_candidates_processed' LIMIT 1").get(entryId));
  }

  decideProposal(id: string, action: "approve" | "reject" | "edit", editedContent?: string) {
    return this.db.transaction(() => {
      const proposal = row<Record<string, unknown> | undefined>(this.db.prepare("SELECT * FROM profile_update_proposals WHERE id=? AND deleted_at IS NULL").get(id));
      if (!proposal) throw new Error("PROPOSAL_NOT_FOUND");
      if (proposal.status !== "pending") throw new Error("PROPOSAL_ALREADY_DECIDED");
      const timestamp = now();
      if (action === "edit") {
        const content = String(editedContent);
        const canonical = canonicalProfileValue(String(proposal.fact_type), content);
        this.db.prepare("UPDATE profile_update_proposals SET proposed_content=?,normalized_content_hash=?,canonical_value=?,canonical_value_hash=?,updated_at=? WHERE id=?")
          .run(content, contentHash(content), canonical, profileFingerprint(String(proposal.fact_type), content), timestamp, id);
        this.audit("profile_proposal.edited", "profile_update_proposal", id, proposal, { proposedContent: content });
        return { status: "pending" as const };
      }
      this.db.prepare("UPDATE profile_update_proposals SET status=?,decided_at=?,updated_at=? WHERE id=?").run(action === "approve" ? "approved" : "rejected", timestamp, timestamp, id);
      if (action === "reject") {
        this.audit("profile_proposal.rejected", "profile_update_proposal", id, proposal, { status: "rejected" });
        return { status: "rejected" as const };
      }
      const candidate = { content: String(proposal.proposed_content), factType: String(proposal.fact_type), evidenceExcerpt: String(proposal.evidence_excerpt), confidence: Number(proposal.confidence), possibleImpact: String(proposal.possible_impact) } as ProfileCandidate;
      const existingFact = this.findSimilarFact(candidate);
      const evidence = this.db.prepare("SELECT * FROM profile_proposal_evidence WHERE proposal_id=?").all(id) as Array<Record<string, unknown>>;
      if (existingFact) {
        for (const item of evidence) this.addFactEvidence(existingFact, String(item.source_entry_id), id, String(item.evidence_excerpt), Number(item.confidence));
        this.db.prepare("UPDATE profile_update_proposals SET dedupe_target_fact_id=? WHERE id=?").run(existingFact.id, id);
        this.audit("profile_fact.supported_existing", "profile_fact", String(existingFact.id), null, { proposalId: id, evidenceCount: evidence.length });
        return { status: "supported_existing" as const, factId: String(existingFact.id) };
      }
      const factId = randomUUID();
      const canonical = canonicalProfileValue(String(proposal.fact_type), String(proposal.proposed_content));
      this.db.prepare("INSERT INTO profile_facts (id,user_id,proposal_id,content,fact_type,confidence,user_confirmed,is_active,source_type,source_id,normalized_content_hash,canonical_value,canonical_value_hash,profile_dimension,evidence_count,last_verified_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(factId, USER_ID, id, proposal.proposed_content, proposal.fact_type, proposal.confidence, 1, 1, "self_entry", proposal.source_entry_id, contentHash(String(proposal.proposed_content)), canonical, profileFingerprint(String(proposal.fact_type), String(proposal.proposed_content)), proposal.fact_type, Math.max(1, evidence.length), timestamp, "active", timestamp, timestamp);
      for (const item of evidence) this.db.prepare("INSERT OR IGNORE INTO profile_fact_evidence (id,profile_fact_id,source_entry_id,proposal_id,evidence_excerpt,evidence_hash,confidence,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(randomUUID(), factId, item.source_entry_id, id, item.evidence_excerpt, item.evidence_hash, item.confidence, item.created_at);
      this.db.prepare("INSERT INTO profile_fact_versions (id,profile_fact_id,version,content,confidence,change_reason,changed_by,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(randomUUID(), factId, 1, proposal.proposed_content, proposal.confidence, "用户批准画像候选", "user", timestamp);
      this.db.prepare("INSERT INTO life_events (id,user_id,event_type,title,summary,source_type,source_id,occurred_at,created_at,is_primary,data_kind) VALUES (?,?,?,?,?,?,?,?,?,1,(SELECT data_kind FROM self_entries WHERE id=?))")
        .run(randomUUID(), USER_ID, "profile_fact_approved", "画像事实已确认", String(proposal.proposed_content), "profile_fact", factId, timestamp, timestamp, proposal.source_entry_id);
      this.audit("profile_fact.approved", "profile_fact", factId, null, { proposalId: id, content: proposal.proposed_content, evidenceCount: evidence.length });
      return { status: "approved" as const, factId };
    })();
  }

  private recordFactEvent(eventType: string, title: string, summary: string, factId: string, timestamp: string) {
    this.db.prepare("INSERT INTO life_events (id,user_id,event_type,title,summary,source_type,source_id,occurred_at,created_at,is_primary,data_kind) VALUES (?,?,?,?,?,?,?,?,?,1,'user')")
      .run(randomUUID(), USER_ID, eventType, title, summary, "profile_fact", factId, timestamp, timestamp);
  }

  manageFact(id: string, decision: { action: string; [key: string]: unknown }) {
    return this.db.transaction(() => {
      const fact = row<Record<string, unknown> | undefined>(this.db.prepare("SELECT * FROM profile_facts WHERE id=?").get(id));
      if (!fact) throw new Error("FACT_NOT_FOUND");
      const timestamp = now();
      const nextVersion = Number(fact.version) + 1;
      if (decision.action === "merge") {
        const targetId = String(decision.targetFactId);
        if (targetId === id) throw new Error("FACT_MERGE_SELF");
        const target = row<Record<string, unknown> | undefined>(this.db.prepare("SELECT * FROM profile_facts WHERE id=? AND status='active' AND deleted_at IS NULL").get(targetId));
        if (!target) throw new Error("MERGE_TARGET_NOT_FOUND");
        const evidences = this.db.prepare("SELECT * FROM profile_fact_evidence WHERE profile_fact_id=?").all(id) as Array<Record<string, unknown>>;
        for (const evidence of evidences) this.db.prepare("INSERT OR IGNORE INTO profile_fact_evidence (id,profile_fact_id,source_entry_id,proposal_id,evidence_excerpt,evidence_hash,confidence,created_at) VALUES (?,?,?,?,?,?,?,?)")
          .run(randomUUID(), targetId, evidence.source_entry_id, evidence.proposal_id, evidence.evidence_excerpt, evidence.evidence_hash, evidence.confidence, evidence.created_at);
        this.db.prepare("UPDATE profile_facts SET evidence_count=(SELECT count(*) FROM profile_fact_evidence WHERE profile_fact_id=?),last_verified_at=?,updated_at=? WHERE id=?").run(targetId, timestamp, timestamp, targetId);
        this.db.prepare("UPDATE profile_facts SET status='merged',is_active=0,merged_into_fact_id=?,archived_at=?,version=?,updated_at=? WHERE id=?").run(targetId, timestamp, nextVersion, timestamp, id);
        this.db.prepare("INSERT INTO profile_fact_versions (id,profile_fact_id,version,content,confidence,change_reason,changed_by,created_at) VALUES (?,?,?,?,?,?,?,?)")
          .run(randomUUID(), id, nextVersion, fact.content, fact.confidence, `合并到 ${targetId}：${String(decision.reason)}`, "user", timestamp);
        this.recordFactEvent("profile_fact_merged", "画像事实已合并", String(fact.content), id, timestamp);
        this.audit("profile_fact.merged", "profile_fact", id, fact, { targetId, evidenceTransferred: evidences.length, reason: decision.reason });
        return { status: "merged", id, targetId, evidenceTransferred: evidences.length };
      }
      if (decision.action === "edit" || decision.action === "restore_version") {
        const historical = decision.action === "restore_version" ? row<Record<string, unknown> | undefined>(this.db.prepare("SELECT * FROM profile_fact_versions WHERE profile_fact_id=? AND version=?").get(id, decision.version)) : undefined;
        if (decision.action === "restore_version" && !historical) throw new Error("FACT_VERSION_NOT_FOUND");
        const content = decision.action === "edit" ? String(decision.content) : String(historical?.content);
        const confidence = decision.action === "edit" ? Number(fact.confidence) : Number(historical?.confidence);
        const canonical = canonicalProfileValue(String(fact.fact_type), content);
        this.db.prepare("UPDATE profile_facts SET content=?,confidence=?,normalized_content_hash=?,canonical_value=?,canonical_value_hash=?,version=?,updated_at=? WHERE id=?")
          .run(content, confidence, contentHash(content), canonical, profileFingerprint(String(fact.fact_type), content), nextVersion, timestamp, id);
        this.db.prepare("INSERT INTO profile_fact_versions (id,profile_fact_id,version,content,confidence,change_reason,changed_by,created_at) VALUES (?,?,?,?,?,?,?,?)")
          .run(randomUUID(), id, nextVersion, content, confidence, decision.action === "edit" ? String(decision.reason) : `恢复历史版本 ${decision.version}`, "user", timestamp);
        this.recordFactEvent(decision.action === "edit" ? "profile_fact_edited" : "profile_fact_version_restored", decision.action === "edit" ? "画像事实已修改" : "画像历史版本已恢复", content, id, timestamp);
        this.audit(`profile_fact.${decision.action}`, "profile_fact", id, fact, { content, version: nextVersion });
        return { status: "active", id };
      }
      const status = decision.action === "archive" ? "archived" : decision.action === "delete" ? "deleted" : decision.action === "restore" ? "active" : "revoked";
      const isActive = status === "active" ? 1 : 0;
      this.db.prepare("UPDATE profile_facts SET status=?,is_active=?,archived_at=?,deleted_at=?,version=?,updated_at=? WHERE id=?")
        .run(status, isActive, status === "archived" ? timestamp : null, status === "deleted" ? timestamp : null, nextVersion, timestamp, id);
      this.db.prepare("INSERT INTO profile_fact_versions (id,profile_fact_id,version,content,confidence,change_reason,changed_by,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(randomUUID(), id, nextVersion, fact.content, fact.confidence, `${decision.action}：${String(decision.reason || "用户操作")}`, "user", timestamp);
      const actionLabel = decision.action === "archive" ? "归档" : decision.action === "delete" ? "删除" : decision.action === "restore" ? "恢复" : "撤回";
      const eventType = decision.action === "revoke" ? "profile_fact_revoked" : `profile_fact_${decision.action}`;
      this.recordFactEvent(eventType, `画像事实已${actionLabel}`, String(fact.content), id, timestamp);
      this.audit(`profile_fact.${decision.action}`, "profile_fact", id, fact, { status, reason: decision.reason });
      return { status, id };
    })();
  }

  revokeFact(id: string, reason: string) { return this.manageFact(id, { action: "revoke", reason }); }

  manageEntry(id: string, decision: { action: string; [key: string]: unknown }) {
    return this.db.transaction(() => {
      const entry = row<Record<string, unknown> | undefined>(this.db.prepare("SELECT * FROM self_entries WHERE id=? AND deleted_at IS NULL").get(id));
      if (!entry) throw new Error("ENTRY_NOT_FOUND");
      const timestamp = now();
      if (decision.action === "edit_metadata") {
        this.db.prepare("UPDATE self_entries SET category=?,tags_json=?,data_kind=?,updated_at=? WHERE id=?").run(decision.category, JSON.stringify(decision.tags), decision.dataKind, timestamp, id);
        this.db.prepare("UPDATE life_events SET data_kind=? WHERE (source_type='self_entry' AND source_id=?) OR (source_type='profile_fact' AND source_id IN (SELECT id FROM profile_facts WHERE source_id=?))").run(decision.dataKind, id, id);
        this.audit("self_entry.metadata_edited", "self_entry", id, entry, { category: decision.category, tags: decision.tags, dataKind: decision.dataKind });
        return { status: "active", id };
      }
      if (decision.action === "mark_duplicate") {
        const original = this.db.prepare("SELECT id FROM self_entries WHERE user_id=? AND normalized_content_hash=? AND id<>? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1").get(USER_ID, entry.normalized_content_hash, id) as { id: string } | undefined;
        if (!original) throw new Error("DUPLICATE_TARGET_NOT_FOUND");
        this.db.prepare("UPDATE self_entries SET status='duplicate',duplicate_of_entry_id=?,archived_at=?,updated_at=? WHERE id=?").run(original.id, timestamp, timestamp, id);
        this.db.prepare("UPDATE life_events SET hidden_at=? WHERE source_type='self_entry' AND source_id=?").run(timestamp, id);
        this.audit("self_entry.marked_duplicate", "self_entry", id, entry, { duplicateOf: original.id });
        return { status: "duplicate", id, duplicateOf: original.id };
      }
      const status = decision.action === "delete" ? "deleted" : "archived";
      this.db.prepare("UPDATE self_entries SET status=?,archived_at=?,deleted_at=?,updated_at=? WHERE id=?")
        .run(status, timestamp, status === "deleted" ? timestamp : null, timestamp, id);
      this.db.prepare("UPDATE life_events SET hidden_at=? WHERE source_type='self_entry' AND source_id=?").run(timestamp, id);
      this.audit(`self_entry.${decision.action}`, "self_entry", id, entry, { status, reason: decision.reason });
      return { status, id };
    })();
  }

  hideTimelineEvent(id: string) {
    const timestamp = now();
    const result = this.db.prepare("UPDATE life_events SET hidden_at=? WHERE id=? AND user_id=?").run(timestamp, id, USER_ID);
    if (!result.changes) throw new Error("EVENT_NOT_FOUND");
    this.audit("life_event.hidden", "life_event", id, null, { hiddenAt: timestamp });
    return { status: "hidden", id };
  }

  cleanupPreview(): CleanupPreview {
    const entries = Number((this.db.prepare("SELECT count(*) n FROM self_entries WHERE data_kind IN ('demo','test') AND deleted_at IS NULL").get() as { n: number }).n);
    const proposals = Number((this.db.prepare("SELECT count(*) n FROM profile_update_proposals p JOIN self_entries e ON e.id=p.source_entry_id WHERE e.data_kind IN ('demo','test') AND p.deleted_at IS NULL").get() as { n: number }).n);
    const timelineEvents = Number((this.db.prepare("SELECT count(*) n FROM life_events WHERE data_kind IN ('demo','test') AND deleted_at IS NULL").get() as { n: number }).n);
    const confirmedFacts = Number((this.db.prepare("SELECT count(DISTINCT f.id) n FROM profile_facts f JOIN profile_fact_evidence ev ON ev.profile_fact_id=f.id JOIN self_entries e ON e.id=ev.source_entry_id WHERE e.data_kind IN ('demo','test') AND f.status='active'").get() as { n: number }).n);
    const protectedEntries = Number((this.db.prepare("SELECT count(DISTINCT e.id) n FROM self_entries e JOIN profile_fact_evidence ev ON ev.source_entry_id=e.id JOIN profile_facts f ON f.id=ev.profile_fact_id WHERE e.data_kind IN ('demo','test') AND f.status='active' AND NOT EXISTS (SELECT 1 FROM profile_fact_evidence kept JOIN self_entries kept_entry ON kept_entry.id=kept.source_entry_id WHERE kept.profile_fact_id=f.id AND kept_entry.data_kind NOT IN ('demo','test') AND kept_entry.deleted_at IS NULL)").get() as { n: number }).n);
    return { entries, proposals, timelineEvents, confirmedFacts, protectedEntries };
  }

  clearTestData(keepConfirmedFacts: boolean) {
    return this.db.transaction(() => {
      const preview = this.cleanupPreview();
      const timestamp = now();
      if (!keepConfirmedFacts) this.db.prepare("UPDATE profile_facts SET status='deleted',is_active=0,deleted_at=?,updated_at=? WHERE id IN (SELECT DISTINCT f.id FROM profile_facts f JOIN profile_fact_evidence ev ON ev.profile_fact_id=f.id JOIN self_entries e ON e.id=ev.source_entry_id WHERE e.data_kind IN ('demo','test'))").run(timestamp, timestamp);
      if (keepConfirmedFacts) {
        this.db.prepare("DELETE FROM profile_fact_evidence WHERE source_entry_id IN (SELECT id FROM self_entries WHERE data_kind IN ('demo','test')) AND profile_fact_id IN (SELECT f.id FROM profile_facts f WHERE f.status='active' AND EXISTS (SELECT 1 FROM profile_fact_evidence kept JOIN self_entries kept_entry ON kept_entry.id=kept.source_entry_id WHERE kept.profile_fact_id=f.id AND kept_entry.data_kind NOT IN ('demo','test') AND kept_entry.deleted_at IS NULL))").run();
        this.db.prepare("UPDATE profile_facts SET evidence_count=(SELECT count(*) FROM profile_fact_evidence ev WHERE ev.profile_fact_id=profile_facts.id),confidence=COALESCE((SELECT max(confidence) FROM profile_fact_evidence ev WHERE ev.profile_fact_id=profile_facts.id),confidence),last_verified_at=COALESCE((SELECT max(created_at) FROM profile_fact_evidence ev WHERE ev.profile_fact_id=profile_facts.id),last_verified_at),updated_at=? WHERE status='active'").run(timestamp);
      }
      this.db.prepare("UPDATE profile_update_proposals SET deleted_at=? WHERE source_entry_id IN (SELECT id FROM self_entries WHERE data_kind IN ('demo','test')) AND deleted_at IS NULL").run(timestamp);
      if (keepConfirmedFacts) {
        this.db.prepare("UPDATE self_entries SET status='deleted',deleted_at=?,updated_at=? WHERE data_kind IN ('demo','test') AND deleted_at IS NULL AND id NOT IN (SELECT source_entry_id FROM profile_fact_evidence ev JOIN profile_facts f ON f.id=ev.profile_fact_id WHERE f.status='active')").run(timestamp, timestamp);
      } else {
        this.db.prepare("UPDATE self_entries SET status='deleted',deleted_at=?,updated_at=? WHERE data_kind IN ('demo','test') AND deleted_at IS NULL").run(timestamp, timestamp);
      }
      this.db.prepare("UPDATE life_events SET hidden_at=?,deleted_at=? WHERE data_kind IN ('demo','test') AND deleted_at IS NULL").run(timestamp, timestamp);
      this.audit("test_data.cleared", "user", USER_ID, preview, { keepConfirmedFacts, executedAt: timestamp });
      return { ...preview, keepConfirmedFacts, status: "cleared" };
    })();
  }

  logAi(data: { provider?: string; taskClass?: string; requestId?: string | null; model: string; mode: string; latencyMs: number; success: boolean; errorCode?: string; inputTokens?: number; outputTokens?: number; purpose?: string; promptVersion?: string }) {
    this.db.prepare("INSERT INTO ai_usage_logs (id,user_id,purpose,provider,task_class,request_id,model,mode,input_tokens,output_tokens,latency_ms,success,error_code,created_at,prompt_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(randomUUID(), USER_ID, data.purpose ?? "profile_extraction", data.provider ?? (data.mode === "demo" ? "demo" : "openai"), data.taskClass ?? null, data.requestId ?? null, data.model, data.mode, data.inputTokens ?? null, data.outputTokens ?? null, data.latencyMs, data.success ? 1 : 0, data.errorCode ?? null, now(), data.promptVersion ?? PROFILE_EXTRACTOR_PROMPT_VERSION);
  }

  private audit(action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
    this.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(randomUUID(), USER_ID, action, entityType, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, now());
  }

  private factRecord(record: Record<string, unknown>): FactRecord {
    const evidences = this.db.prepare("SELECT * FROM profile_fact_evidence WHERE profile_fact_id=? ORDER BY created_at DESC").all(record.id) as Array<Record<string, unknown>>;
    const versions = this.db.prepare("SELECT * FROM profile_fact_versions WHERE profile_fact_id=? ORDER BY version DESC").all(record.id) as Array<Record<string, unknown>>;
    return {
      id: String(record.id), content: String(record.content), factType: String(record.fact_type), confidence: Number(record.confidence), sourceEntryId: String(record.source_id), evidenceExcerpt: String(evidences[0]?.evidence_excerpt || ""), evidenceCount: Number(record.evidence_count || evidences.length), lastVerifiedAt: String(record.last_verified_at || record.updated_at), status: String(record.status), updatedAt: String(record.updated_at),
      evidences: evidences.map((item) => ({ id: String(item.id), sourceEntryId: String(item.source_entry_id), excerpt: String(item.evidence_excerpt), confidence: Number(item.confidence), createdAt: String(item.created_at) })),
      versions: versions.map((item) => ({ version: Number(item.version), content: String(item.content), confidence: Number(item.confidence), reason: String(item.change_reason), createdAt: String(item.created_at) })),
    };
  }

  snapshot(): ProfileSnapshot {
    const user = row<{ name: string; long_term_goal: string; current_stage: string }>(this.db.prepare("SELECT name,long_term_goal,current_stage FROM users WHERE id=?").get(USER_ID));
    const entries = this.db.prepare("SELECT * FROM self_entries WHERE user_id=? AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 100").all(USER_ID) as Array<Record<string, unknown>>;
    const proposals = this.db.prepare("SELECT * FROM profile_update_proposals WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 150").all(USER_ID) as Array<Record<string, unknown>>;
    const activeFacts = this.db.prepare("SELECT * FROM profile_facts WHERE user_id=? AND status='active' AND is_active=1 AND deleted_at IS NULL ORDER BY updated_at DESC").all(USER_ID) as Array<Record<string, unknown>>;
    const inactiveFacts = this.db.prepare("SELECT f.* FROM profile_facts f WHERE f.user_id=? AND f.status<>'active' AND EXISTS (SELECT 1 FROM profile_fact_evidence ev JOIN self_entries e ON e.id=ev.source_entry_id WHERE ev.profile_fact_id=f.id AND e.data_kind NOT IN ('demo','test')) ORDER BY f.updated_at DESC LIMIT 100").all(USER_ID) as Array<Record<string, unknown>>;
    const timeline = this.db.prepare("SELECT * FROM life_events WHERE user_id=? AND is_primary=1 AND hidden_at IS NULL AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 100").all(USER_ID) as Array<Record<string, unknown>>;
    const childStatement = this.db.prepare("SELECT * FROM life_events WHERE parent_event_id=? AND hidden_at IS NULL AND deleted_at IS NULL ORDER BY created_at");
    const usage = this.db.prepare("SELECT * FROM ai_usage_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(USER_ID) as Array<Record<string, unknown>>;
    return {
      user: { name: user.name, longTermGoal: user.long_term_goal, currentStage: user.current_stage },
      entries: entries.map((record) => ({ id: String(record.id), content: String(record.content), category: String(record.category), tags: jsonArray(record.tags_json), importance: Number(record.importance), occurredAt: String(record.occurred_at), allowAi: Boolean(record.allow_ai), status: String(record.status), dataKind: String(record.data_kind), duplicateOfEntryId: record.duplicate_of_entry_id ? String(record.duplicate_of_entry_id) : null })),
      proposals: proposals.map((record) => this.proposalRecord(record)),
      facts: activeFacts.map((record) => this.factRecord(record)),
      inactiveFacts: inactiveFacts.map((record) => this.factRecord(record)),
      timeline: timeline.map((record) => ({ id: String(record.id), eventType: String(record.event_type), title: String(record.title), summary: String(record.summary), sourceId: String(record.source_id), occurredAt: String(record.occurred_at), children: (childStatement.all(record.id) as Array<Record<string, unknown>>).map((child) => ({ id: String(child.id), eventType: String(child.event_type), title: String(child.title), summary: String(child.summary) })) })),
      cleanupPreview: this.cleanupPreview(),
      usage: usage.map((record) => ({ id: String(record.id), purpose: String(record.purpose), provider: String(record.provider || (record.mode === "demo" ? "demo" : "openai")), taskClass: record.task_class ? String(record.task_class) : null, requestId: record.request_id ? String(record.request_id) : null, model: String(record.model), mode: String(record.mode), promptVersion: record.prompt_version ? String(record.prompt_version) : null, inputTokens: record.input_tokens === null ? null : Number(record.input_tokens), outputTokens: record.output_tokens === null ? null : Number(record.output_tokens), latencyMs: Number(record.latency_ms), success: Boolean(record.success), errorCode: record.error_code ? String(record.error_code) : null, createdAt: String(record.created_at) })),
    };
  }
}

let singleton: ProfileRepository | undefined;
export function getRepository() {
  if (!singleton) {
    const configured = process.env.GENESIS_DB_PATH || "./data/genesis.db";
    singleton = new ProfileRepository(path.resolve(/* turbopackIgnore: true */ process.cwd(), configured));
  }
  return singleton;
}
