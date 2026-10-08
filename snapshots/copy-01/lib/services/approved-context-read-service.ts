import {
  approvedContextProjectionSchema,
  contextEligibilityDecisionSchema,
  contextPurposeSchema,
  type ApprovedContextProjection,
  type ContextEligibilityDecision,
  type ContextFreshnessState,
  type ContextPurpose,
  type ContextProjectionSourceDomain,
} from "@/lib/domain/approved-context-projection";
import { contentHash } from "@/lib/domain/fingerprint";
import { isPurposeAllowed, loadApprovedContextSource } from "@/lib/services/approved-context-policy-service";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;

const parseStrings = (value: unknown): string[] => {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const parseObject = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export type ApprovedContextInspection = {
  projection: ApprovedContextProjection;
  decision: ContextEligibilityDecision;
};

export class ApprovedContextReadService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly userId = USER_ID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  read(rawPurpose: ContextPurpose) {
    const purpose = contextPurposeSchema.parse(rawPurpose);
    const inspected = this.inspect(purpose).filter(({ decision }) => decision.eligible);
    return { purpose, items: inspected.map(({ projection }) => projection) };
  }

  inspect(rawPurpose: ContextPurpose): ApprovedContextInspection[] {
    const purpose = contextPurposeSchema.parse(rawPurpose);
    const rows = this.repository.db.prepare(`SELECT projection.*,receipt.id receipt_id,receipt.source_version receipt_source_version,
      receipt.payload_hash receipt_payload_hash,receipt.result receipt_result
      FROM approved_context_projections projection
      LEFT JOIN approved_context_projection_receipts receipt ON receipt.projection_id=projection.id AND receipt.user_id=projection.user_id
      WHERE projection.user_id=? AND projection.context_purpose=?
      ORDER BY projection.projected_at DESC,projection.projection_version DESC`).all(this.userId, purpose) as Row[];
    return rows.map((row) => this.inspectRow(row, purpose));
  }

  evaluate(projectionId: string, rawPurpose: ContextPurpose): ContextEligibilityDecision | null {
    const purpose = contextPurposeSchema.parse(rawPurpose);
    const row = this.repository.db.prepare(`SELECT projection.*,receipt.id receipt_id,receipt.source_version receipt_source_version,
      receipt.payload_hash receipt_payload_hash,receipt.result receipt_result
      FROM approved_context_projections projection
      LEFT JOIN approved_context_projection_receipts receipt ON receipt.projection_id=projection.id AND receipt.user_id=projection.user_id
      WHERE projection.id=? AND projection.user_id=?`).get(projectionId, this.userId) as Row | undefined;
    return row ? this.inspectRow(row, purpose).decision : null;
  }

  private inspectRow(row: Row, purpose: ContextPurpose): ApprovedContextInspection {
    const events = this.repository.db.prepare(`SELECT event_type,superseded_by,created_at FROM approved_context_projection_events
      WHERE projection_id=? AND user_id=? ORDER BY event_sequence DESC`).all(row.id, this.userId) as Row[];
    const revoked = events.find((event) => event.event_type === "revoked");
    const superseded = events.find((event) => event.event_type === "superseded");
    let freshness: ContextFreshnessState = "fresh";
    const reasons: string[] = [];
    let currentSourceVersion = String(row.source_version);
    let purposeAllowed = false;

    if (revoked) {
      freshness = "revoked";
      reasons.push("Projection was explicitly revoked by the owner.");
    } else if (superseded) {
      freshness = "superseded";
      reasons.push("A newer confirmed Context projection superseded this projection.");
    } else if (row.expires_at && new Date(String(row.expires_at)).getTime() <= this.clock().getTime()) {
      freshness = "expired";
      reasons.push("Projection has expired.");
    }

    try {
      const current = loadApprovedContextSource(this.repository, this.userId, row.source_domain as ContextProjectionSourceDomain, String(row.source_record_id));
      currentSourceVersion = current.sourceVersion;
      purposeAllowed = isPurposeAllowed(current, purpose);
      if (freshness === "fresh" && current.sourceVersion !== row.source_version) {
        freshness = "stale";
        reasons.push("Formal source version changed after projection confirmation.");
      }
    } catch {
      if (freshness === "fresh") freshness = "stale";
      reasons.push("Formal source is no longer eligible or no longer exists for this owner.");
    }

    const receiptValid = Boolean(row.receipt_id) && row.receipt_result === "committed" && row.receipt_source_version === row.source_version && row.receipt_payload_hash === row.payload_hash && contentHash(String(row.payload_json)) === row.payload_hash;
    if (!receiptValid) reasons.push("A matching immutable committed Projection Receipt is required.");
    if (String(row.context_purpose) !== purpose || !purposeAllowed) reasons.push("Projection is not eligible for the requested Context purpose.");
    const eligible = freshness === "fresh" && receiptValid && String(row.context_purpose) === purpose && purposeAllowed;
    if (eligible) reasons.push("Formal source, owner, purpose, source version, and Projection Receipt are valid.");

    const projection = approvedContextProjectionSchema.parse({
      projectionId: row.id,
      ownerId: row.user_id,
      sourceDomain: row.source_domain,
      sourceRecordId: row.source_record_id,
      sourceVersion: row.source_version,
      sourceType: row.source_type,
      sourceTruthStatus: row.source_truth_status,
      projectionReceiptId: row.receipt_id,
      projectionVersion: Number(row.projection_version),
      purpose: row.context_purpose,
      trustClass: row.trust_class,
      evidenceRefs: parseStrings(row.evidence_refs_json),
      provenanceRefs: parseStrings(row.provenance_refs_json),
      createdAt: row.created_at,
      approvedAt: row.approved_at,
      projectedAt: row.projected_at,
      expiresAt: row.expires_at ?? null,
      revokedAt: revoked?.created_at ?? null,
      supersededBy: superseded?.superseded_by ?? null,
      freshness,
      limitations: parseStrings(row.limitations_json),
      contextSchemaVersion: row.context_schema_version,
      contextPayload: parseObject(row.payload_json),
    });
    const decision = contextEligibilityDecisionSchema.parse({
      projectionId: row.id,
      eligible,
      reasons,
      sourceVersion: currentSourceVersion,
      receiptId: row.receipt_id ?? null,
      trustClass: row.trust_class,
      purpose,
      freshness,
    });
    return { projection, decision };
  }
}
