import { randomUUID } from "node:crypto";
import { contentHash } from "@/lib/domain/fingerprint";
import {
  APPROVED_CONTEXT_POLICY_VERSION,
  contextProjectionAuthorizationInputSchema,
  contextProjectionConfirmationInputSchema,
  contextProjectionPreviewInputSchema,
  contextProjectionPreviewSchema,
  contextProjectionRevocationInputSchema,
  type ContextProjectionPreview,
} from "@/lib/domain/approved-context-projection";
import { isPurposeAllowed, loadApprovedContextSource } from "@/lib/services/approved-context-policy-service";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();

export type ContextProjectionAuthorization = {
  id: string;
  sourceVersion: string;
  previewHash: string;
  purpose: ContextProjectionPreview["purpose"];
  createdAt: string;
  duplicate: boolean;
};

export type ContextProjectionConfirmation = {
  projectionId: string;
  receiptId: string;
  sourceVersion: string;
  purpose: ContextProjectionPreview["purpose"];
  trustClass: ContextProjectionPreview["trustClass"];
  projectedAt: string;
  duplicate: boolean;
};

export class ApprovedContextProjectionService {
  constructor(private readonly repository: ProfileRepository, private readonly userId = USER_ID) {}

  preview(raw: unknown): ContextProjectionPreview {
    const input = contextProjectionPreviewInputSchema.parse(raw);
    const source = loadApprovedContextSource(this.repository, this.userId, input.sourceDomain, input.sourceRecordId);
    if (!isPurposeAllowed(source, input.purpose)) throw new Error("APPROVED_CONTEXT_PURPOSE_NOT_ALLOWED");
    const expiresAt = input.expiresAt ?? null;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) throw new Error("APPROVED_CONTEXT_EXPIRY_MUST_BE_FUTURE");
    const previewHash = contentHash(JSON.stringify({
      policyVersion: APPROVED_CONTEXT_POLICY_VERSION,
      sourceDomain: source.sourceDomain,
      sourceRecordId: source.sourceRecordId,
      sourceVersion: source.sourceVersion,
      purpose: input.purpose,
      trustClass: source.trustClass,
      payloadHash: contentHash(JSON.stringify(source.contextPayload)),
      expiresAt,
    }));
    return contextProjectionPreviewSchema.parse({
      sourceDomain: source.sourceDomain,
      sourceRecordId: source.sourceRecordId,
      sourceVersion: source.sourceVersion,
      sourceType: source.sourceType,
      sourceTruthStatus: source.sourceTruthStatus,
      purpose: input.purpose,
      trustClass: source.trustClass,
      previewHash,
      eligible: true,
      reasons: ["Formal source truth exists.", "Purpose is allowed by deterministic policy.", "Explicit owner authorization and projection confirmation are still required."],
      evidenceRefs: source.evidenceRefs,
      provenanceRefs: source.provenanceRefs,
      limitations: source.limitations,
      expiresAt,
    });
  }

  authorize(raw: unknown): ContextProjectionAuthorization {
    const input = contextProjectionAuthorizationInputSchema.parse(raw);
    if (input.actor !== this.userId) throw new Error("APPROVED_CONTEXT_OWNER_AUTHORIZATION_REQUIRED");
    const preview = this.preview({ sourceDomain: input.sourceDomain, sourceRecordId: input.sourceRecordId, purpose: input.purpose, expiresAt: input.expiresAt ?? null });
    if (preview.sourceVersion !== input.sourceVersion) throw new Error("APPROVED_CONTEXT_STALE_SOURCE");
    if (preview.previewHash !== input.previewHash) throw new Error("APPROVED_CONTEXT_STALE_PREVIEW");
    const existing = this.repository.db.prepare("SELECT * FROM approved_context_projection_authorizations WHERE user_id=? AND client_request_id=?").get(this.userId, input.clientRequestId) as Row | undefined;
    if (existing) {
      const matches = existing.source_domain === input.sourceDomain && existing.source_record_id === input.sourceRecordId && existing.source_version === input.sourceVersion && existing.context_purpose === input.purpose && existing.preview_hash === input.previewHash;
      if (!matches) throw new Error("APPROVED_CONTEXT_IDEMPOTENCY_CONFLICT");
      return { id: String(existing.id), sourceVersion: String(existing.source_version), previewHash: String(existing.preview_hash), purpose: preview.purpose, createdAt: String(existing.created_at), duplicate: true };
    }
    const id = randomUUID();
    const createdAt = now();
    this.repository.db.prepare(`INSERT INTO approved_context_projection_authorizations
      (id,user_id,source_domain,source_record_id,source_version,context_purpose,preview_hash,expires_at,authorized_by,client_request_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, this.userId, input.sourceDomain, input.sourceRecordId, input.sourceVersion, input.purpose, input.previewHash, input.expiresAt ?? null, input.actor, input.clientRequestId, createdAt);
    return { id, sourceVersion: input.sourceVersion, previewHash: input.previewHash, purpose: input.purpose, createdAt, duplicate: false };
  }

  confirm(raw: unknown): ContextProjectionConfirmation {
    const input = contextProjectionConfirmationInputSchema.parse(raw);
    if (input.actor !== this.userId) throw new Error("APPROVED_CONTEXT_OWNER_CONFIRMATION_REQUIRED");
    const existingRequest = this.repository.db.prepare(`SELECT projection.id projection_id,receipt.id receipt_id,projection.source_version,
      projection.context_purpose,projection.trust_class,projection.projected_at,projection.authorization_id
      FROM approved_context_projections projection
      JOIN approved_context_projection_receipts receipt ON receipt.projection_id=projection.id AND receipt.user_id=projection.user_id
      WHERE projection.user_id=? AND projection.client_request_id=?`).get(this.userId, input.clientRequestId) as Row | undefined;
    if (existingRequest) {
      if (existingRequest.authorization_id !== input.authorizationId) throw new Error("APPROVED_CONTEXT_IDEMPOTENCY_CONFLICT");
      return this.confirmation(existingRequest, true);
    }
    const authorization = this.repository.db.prepare("SELECT * FROM approved_context_projection_authorizations WHERE id=? AND user_id=?").get(input.authorizationId, this.userId) as Row | undefined;
    if (!authorization) throw new Error("APPROVED_CONTEXT_AUTHORIZATION_REQUIRED");
    const preview = this.preview({
      sourceDomain: authorization.source_domain,
      sourceRecordId: authorization.source_record_id,
      purpose: authorization.context_purpose,
      expiresAt: authorization.expires_at ?? null,
    });
    if (preview.sourceVersion !== authorization.source_version) throw new Error("APPROVED_CONTEXT_STALE_SOURCE");
    if (preview.previewHash !== authorization.preview_hash) throw new Error("APPROVED_CONTEXT_STALE_PREVIEW");
    const source = loadApprovedContextSource(this.repository, this.userId, preview.sourceDomain, preview.sourceRecordId);
    const alreadyProjected = this.repository.db.prepare(`SELECT projection.id projection_id,receipt.id receipt_id,projection.source_version,
      projection.context_purpose,projection.trust_class,projection.projected_at,projection.authorization_id
      FROM approved_context_projections projection
      JOIN approved_context_projection_receipts receipt ON receipt.projection_id=projection.id AND receipt.user_id=projection.user_id
      WHERE projection.user_id=? AND projection.source_domain=? AND projection.source_record_id=? AND projection.source_version=? AND projection.context_purpose=?`)
      .get(this.userId, preview.sourceDomain, preview.sourceRecordId, preview.sourceVersion, preview.purpose) as Row | undefined;
    if (alreadyProjected) return this.confirmation(alreadyProjected, true);

    const projectionId = randomUUID();
    const receiptId = randomUUID();
    const projectedAt = now();
    const payloadJson = JSON.stringify(source.contextPayload);
    const payloadHash = contentHash(payloadJson);
    const projectionVersion = Number(this.repository.db.prepare(`SELECT COALESCE(MAX(projection_version),0)+1 FROM approved_context_projections
      WHERE user_id=? AND source_domain=? AND source_record_id=? AND context_purpose=?`).pluck().get(this.userId, preview.sourceDomain, preview.sourceRecordId, preview.purpose));
    const prior = this.repository.db.prepare(`SELECT id FROM approved_context_projections
      WHERE user_id=? AND source_domain=? AND source_record_id=? AND context_purpose=? ORDER BY projection_version DESC`).all(this.userId, preview.sourceDomain, preview.sourceRecordId, preview.purpose) as Array<{ id: string }>;

    this.repository.db.transaction(() => {
      this.repository.db.prepare(`INSERT INTO approved_context_projections
        (id,user_id,authorization_id,source_domain,source_record_id,source_version,source_type,source_truth_status,projection_version,
         context_purpose,trust_class,payload_json,payload_hash,evidence_refs_json,provenance_refs_json,limitations_json,context_schema_version,
         approved_at,projected_at,expires_at,client_request_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        projectionId, this.userId, input.authorizationId, source.sourceDomain, source.sourceRecordId, source.sourceVersion, source.sourceType,
        source.sourceTruthStatus, projectionVersion, preview.purpose, source.trustClass, payloadJson, payloadHash, JSON.stringify(source.evidenceRefs),
        JSON.stringify(source.provenanceRefs), JSON.stringify(source.limitations), source.contextSchemaVersion, source.approvedAt, projectedAt,
        authorization.expires_at ?? null, input.clientRequestId, projectedAt,
      );
      this.repository.db.prepare(`INSERT INTO approved_context_projection_receipts
        (id,user_id,projection_id,authorization_id,source_version,payload_hash,result,created_at) VALUES (?,?,?,?,?,?,'committed',?)`)
        .run(receiptId, this.userId, projectionId, input.authorizationId, source.sourceVersion, payloadHash, projectedAt);
      for (const previous of prior) {
        this.repository.db.prepare(`INSERT INTO approved_context_projection_events
          (id,user_id,projection_id,event_type,superseded_by,reason,actor,client_request_id,created_at)
          VALUES (?,?,?,'superseded',?,'A newer confirmed source projection superseded this Context projection.',?,?,?)`)
          .run(randomUUID(), this.userId, previous.id, projectionId, this.userId, randomUUID(), projectedAt);
      }
    })();
    return { projectionId, receiptId, sourceVersion: source.sourceVersion, purpose: preview.purpose, trustClass: source.trustClass, projectedAt, duplicate: false };
  }

  revoke(raw: unknown) {
    const input = contextProjectionRevocationInputSchema.parse(raw);
    if (input.actor !== this.userId) throw new Error("APPROVED_CONTEXT_OWNER_REVOCATION_REQUIRED");
    const projection = this.repository.db.prepare("SELECT id FROM approved_context_projections WHERE id=? AND user_id=?").get(input.projectionId, this.userId) as Row | undefined;
    if (!projection) throw new Error("APPROVED_CONTEXT_PROJECTION_NOT_FOUND");
    const existing = this.repository.db.prepare("SELECT * FROM approved_context_projection_events WHERE user_id=? AND client_request_id=?").get(this.userId, input.clientRequestId) as Row | undefined;
    if (existing) {
      if (existing.projection_id !== input.projectionId || existing.event_type !== "revoked") throw new Error("APPROVED_CONTEXT_IDEMPOTENCY_CONFLICT");
      return { id: String(existing.id), duplicate: true, createdAt: String(existing.created_at) };
    }
    const id = randomUUID();
    const createdAt = now();
    this.repository.db.prepare(`INSERT INTO approved_context_projection_events
      (id,user_id,projection_id,event_type,superseded_by,reason,actor,client_request_id,created_at)
      VALUES (?,?,?,'revoked',NULL,?,?,?,?)`).run(id, this.userId, input.projectionId, input.reason, input.actor, input.clientRequestId, createdAt);
    return { id, duplicate: false, createdAt };
  }

  private confirmation(row: Row, duplicate: boolean): ContextProjectionConfirmation {
    return {
      projectionId: String(row.projection_id), receiptId: String(row.receipt_id), sourceVersion: String(row.source_version),
      purpose: row.context_purpose as ContextProjectionConfirmation["purpose"], trustClass: row.trust_class as ContextProjectionConfirmation["trustClass"],
      projectedAt: String(row.projected_at), duplicate,
    };
  }
}
