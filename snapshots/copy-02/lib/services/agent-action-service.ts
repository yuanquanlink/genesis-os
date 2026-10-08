import { randomUUID } from "node:crypto";
import { ContextEngine } from "@/lib/ai/context-engine";
import { EvidenceService } from "@/lib/services/evidence-service";
import { missionActionSchema, missionCandidateSchema, type MissionCandidate } from "@/lib/domain/mission";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
const ACTOR = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

export class AgentActionService {
  constructor(private readonly repository: ProfileRepository) {}

  private approvedStrategy() {
    return this.repository.db.prepare("SELECT strategy.* FROM growth_strategies strategy JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id WHERE strategy.user_id=? AND candidate.status='approved' ORDER BY strategy.created_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
  }

  private fallback(strategy: Row): MissionCandidate {
    const plans = parse<{ d7?: { goal?: string; actions?: string[]; successMetric?: string; risk?: string } }>(strategy.strategies_json, {});
    const d7 = plans.d7 || {};
    const goal = d7.goal || "Close one verifiable engineering delivery loop";
    const tasks = (d7.actions || ["Choose one bounded deliverable", "Record testable completion evidence"]).slice(0, 3);
    const evidenceIds = parse<string[]>(strategy.evidence_ids_json, ["U1"]);
    return missionCandidateSchema.parse({
      title: goal.slice(0, 180), description: "Turn the current approved strategy into one bounded, inspectable delivery loop before expanding scope.", sourceGoal: goal,
      priority: "high", deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(), evidenceRequirement: d7.successMetric || "A runnable artifact, test or verification result, and a concise retrospective.",
      dailyTasks: tasks, evidenceIds: evidenceIds.length ? evidenceIds : ["U1"], confidence: Number(strategy.confidence || 0.45), limitations: ["This is a Mission Candidate. It cannot create a formal mission until the user confirms it."],
    });
  }

  private mapCandidate(row: Row) {
    return { id: String(row.id), strategyId: String(row.strategy_id), ...missionCandidateSchema.parse(parse(row.mission_json, {})), status: String(row.status) as "candidate" | "approved" | "rejected", provider: String(row.provider), model: String(row.model), mode: String(row.model_mode), fallbackReason: row.fallback_reason ? String(row.fallback_reason) : null, createdAt: String(row.created_at) };
  }

  private mapMission(row: Row) {
    return { id: String(row.id), title: String(row.title), description: String(row.description), sourceGoal: String(row.source_goal), strategyId: String(row.strategy_id), status: String(row.status), priority: String(row.priority), deadline: String(row.deadline), evidenceRequirement: String(row.evidence_requirement), dailyTasks: parse<string[]>(row.daily_tasks_json, []), createdAt: String(row.created_at), completedAt: row.completed_at ? String(row.completed_at) : null };
  }

  snapshot() {
    const db = this.repository.db;
    const candidates = db.prepare("SELECT * FROM mission_candidates WHERE user_id=? ORDER BY created_at DESC LIMIT 30").all(USER_ID) as Row[];
    const missions = db.prepare("SELECT * FROM missions WHERE user_id=? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,priority,deadline LIMIT 30").all(USER_ID) as Row[];
    const evidence = db.prepare("SELECT link.mission_id,link.evidence_item_id,link.growth_candidate_id,link.completion_summary,link.created_at FROM mission_evidence link JOIN missions mission ON mission.id=link.mission_id WHERE mission.user_id=? ORDER BY link.created_at DESC LIMIT 30").all(USER_ID) as Row[];
    return { candidates: candidates.map((row) => this.mapCandidate(row)), missions: missions.map((row) => this.mapMission(row)), evidence: evidence.map((row) => ({ missionId: String(row.mission_id), evidenceId: String(row.evidence_item_id), growthCandidateId: row.growth_candidate_id ? String(row.growth_candidate_id) : null, completionSummary: String(row.completion_summary), createdAt: String(row.created_at) })) };
  }

  async generate(clientRequestId: string) {
    const db = this.repository.db;
    const existing = db.prepare("SELECT * FROM mission_candidates WHERE user_id=? AND client_request_id=?").get(USER_ID, clientRequestId) as Row | undefined;
    if (existing) return { duplicate: true, candidate: this.mapCandidate(existing), snapshot: this.snapshot() };
    const strategy = this.approvedStrategy();
    if (!strategy) return { duplicate: false, candidate: null, unavailable: "An approved Strategy is required before Genesis can generate a Mission Candidate.", snapshot: this.snapshot() };
    const previous = db.prepare("SELECT * FROM mission_candidates WHERE user_id=? AND strategy_id=? AND status='candidate' ORDER BY created_at DESC LIMIT 1").get(USER_ID, strategy.id) as Row | undefined;
    if (previous) return { duplicate: true, candidate: this.mapCandidate(previous), snapshot: this.snapshot() };
    const fallback = this.fallback(strategy);
    const allowedRefs = new Set(parse<string[]>(strategy.evidence_ids_json, ["U1"]));
    let candidate = fallback, provider = "demo", model = "local-agent-action-v1", mode: "demo" | "real" = "demo", fallbackReason: string | null = null;
    const context = new ContextEngine(this.repository);
    if (context.isRealConfigured()) {
      try {
        const prepared = context.prepare({ currentPage: "/missions", currentTask: "generate one execution mission", currentQuestion: "Turn the approved strategy into one user-confirmable mission.", currentChapter: null, currentConversation: [] }, "full", { includeOperationalMemory: true });
        const result = await context.complete({ module: "agent_action_mission", taskClass: "high_reasoning", maxOutputTokens: 1800, temperature: 0.1, reasoningMode: "standard", schema: missionCandidateSchema, schemaName: "missionCandidate", preparedContext: prepared, workingMemory: prepared.packet!.memory.working, messages: [{ role: "system", content: `Return JSON matching missionCandidate. Cite only approved strategy references: ${[...allowedRefs].join(",")}. Create one bounded mission candidate; do not create missions or modify Goal, Ability, Evidence, or Strategy.` }, { role: "user", content: `Approved strategy: ${strategy.strategies_json}` }] });
        candidate = missionCandidateSchema.parse(result.parsed); provider = result.provider; model = result.model; mode = "real";
      } catch { fallbackReason = "provider_failed"; }
    }
    if (candidate.evidenceIds.some((id) => !allowedRefs.has(id))) throw new Error("MISSION_INVALID_REFERENCE");
    const id = randomUUID();
    db.prepare("INSERT INTO mission_candidates (id,user_id,strategy_id,client_request_id,mission_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,fallback_reason,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'candidate',?)").run(id, USER_ID, strategy.id, clientRequestId, JSON.stringify(candidate), JSON.stringify(candidate.evidenceIds), candidate.confidence, provider, model, mode, "agent-action-v1", fallbackReason, now());
    return { duplicate: false, candidate: this.mapCandidate(db.prepare("SELECT * FROM mission_candidates WHERE id=?").get(id) as Row), snapshot: this.snapshot() };
  }

  approve(candidateId: string) {
    const db = this.repository.db;
    return db.transaction(() => {
      const row = db.prepare("SELECT * FROM mission_candidates WHERE id=? AND user_id=?").get(candidateId, USER_ID) as Row | undefined;
      if (!row) throw new Error("MISSION_CANDIDATE_NOT_FOUND");
      if (String(row.status) !== "candidate") throw new Error("MISSION_CANDIDATE_NOT_PENDING");
      const candidate = missionCandidateSchema.parse(parse(row.mission_json, {}));
      const timestamp = now();
      const update = db.prepare("UPDATE mission_candidates SET status='approved',approved_at=?,approved_by=? WHERE id=? AND user_id=? AND status='candidate'").run(timestamp, ACTOR, candidateId, USER_ID);
      if (!update.changes) throw new Error("MISSION_CANDIDATE_NOT_PENDING");
      const missionId = randomUUID();
      db.prepare("INSERT INTO missions (id,user_id,title,description,source_goal,strategy_id,source_candidate_id,status,priority,deadline,evidence_requirement,daily_tasks_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'active',?,?,?,?,?,?)").run(missionId, USER_ID, candidate.title, candidate.description, candidate.sourceGoal, row.strategy_id, candidateId, candidate.priority, candidate.deadline, candidate.evidenceRequirement, JSON.stringify(candidate.dailyTasks), timestamp, timestamp);
      db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, "mission.candidate_approved", "mission_candidate", candidateId, JSON.stringify({ status: "candidate" }), JSON.stringify({ status: "approved", missionId }), timestamp);
      return { candidateId, missionId, snapshot: this.snapshot() };
    })();
  }

  reject(candidateId: string, reason: string) {
    const db = this.repository.db;
    const timestamp = now();
    const changed = db.prepare("UPDATE mission_candidates SET status='rejected',rejected_at=?,rejected_by=?,reject_reason=? WHERE id=? AND user_id=? AND status='candidate'").run(timestamp, ACTOR, reason, candidateId, USER_ID);
    if (!changed.changes) throw new Error("MISSION_CANDIDATE_NOT_PENDING");
    db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, "mission.candidate_rejected", "mission_candidate", candidateId, JSON.stringify({ status: "candidate" }), JSON.stringify({ status: "rejected", reason }), timestamp);
    return { candidateId, snapshot: this.snapshot() };
  }

  async complete(missionId: string, completionSummary: string, clientRequestId: string) {
    const db = this.repository.db;
    const mission = db.prepare("SELECT * FROM missions WHERE id=? AND user_id=?").get(missionId, USER_ID) as Row | undefined;
    if (!mission) throw new Error("MISSION_NOT_FOUND");
    if (String(mission.status) !== "active") throw new Error("MISSION_NOT_ACTIVE");
    const evidenceService = new EvidenceService(this.repository);
    evidenceService.createManual({ action: "create", evidenceType: "project", source: `Mission: ${String(mission.title)}`, description: `${completionSummary}\nEvidence requirement: ${String(mission.evidence_requirement)}`, relatedAbility: "Engineering delivery", capturedAt: now(), dataKind: "user", clientRequestId });
    const evidence = db.prepare("SELECT id FROM evidence_items WHERE user_id=? AND source_type='manual' AND source_id=? ORDER BY created_at DESC LIMIT 1").get(USER_ID, clientRequestId) as { id: string } | undefined;
    if (!evidence) throw new Error("MISSION_EVIDENCE_NOT_CREATED");
    const timestamp = now();
    db.transaction(() => {
      const changed = db.prepare("UPDATE missions SET status='completed',completed_at=?,updated_at=? WHERE id=? AND user_id=? AND status='active'").run(timestamp, timestamp, missionId, USER_ID);
      if (!changed.changes) throw new Error("MISSION_NOT_ACTIVE");
      db.prepare("INSERT OR IGNORE INTO mission_evidence (id,mission_id,evidence_item_id,growth_candidate_id,completion_summary,created_at) VALUES (?,?,?,?,?,?)").run(randomUUID(), missionId, evidence.id, null, completionSummary, timestamp);
    })();
    let analysisPending = false;
    try { await evidenceService.analyze(); } catch { analysisPending = true; }
    const growthCandidate = db.prepare("SELECT candidate_id FROM evidence_evaluations WHERE evidence_item_id=? ORDER BY created_at DESC LIMIT 1").get(evidence.id) as { candidate_id: string | null } | undefined;
    if (growthCandidate?.candidate_id) db.prepare("UPDATE mission_evidence SET growth_candidate_id=? WHERE mission_id=? AND evidence_item_id=?").run(growthCandidate.candidate_id, missionId, evidence.id);
    return { missionId, evidenceId: evidence.id, growthCandidateId: growthCandidate?.candidate_id || null, analysisPending, snapshot: this.snapshot() };
  }

  transition(missionId: string, status: "failed" | "archived") {
    const db = this.repository.db, timestamp = now();
    const column = status === "failed" ? "failed_at" : "archived_at";
    const changed = db.prepare(`UPDATE missions SET status=?,${column}=?,updated_at=? WHERE id=? AND user_id=? AND status='active'`).run(status, timestamp, timestamp, missionId, USER_ID);
    if (!changed.changes) throw new Error("MISSION_NOT_ACTIVE");
    return { missionId, snapshot: this.snapshot() };
  }

  async execute(raw: unknown) {
    const input = missionActionSchema.parse(raw);
    if (input.action === "generate") return this.generate(input.clientRequestId);
    if (input.action === "approve") return this.approve(input.candidateId);
    if (input.action === "reject") return this.reject(input.candidateId, input.reason);
    if (input.action === "complete") return this.complete(input.missionId, input.completionSummary, input.clientRequestId);
    return this.transition(input.missionId, input.action === "fail" ? "failed" : "archived");
  }
}
