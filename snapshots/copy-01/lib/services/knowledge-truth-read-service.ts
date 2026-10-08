import type { ProfileRepository } from "@/lib/db/repository";
import {
  personalKnowledgeTruthReadModelSchema,
  truthCandidateReadItemSchema,
  truthReadItemSchema,
  type PersonalKnowledgeTruthReadModel,
  type TruthCandidateReadItem,
  type TruthReadItem,
} from "@/lib/domain/knowledge-truth";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function finiteScore(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function decisionState(row: Row): TruthCandidateReadItem["approvalState"] {
  if (row.status === "approved") return "satisfied";
  if (row.status === "rejected") return "rejected";
  return "required";
}

export class KnowledgeTruthReadService {
  constructor(private readonly repository: ProfileRepository) {}

  snapshot(limit = 100): PersonalKnowledgeTruthReadModel {
    const boundedLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
    const references = this.references(boundedLimit);
    const userRecords = this.userRecords(boundedLimit);
    const candidates = this.memoryCandidates(boundedLimit);
    const confirmedPersonalFacts = this.confirmedMemories(boundedLimit);

    return personalKnowledgeTruthReadModelSchema.parse({
      references,
      userRecords,
      candidates,
      confirmedPersonalFacts,
      // Existing Growth Graph and Mastery remain authoritative. Step 1 does not
      // reinterpret or project their state into a new capability read model.
      demonstratedCapabilities: [],
      contextIndex: {
        referenceRecordIds: references.map((item) => item.recordId),
        untrustedRecordIds: userRecords.map((item) => item.recordId),
        formalRecordIds: confirmedPersonalFacts.map((item) => item.recordId),
        excludedCandidateIds: candidates.map((item) => item.candidateId),
      },
      meta: {
        generatedAt: new Date().toISOString(),
        contractVersion: "genesis-truth-v1",
        readOnly: true,
      },
    });
  }

  private references(limit: number): TruthReadItem[] {
    const rows = this.repository.db.prepare(`
      SELECT source.id, source.title, source.url, source.summary,
        source.relevance_score, source.retrieved_at, source.provider
      FROM research_sources source
      JOIN research_runs run ON run.id=source.run_id
      WHERE run.user_id=? AND run.status='completed'
      ORDER BY source.retrieved_at DESC, source.relevance_score DESC
      LIMIT ?
    `).all(USER_ID, limit) as Row[];

    return rows.map((row) => truthReadItemSchema.parse({
      recordId: String(row.id),
      userId: USER_ID,
      truthClass: "reference",
      lifecycleState: "reference_only",
      approvalState: "not_applicable",
      contextEligibility: "reference_context",
      content: String(row.summary),
      sourceIds: [String(row.id)],
      provenance: {
        sourceId: String(row.id),
        sourceType: "research_source",
        origin: String(row.url),
        provider: String(row.provider),
        capturedAt: String(row.retrieved_at),
        contentHash: null,
        validationStatus: "untrusted",
      },
      confidence: null,
      rankingScore: finiteScore(row.relevance_score),
      occurredAt: String(row.retrieved_at),
      limitations: [
        "External research is untrusted reference material.",
        "Provider relevance is a ranking score, not truth confidence.",
      ],
    }));
  }

  private userRecords(limit: number): TruthReadItem[] {
    const rows = this.repository.db.prepare(`
      SELECT id,content,source,content_hash,created_at
      FROM knowledge_items
      WHERE user_id=? AND data_kind='user'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(USER_ID, limit) as Row[];

    return rows.map((row) => truthReadItemSchema.parse({
      recordId: String(row.id),
      userId: USER_ID,
      truthClass: "user_record",
      lifecycleState: "recorded",
      approvalState: "not_applicable",
      contextEligibility: "untrusted_context",
      content: String(row.content),
      sourceIds: [String(row.id)],
      provenance: {
        sourceId: String(row.id),
        sourceType: "knowledge_item",
        origin: String(row.source),
        provider: null,
        capturedAt: String(row.created_at),
        contentHash: String(row.content_hash),
        validationStatus: "user_owned",
      },
      confidence: null,
      rankingScore: null,
      occurredAt: String(row.created_at),
      limitations: ["A stored user record is not automatically a stable personal fact or demonstrated ability."],
    }));
  }

  private memoryCandidates(limit: number): TruthCandidateReadItem[] {
    const rows = this.repository.db.prepare(`
      SELECT id,candidate_json,source_knowledge_ids_json,confidence,status,
        created_at,approved_at,rejected_at
      FROM memory_candidates
      WHERE user_id=?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(USER_ID, limit) as Row[];

    return rows.map((row) => {
      const candidate = parseJson<Record<string, unknown> | null>(row.candidate_json, null);
      const sourceIds = parseJson<unknown>(row.source_knowledge_ids_json, []);
      const validSources = Array.isArray(sourceIds) && sourceIds.every((id) => typeof id === "string" && id.length > 0);
      const content = candidate && typeof candidate.content === "string" ? candidate.content : null;
      const issues = [
        ...(content ? [] : ["Candidate content is malformed or unavailable."]),
        ...(validSources && sourceIds.length ? [] : ["Candidate source IDs are malformed or unavailable."]),
      ];
      const decidedAt = row.status === "approved" ? row.approved_at : row.status === "rejected" ? row.rejected_at : null;

      return truthCandidateReadItemSchema.parse({
        candidateId: String(row.id),
        userId: USER_ID,
        entityType: "memory",
        status: row.status,
        approvalState: decisionState(row),
        contextEligibility: "excluded",
        content,
        sourceIds: validSources ? sourceIds : [],
        confidence: finiteScore(row.confidence),
        createdAt: String(row.created_at),
        decidedAt: decidedAt ? String(decidedAt) : null,
        valid: issues.length === 0,
        validationIssues: issues,
      });
    });
  }

  private confirmedMemories(limit: number): TruthReadItem[] {
    const rows = this.repository.db.prepare(`
      SELECT profile.id,profile.content,profile.content_hash,
        profile.source_candidate_id,profile.source_knowledge_ids_json,
        profile.confidence,profile.confirmed_at
      FROM user_memory_profile profile
      JOIN memory_candidates candidate ON candidate.id=profile.source_candidate_id
      WHERE profile.user_id=? AND profile.status='active' AND candidate.status='approved'
      ORDER BY profile.updated_at DESC
      LIMIT ?
    `).all(USER_ID, limit) as Row[];

    return rows.map((row) => {
      const sourceIds = parseJson<unknown>(row.source_knowledge_ids_json, []);
      const validSources = Array.isArray(sourceIds)
        ? sourceIds.filter((id): id is string => typeof id === "string" && id.length > 0)
        : [];
      return truthReadItemSchema.parse({
        recordId: String(row.id),
        userId: USER_ID,
        truthClass: "confirmed_personal_fact",
        lifecycleState: "approved",
        approvalState: "satisfied",
        contextEligibility: "formal_context",
        content: String(row.content),
        sourceIds: validSources,
        provenance: {
          sourceId: String(row.source_candidate_id),
          sourceType: "memory_candidate",
          origin: null,
          provider: null,
          capturedAt: String(row.confirmed_at),
          contentHash: String(row.content_hash),
          validationStatus: "approved",
        },
        confidence: finiteScore(row.confidence),
        rankingScore: null,
        occurredAt: String(row.confirmed_at),
        limitations: ["This is a user-approved Memory fact, not an Ability or Mastery decision."],
      });
    });
  }
}
