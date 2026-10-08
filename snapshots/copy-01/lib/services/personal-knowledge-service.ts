import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import { contentHash } from "@/lib/domain/fingerprint";
import {
  addKnowledgeCollectionMemberSchema,
  createKnowledgeArtifactSchema,
  createKnowledgeCollectionSchema,
  createKnowledgeRelationSchema,
  createKnowledgeSourceSchema,
  createKnowledgeUnitSchema,
  decideKnowledgeCandidateSchema,
  type KnowledgeCreator,
  type KnowledgeObjectType,
} from "@/lib/domain/personal-knowledge";

const USER_ID = "genesis-owner";
const ACTOR = "genesis-owner";
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function approvalFor(createdBy: KnowledgeCreator) {
  return createdBy === "ai" ? "pending" : "not_required";
}

export class PersonalKnowledgeService {
  constructor(private readonly repository: ProfileRepository) {}

  private audit(action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
    this.repository.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(randomUUID(), USER_ID, action, entityType, entityId, before === null ? null : JSON.stringify(before), JSON.stringify(after), now());
  }

  private object(id: string, expectedType?: KnowledgeObjectType) {
    const record = this.repository.db.prepare(
      "SELECT * FROM knowledge_objects WHERE id=? AND user_id=? AND archived_at IS NULL",
    ).get(id, USER_ID) as Row | undefined;
    if (!record) throw new Error("KNOWLEDGE_OBJECT_NOT_FOUND");
    if (expectedType && record.object_type !== expectedType) throw new Error("KNOWLEDGE_OBJECT_TYPE_MISMATCH");
    if (record.approval_status === "rejected") throw new Error("KNOWLEDGE_OBJECT_REJECTED");
    return record;
  }

  private sourceReferenceExists(id: string) {
    if (this.repository.db.prepare("SELECT 1 FROM knowledge_objects WHERE id=? AND user_id=?").get(id, USER_ID)) return true;
    if (this.repository.db.prepare("SELECT 1 FROM knowledge_items WHERE id=? AND user_id=? AND data_kind='user'").get(id, USER_ID)) return true;
    return Boolean(this.repository.db.prepare(`
      SELECT 1 FROM research_sources source
      JOIN research_runs run ON run.id=source.run_id
      WHERE source.id=? AND run.user_id=? AND run.status='completed'
    `).get(id, USER_ID));
  }

  private createObject(
    input: { clientRequestId: string; createdBy: KnowledgeCreator; validationStatus: string },
    objectType: KnowledgeObjectType,
    write: (id: string) => void,
  ) {
    const existing = this.repository.db.prepare(
      "SELECT id FROM knowledge_objects WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, objectId: existing.id, snapshot: this.snapshot() };

    const id = randomUUID();
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_objects (
          id,user_id,client_request_id,object_type,created_by,approval_status,
          validation_status,data_kind,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,'user',?,?)
      `).run(
        id, USER_ID, input.clientRequestId, objectType, input.createdBy,
        approvalFor(input.createdBy), input.validationStatus, timestamp, timestamp,
      );
      write(id);
      this.audit("knowledge.object_created", `knowledge_${objectType}`, id, null, {
        objectType,
        createdBy: input.createdBy,
        approvalStatus: approvalFor(input.createdBy),
        validationStatus: input.validationStatus,
      });
    })();
    return { duplicate: false, objectId: id, snapshot: this.snapshot() };
  }

  createSource(raw: unknown) {
    const input = createKnowledgeSourceSchema.parse(raw);
    if (input.legacyKnowledgeItemId) {
      const row = this.repository.db.prepare(
        "SELECT id FROM knowledge_items WHERE id=? AND user_id=? AND data_kind='user'",
      ).get(input.legacyKnowledgeItemId, USER_ID);
      if (!row) throw new Error("KNOWLEDGE_LEGACY_SOURCE_NOT_FOUND");
    }
    if (input.researchSourceId) {
      const row = this.repository.db.prepare(`
        SELECT source.id FROM research_sources source
        JOIN research_runs run ON run.id=source.run_id
        WHERE source.id=? AND run.user_id=? AND run.status='completed'
      `).get(input.researchSourceId, USER_ID);
      if (!row) throw new Error("KNOWLEDGE_RESEARCH_SOURCE_NOT_FOUND");
    }
    const sourceIds = [...new Set([
      ...input.provenance.sourceIds,
      ...(input.legacyKnowledgeItemId ? [input.legacyKnowledgeItemId] : []),
      ...(input.researchSourceId ? [input.researchSourceId] : []),
    ])];
    return this.createObject(input, "source", (id) => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_sources (
          id,title,source_type,ownership,original_locator,legacy_knowledge_item_id,
          research_source_id,provenance_json,captured_at
        ) VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        id, input.title, input.sourceType, input.ownership, input.originalLocator,
        input.legacyKnowledgeItemId, input.researchSourceId,
        JSON.stringify({ ...input.provenance, sourceIds }), input.provenance.capturedAt,
      );
    });
  }

  createArtifact(raw: unknown) {
    const input = createKnowledgeArtifactSchema.parse(raw);
    this.object(input.sourceId, "source");
    return this.createObject(input, "artifact", (id) => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_artifacts (
          id,source_id,artifact_type,content_reference,extraction_status,
          parser_name,parser_version,parser_metadata_json,content_hash,extracted_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(
        id, input.sourceId, input.artifactType, input.contentReference, input.extractionStatus,
        input.parser.name, input.parser.version, JSON.stringify(input.parser.metadata),
        input.contentHash, input.extractedAt,
      );
    });
  }

  createUnit(raw: unknown) {
    const input = createKnowledgeUnitSchema.parse(raw);
    this.object(input.sourceId, "source");
    if (input.artifactId) {
      this.object(input.artifactId, "artifact");
      const artifact = this.repository.db.prepare("SELECT source_id FROM knowledge_artifacts WHERE id=?").get(input.artifactId) as { source_id: string };
      if (artifact.source_id !== input.sourceId) throw new Error("KNOWLEDGE_SOURCE_RELATION_MISMATCH");
    }
    if (input.parentUnitId) {
      this.object(input.parentUnitId, "unit");
      const parent = this.repository.db.prepare("SELECT source_id FROM knowledge_units WHERE id=?").get(input.parentUnitId) as { source_id: string };
      if (parent.source_id !== input.sourceId) throw new Error("KNOWLEDGE_SOURCE_RELATION_MISMATCH");
    }
    return this.createObject(input, "unit", (id) => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_units (
          id,source_id,artifact_id,parent_unit_id,unit_type,title,content,
          original_locator,ordinal,content_hash
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(
        id, input.sourceId, input.artifactId, input.parentUnitId, input.unitType,
        input.title, input.content, input.originalLocator, input.ordinal, contentHash(input.content),
      );
    });
  }

  createRelation(raw: unknown) {
    const input = createKnowledgeRelationSchema.parse(raw);
    this.object(input.fromUnitId, "unit");
    this.object(input.toUnitId, "unit");
    if (input.sourceIds.some((id) => !this.sourceReferenceExists(id))) throw new Error("KNOWLEDGE_RELATION_SOURCE_NOT_FOUND");
    return this.createObject(input, "relation", (id) => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_relations (
          id,from_unit_id,to_unit_id,relation_type,rationale,source_ids_json
        ) VALUES (?,?,?,?,?,?)
      `).run(id, input.fromUnitId, input.toUnitId, input.relationType, input.rationale, JSON.stringify(input.sourceIds));
    });
  }

  createCollection(raw: unknown) {
    const input = createKnowledgeCollectionSchema.parse(raw);
    return this.createObject(input, "collection", (id) => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_collections (
          id,collection_type,title,description,linked_entity_id
        ) VALUES (?,?,?,?,?)
      `).run(id, input.collectionType, input.title, input.description, input.linkedEntityId);
    });
  }

  addCollectionMember(raw: unknown) {
    const input = addKnowledgeCollectionMemberSchema.parse(raw);
    this.object(input.collectionId, "collection");
    this.object(input.memberId, input.memberType);
    return this.createObject(input, "collection_member", (id) => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_collection_members (
          id,collection_id,source_id,artifact_id,unit_id,position
        ) VALUES (?,?,?,?,?,?)
      `).run(
        id, input.collectionId,
        input.memberType === "source" ? input.memberId : null,
        input.memberType === "artifact" ? input.memberId : null,
        input.memberType === "unit" ? input.memberId : null,
        input.position,
      );
    });
  }

  decide(raw: unknown) {
    const input = decideKnowledgeCandidateSchema.parse(raw);
    const object = this.repository.db.prepare(
      "SELECT * FROM knowledge_objects WHERE id=? AND user_id=?",
    ).get(input.objectId, USER_ID) as Row | undefined;
    if (!object) throw new Error("KNOWLEDGE_OBJECT_NOT_FOUND");
    if (object.created_by !== "ai" || object.approval_status !== "pending") throw new Error("KNOWLEDGE_CANDIDATE_NOT_PENDING");
    const decision = input.action === "approve" ? "approved" : "rejected";
    const timestamp = now();
    this.repository.db.transaction(() => {
      this.repository.db.prepare(`
        INSERT INTO knowledge_approval_decisions (
          id,user_id,object_id,decision,reason,decided_by,created_at
        ) VALUES (?,?,?,?,?,?,?)
      `).run(randomUUID(), USER_ID, input.objectId, decision, input.reason, ACTOR, timestamp);
      this.repository.db.prepare(
        "UPDATE knowledge_objects SET approval_status=?,updated_at=? WHERE id=? AND approval_status='pending'",
      ).run(decision, timestamp, input.objectId);
      this.audit(`knowledge.candidate_${decision}`, `knowledge_${String(object.object_type)}`, input.objectId, {
        approvalStatus: "pending",
      }, {
        approvalStatus: decision,
        decidedBy: ACTOR,
        reason: input.reason,
      });
    })();
    return { objectId: input.objectId, decision, snapshot: this.snapshot() };
  }

  snapshot() {
    const objects = this.repository.db.prepare(
      "SELECT * FROM knowledge_objects WHERE user_id=? ORDER BY created_at DESC",
    ).all(USER_ID) as Row[];
    const byId = new Map(objects.map((object) => [String(object.id), object]));
    const common = (id: unknown) => {
      const object = byId.get(String(id));
      if (!object) throw new Error("KNOWLEDGE_OBJECT_PROVENANCE_MISSING");
      return {
        id: String(object.id),
        createdBy: String(object.created_by),
        approvalStatus: String(object.approval_status),
        validationStatus: String(object.validation_status),
        createdAt: String(object.created_at),
        updatedAt: String(object.updated_at),
        archivedAt: object.archived_at ? String(object.archived_at) : null,
      };
    };
    const rows = (table: string) => this.repository.db.prepare(`
      SELECT item.* FROM ${table} item
      JOIN knowledge_objects object ON object.id=item.id
      WHERE object.user_id=?
    `).all(USER_ID) as Row[];
    const activeIds = objects
      .filter((object) => !object.archived_at && ["not_required", "approved"].includes(String(object.approval_status)) && object.validation_status !== "invalid")
      .map((object) => String(object.id));

    return {
      sources: rows("knowledge_sources").map((row) => ({ ...common(row.id), title: String(row.title), sourceType: String(row.source_type), ownership: String(row.ownership), originalLocator: row.original_locator ? String(row.original_locator) : null, legacyKnowledgeItemId: row.legacy_knowledge_item_id ? String(row.legacy_knowledge_item_id) : null, researchSourceId: row.research_source_id ? String(row.research_source_id) : null, provenance: parseJson<{ sourceIds: string[]; capturedAt: string; notes: string[] }>(row.provenance_json, { sourceIds: [], capturedAt: String(row.captured_at), notes: [] }), capturedAt: String(row.captured_at) })),
      artifacts: rows("knowledge_artifacts").map((row) => ({ ...common(row.id), sourceId: String(row.source_id), artifactType: String(row.artifact_type), contentReference: row.content_reference ? String(row.content_reference) : null, extractionStatus: String(row.extraction_status), parser: { name: row.parser_name ? String(row.parser_name) : null, version: row.parser_version ? String(row.parser_version) : null, metadata: parseJson(row.parser_metadata_json, {}) }, contentHash: row.content_hash ? String(row.content_hash) : null, extractedAt: row.extracted_at ? String(row.extracted_at) : null })),
      units: rows("knowledge_units").map((row) => ({ ...common(row.id), sourceId: String(row.source_id), artifactId: row.artifact_id ? String(row.artifact_id) : null, parentUnitId: row.parent_unit_id ? String(row.parent_unit_id) : null, unitType: String(row.unit_type), title: row.title ? String(row.title) : null, content: String(row.content), originalLocator: row.original_locator ? String(row.original_locator) : null, ordinal: Number(row.ordinal), contentHash: String(row.content_hash) })),
      relations: rows("knowledge_relations").map((row) => ({ ...common(row.id), fromUnitId: String(row.from_unit_id), toUnitId: String(row.to_unit_id), relationType: String(row.relation_type), rationale: row.rationale ? String(row.rationale) : null, sourceIds: parseJson<string[]>(row.source_ids_json, []) })),
      collections: rows("knowledge_collections").map((row) => ({ ...common(row.id), collectionType: String(row.collection_type), title: String(row.title), description: String(row.description), linkedEntityId: row.linked_entity_id ? String(row.linked_entity_id) : null })),
      collectionMembers: rows("knowledge_collection_members").map((row) => ({ ...common(row.id), collectionId: String(row.collection_id), memberType: row.source_id ? "source" : row.artifact_id ? "artifact" : "unit", memberId: String(row.source_id || row.artifact_id || row.unit_id), position: Number(row.position) })),
      candidates: objects.filter((object) => object.created_by === "ai").map((object) => common(object.id)),
      activeObjectIds: activeIds,
      meta: { readOnlyContextIntegration: false, automaticFormalWrites: false },
    };
  }
}
