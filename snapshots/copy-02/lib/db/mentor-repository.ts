import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import type {
  MentorAnalysisRecord,
  MentorDeepAnalysis,
  MentorPerspective,
} from "@/lib/domain/mentor";

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

export type MentorRecordMeta = {
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  upstreamRequestId?: string | null;
  fallbackReason?: string | null;
};

export class MentorRepository {
  constructor(private readonly repository: ProfileRepository) {}

  private get db() { return this.repository.db; }

  byRequest(clientRequestId: string): MentorAnalysisRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM mentor_analyses WHERE user_id=? AND client_request_id=?",
    ).get(USER_ID, clientRequestId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  save(input: {
    clientRequestId: string;
    question: string;
    contextNote: string;
    requestedPerspectives: MentorPerspective[];
    analysis: MentorDeepAnalysis;
    meta: MentorRecordMeta;
  }): MentorAnalysisRecord & { duplicate: boolean } {
    const existing = this.byRequest(input.clientRequestId);
    if (existing) return { ...existing, duplicate: true };
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO mentor_analyses
       (id,user_id,client_request_id,question,context_note,requested_perspectives_json,facts_json,evidence_summary,patterns_json,possible_causes_json,counter_explanation,contradictions_json,long_term_impact,strategic_choices_json,actions_json,perspectives_json,source_refs_json,source_details_json,confidence,limitations_json,provider,model,model_mode,prompt_version,upstream_request_id,fallback_reason,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id, USER_ID, input.clientRequestId, input.question, input.contextNote,
      json(input.requestedPerspectives), json(input.analysis.facts), input.analysis.evidenceSummary,
      json(input.analysis.patterns), json(input.analysis.possibleCauses), input.analysis.counterExplanation,
      json(input.analysis.contradictions), input.analysis.longTermImpact,
      json(input.analysis.strategicChoices), json(input.analysis.actions),
      json(input.analysis.perspectives), json(input.analysis.sourceRefs), json(input.analysis.sourceDetails), input.analysis.confidence,
      json(input.analysis.limitations), input.meta.provider, input.meta.model, input.meta.modelMode,
      input.meta.promptVersion, input.meta.upstreamRequestId ?? null,
      input.meta.fallbackReason ?? null, now(),
    );
    this.db.prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)",
    ).run(randomUUID(), USER_ID, "mentor.deep_analysis_created", "mentor_analysis", id, json({
      question: input.question,
      sourceRefs: input.analysis.sourceRefs,
      perspectives: input.requestedPerspectives,
      provider: input.meta.provider,
    }), now());
    return { ...this.byRequest(input.clientRequestId)!, duplicate: false };
  }

  list(limit = 8): MentorAnalysisRecord[] {
    return (this.db.prepare(
      "SELECT * FROM mentor_analyses WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
    ).all(USER_ID, Math.max(1, Math.min(30, limit))) as Array<Record<string, unknown>>)
      .map((row) => this.map(row));
  }

  private map(row: Record<string, unknown>): MentorAnalysisRecord {
    const record = mapped(row);
    return {
      ...record,
      requestedPerspectives: parseJson(record.requestedPerspectivesJson, []),
      facts: parseJson(record.factsJson, []),
      patterns: parseJson(record.patternsJson, []),
      possibleCauses: parseJson(record.possibleCausesJson, []),
      contradictions: parseJson(record.contradictionsJson, []),
      strategicChoices: parseJson(record.strategicChoicesJson, []),
      actions: parseJson(record.actionsJson, []),
      perspectives: parseJson(record.perspectivesJson, []),
      sourceRefs: parseJson(record.sourceRefsJson, []),
      sourceDetails: parseJson(record.sourceDetailsJson, []),
      limitations: parseJson(record.limitationsJson, []),
    } as unknown as MentorAnalysisRecord;
  }
}
