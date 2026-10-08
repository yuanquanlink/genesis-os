import { randomUUID } from "node:crypto";
import { contentHash } from "@/lib/domain/fingerprint";
import { alignmentCandidateSchema, alignmentCreateSchema, type AlignmentCandidate } from "@/lib/domain/strategy-mission-alignment";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

function words(value: string) {
  return new Set(value.toLocaleLowerCase("en-US").replace(/[^a-z0-9\u4e00-\u9fff]+/gi, " ").split(/\s+/).filter((item) => item.length >= 3 && item !== "ev" && !/^ev\d/.test(item) && !/^[0-9a-f]{8,}$/.test(item)));
}

function textValues(value: unknown): string {
  if (typeof value === "string") {
    try { return textValues(JSON.parse(value)); } catch { return value; }
  }
  if (Array.isArray(value)) return value.map(textValues).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(textValues).join(" ");
  return "";
}

export class StrategyMissionAlignmentService {
  constructor(private readonly repository: ProfileRepository, private readonly userId = USER_ID) {}

  private sources(strategyId: string, missionId?: string, missionCandidateId?: string) {
    const db = this.repository.db;
    const strategy = db.prepare(`SELECT strategy.*,candidate.status AS candidate_status,candidate.id AS candidate_id
      FROM growth_strategies strategy JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id
      WHERE strategy.id=? AND strategy.user_id=? AND candidate.status='approved'`).get(strategyId, this.userId) as Row | undefined;
    if (!strategy) throw new Error("ALIGNMENT_APPROVED_STRATEGY_REQUIRED");
    let mission: Row | undefined;
    let candidate: Row | undefined;
    if (missionId) {
      mission = db.prepare(`SELECT mission.*,candidate.status AS candidate_status,candidate.mission_json,candidate.id AS candidate_id
        FROM missions mission JOIN mission_candidates candidate ON candidate.id=mission.source_candidate_id
        WHERE mission.id=? AND mission.user_id=? AND candidate.status='approved'`).get(missionId, this.userId) as Row | undefined;
      if (!mission) throw new Error("ALIGNMENT_APPROVED_MISSION_REQUIRED");
    } else {
      candidate = db.prepare("SELECT * FROM mission_candidates WHERE id=? AND user_id=? AND status='candidate'").get(missionCandidateId, this.userId) as Row | undefined;
      if (!candidate || String(candidate.strategy_id) !== String(strategyId)) throw new Error("ALIGNMENT_MISSION_CANDIDATE_REQUIRED");
    }
    const strategyPayload = `${textValues(strategy.diagnosis_json)}\n${textValues(strategy.strategies_json)}`;
    const missionPayload = mission
      ? `${String(mission.title)}\n${String(mission.description)}\n${String(mission.source_goal)}\n${String(mission.evidence_requirement)}`
      : textValues(candidate?.mission_json);
    const strategyVersionHash = contentHash(JSON.stringify({ id: strategy.id, createdAt: strategy.created_at, diagnosis: strategy.diagnosis_json, plans: strategy.strategies_json }));
    const missionVersionHash = contentHash(JSON.stringify({ id: mission?.id ?? candidate?.id, createdAt: mission?.updated_at ?? candidate?.created_at, payload: missionPayload }));
    return { strategy, mission, candidate, strategyPayload, missionPayload, strategyVersionHash, missionVersionHash };
  }

  create(raw: unknown) {
    const input = alignmentCreateSchema.parse(raw);
    const db = this.repository.db;
    const existing = db.prepare("SELECT id FROM strategy_mission_alignment_candidates WHERE user_id=? AND client_request_id=?").get(this.userId, input.clientRequestId) as { id: string } | undefined;
    if (existing) return { duplicate: true, candidate: this.get(existing.id) };
    const source = this.sources(input.strategyId, input.missionId, input.missionCandidateId);
    const strategyWords = words(source.strategyPayload);
    const missionWords = words(source.missionPayload);
    const shared = [...missionWords].filter((item) => strategyWords.has(item));
    const missionText = source.missionPayload.toLocaleLowerCase("en-US");
    const conflict = /conflict|contradict|unrelated|against|instead of|与.*冲突|不相关/i.test(missionText) && shared.length <= 1;
    const state: AlignmentCandidate["alignmentState"] = conflict ? "conflicting" : shared.length >= 4 ? "strongly_aligned" : shared.length >= 2 ? "aligned" : shared.length === 1 ? "partially_aligned" : "unclear";
    const factors = [
      { name: "shared strategy and mission terms", value: shared.length ? shared.join(", ") : "No shared terms found.", status: shared.length ? "supported" as const : "missing" as const },
      { name: "strategic priority", value: source.strategyPayload.includes(String(source.mission?.title ?? "")) ? "Mission title appears in strategy material." : "No direct priority match available.", status: source.strategyPayload.includes(String(source.mission?.title ?? "")) ? "supported" as const : "missing" as const },
      { name: "time and deadline", value: source.mission ? String(source.mission.deadline ?? "available") : "Mission Candidate deadline available.", status: "supported" as const },
      { name: "approved source evidence", value: parse<string[]>(source.strategy.evidence_ids_json, []).join(", ") || "No approved Evidence IDs supplied.", status: parse<string[]>(source.strategy.evidence_ids_json, []).length ? "supported" as const : "missing" as const },
    ];
    const sourceIds = [...new Set([String(source.strategy.id), String(source.mission?.id ?? source.candidate?.id), ...parse<string[]>(source.strategy.evidence_ids_json, []), ...parse<string[]>(source.mission?.evidence_ids_json ?? source.candidate?.evidence_ids_json, [])])];
    const candidate = alignmentCandidateSchema.parse({ strategyId: source.strategy.id, missionId: source.mission?.id ?? null, missionCandidateId: source.candidate?.id ?? null, strategyVersionHash: source.strategyVersionHash, missionVersionHash: source.missionVersionHash, alignmentState: state, factors, supportingSourceIds: shared.length ? sourceIds : [], conflictingSourceIds: conflict ? sourceIds : [], limitations: [shared.length ? "Deterministic term overlap is a signal, not a formal priority decision." : "No reliable shared factor was found; owner review and missing source data are required."], confidence: Math.min(.7, .2 + shared.length * .1), status: "pending", trustClass: "untrusted", contextEligible: false });
    const id = randomUUID();
    db.prepare(`INSERT INTO strategy_mission_alignment_candidates
      (id,user_id,client_request_id,strategy_id,mission_id,mission_candidate_id,strategy_version_hash,mission_version_hash,alignment_state,analysis_json,supporting_source_ids_json,conflicting_source_ids_json,limitations_json,confidence,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, this.userId, input.clientRequestId, source.strategy.id, source.mission?.id ?? null, source.candidate?.id ?? null, candidate.strategyVersionHash, candidate.missionVersionHash, candidate.alignmentState, JSON.stringify(candidate.factors), JSON.stringify(candidate.supportingSourceIds), JSON.stringify(candidate.conflictingSourceIds), JSON.stringify(candidate.limitations), candidate.confidence, now());
    return { duplicate: false, candidate: this.get(id) };
  }

  get(id: string) {
    const row = this.repository.db.prepare("SELECT * FROM strategy_mission_alignment_candidates WHERE id=? AND user_id=?").get(id, this.userId) as Row | undefined;
    if (!row) return null;
    return { id: String(row.id), userId: String(row.user_id), ...alignmentCandidateSchema.parse({ strategyId: row.strategy_id, missionId: row.mission_id, missionCandidateId: row.mission_candidate_id, strategyVersionHash: row.strategy_version_hash, missionVersionHash: row.mission_version_hash, alignmentState: row.alignment_state, factors: parse(row.analysis_json, []), supportingSourceIds: parse(row.supporting_source_ids_json, []), conflictingSourceIds: parse(row.conflicting_source_ids_json, []), limitations: parse(row.limitations_json, []), confidence: Number(row.confidence), status: row.status, trustClass: row.trust_class, contextEligible: Boolean(row.context_eligible) }) };
  }

  assertFresh(id: string) {
    const row = this.repository.db.prepare("SELECT * FROM strategy_mission_alignment_candidates WHERE id=? AND user_id=?").get(id, this.userId) as Row | undefined;
    if (!row) throw new Error("ALIGNMENT_NOT_FOUND");
    const source = this.sources(String(row.strategy_id), row.mission_id ? String(row.mission_id) : undefined, row.mission_candidate_id ? String(row.mission_candidate_id) : undefined);
    if (source.strategyVersionHash !== String(row.strategy_version_hash)) throw new Error("ALIGNMENT_STALE_STRATEGY");
    if (source.missionVersionHash !== String(row.mission_version_hash)) throw new Error("ALIGNMENT_STALE_MISSION");
    return true;
  }
}
