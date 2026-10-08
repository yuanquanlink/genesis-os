import { contentHash } from "@/lib/domain/fingerprint";
import {
  reviewCandidateTypeSchema,
  reviewEnvelopeSchema,
  reviewListOptionsSchema,
  reviewListResultSchema,
  reviewStateSchema,
  REVIEW_NO_FORMAL_WRITE_LIMITATION,
  type ReviewCandidateType,
  type ReviewDomain,
  type ReviewEnvelope,
  type ReviewListOptions,
  type ReviewListResult,
  type ReviewTarget,
} from "@/lib/domain/intelligence-review";
import type { ProfileRepository } from "@/lib/db/repository";

type Row = Record<string, unknown>;
const USER_ID = "genesis-owner";
const MAX_SUMMARY = 420;

type AdapterDefinition = {
  candidateType: ReviewCandidateType;
  domain: ReviewDomain;
  label: string;
  query: string;
  payloadColumn: string;
  sourceIdsColumn: string;
  confidenceColumn?: string;
  limitationsColumn?: string;
  idExpression?: string;
  targets: readonly ReviewTarget[];
};

const ADAPTERS: readonly AdapterDefinition[] = [
  {
    candidateType: "knowledge_object", domain: "knowledge", label: "AI Knowledge object",
    query: `SELECT id,user_id,created_at,object_type,created_by,approval_status,validation_status,
      id AS source_ids_json FROM knowledge_objects
      WHERE user_id=? AND created_by='ai' AND approval_status='pending' AND validation_status!='invalid' AND archived_at IS NULL`,
    payloadColumn: "object_type", sourceIdsColumn: "source_ids_json", targets: ["knowledge_approval"],
  },
  {
    candidateType: "knowledge_analysis", domain: "knowledge", label: "Knowledge analysis",
    query: `SELECT id,user_id,created_at,analysis_json AS payload_json,source_object_ids_json AS source_ids_json,
      confidence AS confidence_value,limitations_json AS limitations_json FROM knowledge_analysis_candidates
      WHERE user_id=? AND status='pending' AND trust_class='untrusted'`,
    payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
    limitationsColumn: "limitations_json", targets: [],
  },
  {
    candidateType: "learning_material", domain: "learning", label: "Learning material analysis",
    query: `SELECT material.id,material.user_id,material.created_at,
      json_object('analysisCandidateId',material.analysis_candidate_id) AS payload_json,
      analysis.source_object_ids_json AS source_ids_json,
      analysis.confidence AS confidence_value,
      json_array('Material Goal, Time, and Path outputs remain Candidates.') AS limitations_json
      FROM learning_material_candidate_sets material
      JOIN knowledge_analysis_candidates analysis ON analysis.id=material.analysis_candidate_id
      WHERE material.user_id=? AND material.status='pending' AND material.trust_class='untrusted'`,
    payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
    limitationsColumn: "limitations_json", idExpression: "material.id", targets: ["learning_goal_activation", "learning_path_activation"],
  },
  {
    candidateType: "personal_learning", domain: "learning", label: "Personal learning intelligence",
    query: `SELECT id,user_id,created_at,aggregate_json AS payload_json,related_source_ids_json AS source_ids_json,
      upstream_confidence AS confidence_value,
      json_array('Study workload is not mastery time; existing Mastery Gates remain mandatory.') AS limitations_json
      FROM personal_learning_intelligence_candidates
      WHERE user_id=? AND status='pending' AND trust_class='untrusted'`,
    payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
    limitationsColumn: "limitations_json", targets: ["learning_goal_activation", "learning_path_activation", "evidence_candidate_handoff"],
  },
  {
    candidateType: "personal_ability", domain: "ability", label: "Personal Ability and Growth intelligence",
    query: `SELECT ability.id,ability.user_id,ability.created_at,
      json_object('learningIntelligenceCandidateId',ability.learning_intelligence_candidate_id) AS payload_json,
      learning.related_source_ids_json AS source_ids_json,
      0.25 AS confidence_value,
      json_array('Ability and Growth require approved Evidence; this read model has no direct Ability projection.') AS limitations_json
      FROM personal_ability_candidate_sets ability
      JOIN personal_learning_intelligence_candidates learning ON learning.id=ability.learning_intelligence_candidate_id
      WHERE ability.user_id=? AND ability.status='pending' AND ability.trust_class='untrusted'`,
    payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
    limitationsColumn: "limitations_json", idExpression: "ability.id", targets: ["evidence_candidate_handoff"],
  },
  {
    candidateType: "digital_twin", domain: "profile", label: "Personal Digital Twin signal aggregation",
    query: `SELECT id,user_id,created_at,aggregate_json AS payload_json,source_signal_refs_json AS source_ids_json,
      0.25 AS confidence_value,
      json_array('Signals are not final personality or Profile truth.') AS limitations_json
      FROM digital_twin_aggregation_candidates
      WHERE user_id=? AND status='pending' AND trust_class='untrusted' AND final_truth_allowed=0 AND context_eligible=0`,
    payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
    limitationsColumn: "limitations_json", targets: ["profile_proposal", "memory_candidate"],
  },
  {
    candidateType: "decision_intelligence", domain: "decision", label: "Personal Decision intelligence",
    query: `SELECT id,user_id,created_at,aggregate_json AS payload_json,source_candidate_refs_json AS source_ids_json,
      0.25 AS confidence_value,
      json_array('Decision factors and trade-offs are unweighted Candidates, not judgments.') AS limitations_json
      FROM personal_decision_intelligence_candidates
      WHERE user_id=? AND status='pending' AND trust_class='untrusted' AND automatic_judgement_allowed=0 AND final_truth_allowed=0 AND context_eligible=0`,
    payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
    limitationsColumn: "limitations_json", targets: ["user_review_record"],
  },
  {
    candidateType: "reflection_mentor", domain: "reflection", label: "Reflection and Mentor intelligence",
    query: `SELECT id,user_id,created_at,aggregate_json AS payload_json,source_signal_refs_json AS source_ids_json,
      0.25 AS confidence_value,
      json_array('Reflection and Mentor output is not final judgment, Profile truth, or expert decision.') AS limitations_json
      FROM personal_reflection_mentor_intelligence_candidates
      WHERE user_id=? AND status='pending' AND trust_class='untrusted' AND final_user_judgement_allowed=0 AND final_truth_allowed=0 AND context_eligible=0`,
    payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
    limitationsColumn: "limitations_json", targets: ["user_review_record", "memory_candidate", "evidence_candidate_handoff"],
  },
  {
    candidateType: "mission_life_strategy", domain: "mission", label: "Mission and Life Strategy intelligence",
    query: `SELECT id,user_id,created_at,aggregate_json AS payload_json,source_candidate_refs_json AS source_ids_json,
      0.25 AS confidence_value,
      json_array('Mission, identity, values, priorities, and alignment remain owner-review Candidates.') AS limitations_json
      FROM personal_mission_life_strategy_intelligence_candidates
      WHERE user_id=? AND status='pending' AND trust_class='untrusted' AND final_mission_allowed=0 AND final_identity_allowed=0 AND context_eligible=0`,
    payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
    limitationsColumn: "limitations_json", targets: ["strategy_candidate_handoff", "mission_candidate_handoff", "user_review_record"],
  },
] as const;

const ALIGNMENT_ADAPTER: AdapterDefinition = {
  candidateType: "strategy_mission_alignment", domain: "strategy", label: "Strategy and Mission alignment review",
  query: `SELECT id,user_id,created_at,analysis_json AS payload_json,
    supporting_source_ids_json AS source_ids_json,confidence AS confidence_value,
    limitations_json AS limitations_json FROM strategy_mission_alignment_candidates
    WHERE user_id=? AND status='pending' AND trust_class='untrusted' AND context_eligible=0`,
  payloadColumn: "payload_json", sourceIdsColumn: "source_ids_json", confidenceColumn: "confidence_value",
  limitationsColumn: "limitations_json", targets: [],
};

const adapterByType = new Map(ADAPTERS.map((adapter) => [adapter.candidateType, adapter]));
const adapterByDomain = new Map<ReviewDomain, AdapterDefinition[]>();
for (const adapter of ADAPTERS) {
  const current = adapterByDomain.get(adapter.domain) ?? [];
  current.push(adapter);
  adapterByDomain.set(adapter.domain, current);
}

function parseJson(value: unknown): unknown {
  try { return JSON.parse(String(value)); } catch { return value; }
}

function jsonStrings(value: unknown) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function sourceIds(value: unknown): string[] {
  const parsed = parseJson(value);
  const result: string[] = [];
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      if (item.trim()) result.push(item.trim());
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((entry) => visit(entry));
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [nestedKey, nested] of Object.entries(item)) {
      if (/^(source|signal|candidate|knowledge|artifact|unit).*id$/i.test(nestedKey)) visit(nested);
      else if (nestedKey === "sourceIds" || nestedKey === "sourceSignals" || nestedKey === "sourceCandidateRefs") visit(nested);
    }
  };
  visit(parsed);
  return [...new Set(result)].slice(0, 64);
}

function strings(value: unknown, output: string[] = []) {
  if (output.length >= 12) return output;
  if (typeof value === "string" && value.trim()) output.push(value.trim().replace(/\s+/g, " ").slice(0, MAX_SUMMARY));
  else if (Array.isArray(value)) value.forEach((item) => strings(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => strings(item, output));
  return output;
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8").split("\u0000");
    return decoded.length === 2 && decoded[0] && decoded[1] ? { createdAt: decoded[0], reviewId: decoded[1] } : null;
  } catch { return null; }
}

function encodeCursor(createdAt: string, reviewId: string) {
  return Buffer.from(`${createdAt}\u0000${reviewId}`, "utf8").toString("base64url");
}

function cursorAfter(item: ReviewEnvelope, cursor: { createdAt: string; reviewId: string } | null) {
  if (!cursor) return true;
  return item.createdAt < cursor.createdAt || (item.createdAt === cursor.createdAt && item.reviewId < cursor.reviewId);
}

function boundedConfidence(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

export class IntelligenceReviewReadService {
  constructor(private readonly repository: ProfileRepository, private readonly userId = USER_ID) {}

  static adapterTypes() {
    return ADAPTERS.map((adapter) => adapter.candidateType);
  }

  private envelope(adapter: AdapterDefinition, row: Row): ReviewEnvelope {
    const payload = adapter.payloadColumn === "object_type"
      ? { objectType: String(row.object_type), createdBy: String(row.created_by), approvalStatus: String(row.approval_status), validationStatus: String(row.validation_status) }
      : parseJson(row[adapter.payloadColumn]);
    const observed = strings(payload).slice(0, 6);
    const source = sourceIds(row[adapter.sourceIdsColumn]);
    const limitations = [
      ...jsonStrings(adapter.limitationsColumn ? row[adapter.limitationsColumn] : []),
      REVIEW_NO_FORMAL_WRITE_LIMITATION,
    ].map((item) => item.trim()).filter(Boolean).slice(0, 16);
    const sourceCandidateHash = contentHash(JSON.stringify({
      candidateType: adapter.candidateType,
      id: row.id,
      payload,
      source,
      createdAt: row.created_at,
    }));
    return reviewEnvelopeSchema.parse({
      reviewId: `${adapter.candidateType}:${String(row.id)}`,
      candidateType: adapter.candidateType,
      domain: adapter.domain,
      userId: String(row.user_id),
      sourceCandidateId: String(row.id),
      sourceCandidateHash,
      createdAt: String(row.created_at),
      status: "pending",
      trustClass: "untrusted",
      observations: observed.length ? observed : [`${adapter.label} is available for owner review.`],
      inferences: [`${adapter.label} is an untrusted Candidate and is not formal user truth.`],
      sourceIds: source,
      confidence: boundedConfidence(adapter.confidenceColumn ? row[adapter.confidenceColumn] : 0.2),
      limitations,
      allowedTargets: [...adapter.targets],
      reviewState: this.reviewState(`${adapter.candidateType}:${String(row.id)}`),
      contextEligible: false,
      metadata: {
        adapter: adapter.candidateType,
        sourceTable: adapter.query.match(/FROM ([a-z_]+)/i)?.[1] ?? "allowlisted",
        payloadPreview: observed.slice(0, 3),
      },
    });
  }

  private reviewState(reviewId: string) {
    const events = this.repository.db.prepare(
      "SELECT action FROM intelligence_review_events WHERE user_id=? AND review_id=? ORDER BY event_sequence",
    ).all(this.userId, reviewId) as Array<{ action: string }>;
    let state: ReviewEnvelope["reviewState"] = "pending_review";
    for (const event of events) {
      if (event.action === "acknowledge") state = "acknowledged";
      else if (event.action === "defer") state = "deferred";
      else if (event.action === "reopen") state = "pending_review";
      else if (event.action === "reject") state = "rejected";
      else if (event.action === "request_revision") state = "revision_requested";
      else if (event.action === "authorize_projection") state = "projection_prepared";
    }
    return reviewStateSchema.parse(state);
  }

  private rows(adapter: AdapterDefinition) {
    return (this.repository.db.prepare(adapter.query).all(this.userId) as Row[]).map((row) => this.envelope(adapter, row));
  }

  private all(options: ReviewListOptions) {
    const adapters = options.candidateType
      ? [options.candidateType === "strategy_mission_alignment" ? ALIGNMENT_ADAPTER : adapterByType.get(options.candidateType)].filter((adapter): adapter is AdapterDefinition => Boolean(adapter))
      : options.domain
        ? (adapterByDomain.get(options.domain) ?? [])
        : [...ADAPTERS];
    return adapters.flatMap((adapter) => this.rows(adapter)).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.reviewId.localeCompare(left.reviewId));
  }

  list(raw: unknown = {}) : ReviewListResult {
    const options = reviewListOptionsSchema.parse(raw);
    const all = this.all(options);
    const cursor = decodeCursor(options.cursor);
    if (options.cursor && !cursor) throw new Error("INTELLIGENCE_REVIEW_CURSOR_INVALID");
    const visible = all.filter((item) => cursorAfter(item, cursor));
    const items = visible.slice(0, options.limit);
    const next = visible.length > options.limit ? items[items.length - 1] : undefined;
    return reviewListResultSchema.parse({
      items,
      nextCursor: next ? encodeCursor(next.createdAt, next.reviewId) : null,
      total: all.length,
    });
  }

  get(reviewId: string) {
    const separator = reviewId.indexOf(":");
    if (separator <= 0 || separator === reviewId.length - 1) return null;
    const candidateType = reviewCandidateTypeSchema.safeParse(reviewId.slice(0, separator));
    if (!candidateType.success) return null;
    const adapter = candidateType.data === "strategy_mission_alignment" ? ALIGNMENT_ADAPTER : adapterByType.get(candidateType.data);
    if (!adapter) return null;
    const row = this.repository.db.prepare(`${adapter.query} AND ${adapter.idExpression ?? "id"}=?`)
      .get(this.userId, reviewId.slice(separator + 1)) as Row | undefined;
    return row ? this.envelope(adapter, row) : null;
  }
}

export { ADAPTERS as PERSONAL_OPERATING_REVIEW_ADAPTERS };
