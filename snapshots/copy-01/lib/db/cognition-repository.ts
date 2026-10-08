import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import type {
  CognitionContent,
  CognitionItemRecord,
  CognitionModuleId,
  CognitionReflectionAnalysis,
  CognitionReflectionRecord,
  CognitionSnapshot,
} from "@/lib/domain/cognition";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);
const parseJson = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};
const mapped = (record: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value,
  ])) as Record<string, unknown>;

type Meta = {
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  fallbackReason?: string | null;
};

export class CognitionRepository {
  constructor(private readonly repository: ProfileRepository) {}
  private get db() { return this.repository.db; }

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)",
    ).run(randomUUID(), USER_ID, action, entityType, entityId, json(after), now());
  }

  itemByRequest(clientRequestId: string) {
    const row = this.db.prepare("SELECT * FROM cognition_items WHERE user_id=? AND client_request_id=?")
      .get(USER_ID, clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.mapItem(row) : null;
  }

  itemByPeriod(moduleId: CognitionModuleId, periodKey: string) {
    const row = this.db.prepare("SELECT * FROM cognition_items WHERE user_id=? AND module_id=? AND period_key=?")
      .get(USER_ID, moduleId, periodKey) as Record<string, unknown> | undefined;
    return row ? this.mapItem(row) : null;
  }

  item(id: string) {
    const row = this.db.prepare("SELECT * FROM cognition_items WHERE user_id=? AND id=?")
      .get(USER_ID, id) as Record<string, unknown> | undefined;
    return row ? this.mapItem(row) : null;
  }

  saveItem(input: {
    clientRequestId: string;
    periodKey: string;
    content: CognitionContent;
    meta: Meta;
  }): CognitionItemRecord & { duplicate: boolean } {
    const existing = this.itemByRequest(input.clientRequestId)
      ?? this.itemByPeriod(input.content.moduleId, input.periodKey);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    this.db.prepare(
      "INSERT INTO cognition_items (id,user_id,module_id,period_key,client_request_id,content_json,provider,model,model_mode,prompt_version,fallback_reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(id, USER_ID, input.content.moduleId, input.periodKey, input.clientRequestId,
      json(input.content), input.meta.provider, input.meta.model, input.meta.modelMode,
      input.meta.promptVersion, input.meta.fallbackReason ?? null, now());
    this.audit("cognition.item_created", "cognition_item", id, {
      moduleId: input.content.moduleId, periodKey: input.periodKey,
      sourceRefs: input.content.sourceRefs, provider: input.meta.provider,
    });
    return { ...this.item(id)!, duplicate: false };
  }

  reflectionByRequest(clientRequestId: string) {
    const row = this.db.prepare("SELECT * FROM cognition_reflections WHERE user_id=? AND client_request_id=?")
      .get(USER_ID, clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.mapReflection(row) : null;
  }

  reflectionForItem(itemId: string) {
    const row = this.db.prepare("SELECT * FROM cognition_reflections WHERE user_id=? AND item_id=?")
      .get(USER_ID, itemId) as Record<string, unknown> | undefined;
    return row ? this.mapReflection(row) : null;
  }

  saveRawReflection(input: {
    item: CognitionItemRecord;
    clientRequestId: string;
    rawReflection: string;
    decisionText: string;
    sourceEntryId: string;
  }): CognitionReflectionRecord & { duplicate: boolean } {
    const existing = this.reflectionByRequest(input.clientRequestId) ?? this.reflectionForItem(input.item.id);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    const timestamp = now();
    this.db.prepare(
      `INSERT INTO cognition_reflections
       (id,user_id,item_id,module_id,client_request_id,raw_reflection,decision_text,source_entry_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, USER_ID, input.item.id, input.item.moduleId, input.clientRequestId,
      input.rawReflection, input.decisionText, input.sourceEntryId, timestamp, timestamp);
    this.audit("cognition.reflection_saved", "cognition_reflection", id, {
      itemId: input.item.id, moduleId: input.item.moduleId, sourceEntryId: input.sourceEntryId,
    });
    return { ...this.reflectionForItem(input.item.id)!, duplicate: false };
  }

  finalizeReflection(id: string, analysis: CognitionReflectionAnalysis, meta: Meta) {
    this.db.prepare(
      `UPDATE cognition_reflections SET analysis_json=?,analysis_status='ready',source_refs_json=?,confidence=?,provider=?,model=?,model_mode=?,prompt_version=?,fallback_reason=?,updated_at=? WHERE id=? AND analysis_status='pending'`,
    ).run(json(analysis), json(analysis.sourceRefs), analysis.confidence, meta.provider,
      meta.model, meta.modelMode, meta.promptVersion, meta.fallbackReason ?? null, now(), id);
    this.audit("cognition.reflection_analyzed", "cognition_reflection", id, {
      moduleId: analysis.moduleId, sourceRefs: analysis.sourceRefs,
      provider: meta.provider, confidence: analysis.confidence,
    });
    const row = this.db.prepare("SELECT * FROM cognition_reflections WHERE id=?").get(id) as Record<string, unknown>;
    return this.mapReflection(row);
  }

  snapshot(): CognitionSnapshot {
    const items = (this.db.prepare("SELECT * FROM cognition_items WHERE user_id=? ORDER BY created_at DESC LIMIT 120")
      .all(USER_ID) as Array<Record<string, unknown>>).map((row) => this.mapItem(row));
    const reflections = (this.db.prepare("SELECT * FROM cognition_reflections WHERE user_id=? ORDER BY created_at DESC LIMIT 120")
      .all(USER_ID) as Array<Record<string, unknown>>).map((row) => this.mapReflection(row));
    return { items, reflections };
  }

  private mapItem(row: Record<string, unknown>): CognitionItemRecord {
    const record = mapped(row);
    return { ...record, content: parseJson(record.contentJson, {}) } as unknown as CognitionItemRecord;
  }

  private mapReflection(row: Record<string, unknown>): CognitionReflectionRecord {
    const record = mapped(row);
    return {
      ...record,
      analysis: record.analysisJson ? parseJson(record.analysisJson, null) : null,
      sourceRefs: parseJson(record.sourceRefsJson, []),
    } as unknown as CognitionReflectionRecord;
  }
}
