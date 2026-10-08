import { randomUUID } from "node:crypto";
import { ContextEngine } from "@/lib/ai/context-engine";
import { EvidenceService } from "@/lib/services/evidence-service";
import { dailyPlanSchema, operatingBriefSchema, personalOperatingActionSchema, type DailyPlan, type OperatingBrief } from "@/lib/domain/personal-operating";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
const ACTOR = "genesis-owner";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

type OperatingState = {
  strategy: Row | null; mission: Row | null; learning: Row | null; memory: Row | null; evidence: Row[]; previousReflection: Row | null; sourceRefs: string[];
};

export class PersonalOperatingService {
  constructor(private readonly repository: ProfileRepository) {}

  private day(value = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  }

  private state(): OperatingState {
    const db = this.repository.db;
    const strategy = db.prepare("SELECT strategy.id,strategy.strategies_json,strategy.evidence_ids_json,strategy.confidence FROM growth_strategies strategy JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id WHERE strategy.user_id=? AND candidate.status='approved' ORDER BY strategy.created_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const mission = db.prepare("SELECT id,title,priority,deadline,daily_tasks_json,evidence_requirement FROM missions WHERE user_id=? AND status='active' ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,deadline LIMIT 1").get(USER_ID) as Row | undefined;
    const learning = db.prepare("SELECT goal.id,goal.title,goal.target_ability,mission.learning_objective,mission.estimated_minutes FROM learning_goals goal LEFT JOIN daily_learning_missions mission ON mission.goal_id=goal.id AND mission.mission_date=? WHERE goal.user_id=? AND goal.status='active' AND goal.deleted_at IS NULL ORDER BY goal.updated_at DESC LIMIT 1").get(this.day(), USER_ID) as Row | undefined;
    const memory = db.prepare("SELECT id,content,memory_type FROM user_memory_profile WHERE user_id=? AND status='active' ORDER BY importance DESC,updated_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const evidence = db.prepare("SELECT id,description,related_ability,verification_status FROM evidence_items WHERE user_id=? AND data_kind='user' AND verification_status='verified' ORDER BY captured_at DESC LIMIT 5").all(USER_ID) as Row[];
    const previousReflection = db.prepare("SELECT id,unfinished_reason,new_problems,tomorrow_adjustment FROM operating_reflections WHERE user_id=? ORDER BY reflection_date DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const refs = [
      strategy ? `STRATEGY:${String(strategy.id)}` : null,
      mission ? `MS:${String(mission.id)}` : null,
      learning ? `GOAL:${String(learning.id)}` : null,
      memory ? `MEM:${String(memory.id)}` : null,
      previousReflection ? `OR:${String(previousReflection.id)}` : null,
      ...evidence.map((item) => `EV:${String(item.id)}`),
    ].filter((value): value is string => Boolean(value));
    return { strategy: strategy || null, mission: mission || null, learning: learning || null, memory: memory || null, evidence, previousReflection: previousReflection || null, sourceRefs: [...new Set(refs.length ? refs : ["SYSTEM:operating-loop"]) ] };
  }

  private strategyFocus(strategy: Row | null) {
    const plans = parse<{ d7?: { goal?: string; actions?: string[]; avoid?: string[] }; d90?: { goal?: string } }>(strategy?.strategies_json, {});
    return { goal: plans.d7?.goal || plans.d90?.goal || "No approved Strategy is available; preserve one bounded delivery loop.", action: plans.d7?.actions?.[0] || "Finish one inspectable task.", avoid: plans.d7?.avoid?.[0] || "Do not expand scope before preserving evidence." };
  }

  private fallbackBrief(state: OperatingState): OperatingBrief {
    const strategy = this.strategyFocus(state.strategy);
    const tasks = state.mission ? parse<string[]>(state.mission.daily_tasks_json, []) : [];
    const learning = state.learning ? `${String(state.learning.title)}: ${String(state.learning.learning_objective || state.learning.target_ability || "create a bounded learning task")}` : "No active learning goal is recorded.";
    return operatingBriefSchema.parse({
      highestPriority: state.mission ? `${String(state.mission.title)}${tasks[0] ? ` - ${tasks[0]}` : ""}` : strategy.action,
      activeMission: state.mission ? `${String(state.mission.title)} (${String(state.mission.priority)}; due ${String(state.mission.deadline).slice(0, 10)})` : "No user-confirmed active Mission.",
      learningGoal: learning,
      riskReminder: state.previousReflection ? `Yesterday's unresolved constraint: ${String(state.previousReflection.unfinished_reason)}. ${strategy.avoid}` : strategy.avoid,
      strategicFocus: strategy.goal,
      sourceRefs: state.sourceRefs,
      confidence: Math.min(0.82, 0.4 + (state.mission ? 0.16 : 0) + (state.strategy ? 0.13 : 0) + (state.learning ? 0.09 : 0) + (state.evidence.length ? 0.06 : 0)),
      limitations: ["This brief is read-only. It cannot change Goal, Mission, Strategy, Evidence, or Ability."],
    });
  }

  private fallbackPlan(state: OperatingState, energy: number): DailyPlan {
    const strategy = this.strategyFocus(state.strategy);
    const missionTasks = state.mission ? parse<string[]>(state.mission.daily_tasks_json, []) : [];
    const candidates = [
      missionTasks[0] || (state.mission ? String(state.mission.title) : ""),
      state.learning ? String(state.learning.learning_objective || state.learning.target_ability || state.learning.title) : "",
      strategy.action,
    ].filter(Boolean).slice(0, 3);
    while (candidates.length < 2) candidates.push("Record one small, verifiable action and its remaining limitation.");
    const capacity = [45, 75, 120, 180, 240][energy - 1];
    const minutes = Math.max(15, Math.floor(capacity / candidates.length));
    return dailyPlanSchema.parse({
      title: `Today's bounded plan (${capacity} min capacity)`,
      actions: candidates.map((title) => ({ title, minutes, verification: "Save a concrete artifact, test result, or concise result note before moving on." })),
      totalMinutes: minutes * candidates.length,
      rationale: `Energy is self-reported as ${energy}/5. Mission priority, learning work, and approved Strategy are ordered before additional exploration.`,
      risk: strategy.avoid,
      sourceRefs: state.sourceRefs,
      confidence: Math.min(0.8, 0.38 + (state.mission ? 0.18 : 0) + (state.strategy ? 0.13 : 0) + (state.learning ? 0.09 : 0)),
      limitations: ["This is a Daily Plan Candidate. It becomes active only after explicit user confirmation."],
    });
  }

  private validateRefs(value: { sourceRefs: string[] }, allowed: Set<string>) {
    if (value.sourceRefs.some((ref) => !allowed.has(ref))) throw new Error("OPERATING_INVALID_REFERENCE");
  }

  private mapBrief(row: Row) {
    return { id: String(row.id), date: String(row.brief_date), brief: operatingBriefSchema.parse(parse(row.brief_json, {})), provider: String(row.provider), model: String(row.model), mode: String(row.model_mode), fallbackReason: row.fallback_reason ? String(row.fallback_reason) : null, createdAt: String(row.created_at) };
  }

  private mapCandidate(row: Row) {
    return { id: String(row.id), date: String(row.plan_date), energy: Number(row.energy), plan: dailyPlanSchema.parse(parse(row.plan_json, {})), status: String(row.status) as "candidate" | "approved" | "rejected", provider: String(row.provider), model: String(row.model), mode: String(row.model_mode), fallbackReason: row.fallback_reason ? String(row.fallback_reason) : null, createdAt: String(row.created_at) };
  }

  private mapPlan(row: Row) {
    return { id: String(row.id), date: String(row.plan_date), energy: Number(row.energy), plan: dailyPlanSchema.parse(parse(row.plan_json, {})), status: String(row.status), sourceCandidateId: String(row.source_candidate_id), createdAt: String(row.created_at) };
  }

  snapshot() {
    const db = this.repository.db;
    const date = this.day();
    const brief = db.prepare("SELECT * FROM morning_briefs WHERE user_id=? AND brief_date=?").get(USER_ID, date) as Row | undefined;
    const candidates = db.prepare("SELECT * FROM daily_plan_candidates WHERE user_id=? AND plan_date=? ORDER BY created_at DESC").all(USER_ID, date) as Row[];
    const plan = db.prepare("SELECT * FROM daily_plans WHERE user_id=? AND plan_date=? AND status='active'").get(USER_ID, date) as Row | undefined;
    const reflection = db.prepare("SELECT * FROM operating_reflections WHERE user_id=? AND reflection_date=?").get(USER_ID, date) as Row | undefined;
    const state = this.state();
    return { date, brief: brief ? this.mapBrief(brief) : null, candidates: candidates.map((row) => this.mapCandidate(row)), plan: plan ? this.mapPlan(plan) : null, reflection: reflection ? { id: String(reflection.id), completed: String(reflection.completed_text), unfinishedReason: String(reflection.unfinished_reason), newProblems: String(reflection.new_problems), tomorrowAdjustment: String(reflection.tomorrow_adjustment), evidenceId: reflection.evidence_item_id ? String(reflection.evidence_item_id) : null, growthCandidateId: reflection.growth_candidate_id ? String(reflection.growth_candidate_id) : null, createdAt: String(reflection.created_at) } : null, activeMission: state.mission ? { id: String(state.mission.id), title: String(state.mission.title), priority: String(state.mission.priority) } : null };
  }

  async generateBrief(clientRequestId: string) {
    const existing = this.repository.db.prepare("SELECT * FROM morning_briefs WHERE user_id=? AND brief_date=?").get(USER_ID, this.day()) as Row | undefined;
    if (existing) return { duplicate: true, brief: this.mapBrief(existing), snapshot: this.snapshot() };
    const state = this.state();
    const fallback = this.fallbackBrief(state);
    const context = new ContextEngine(this.repository);
    let brief = fallback, provider = "demo", model = "local-personal-operating-v1", mode: "demo" | "real" = "demo", fallbackReason: string | null = null;
    if (context.isRealConfigured()) {
      try {
        const prepared = context.prepare({ currentPage: "/", currentTask: "generate a read-only morning brief", currentQuestion: "What is today's most valuable bounded focus?", currentChapter: null, currentConversation: [] }, "full", { includeOperationalMemory: true });
        const result = await context.complete({ module: "personal_operating_morning_brief", taskClass: "cheap_daily", maxOutputTokens: 1_500, temperature: 0.1, reasoningMode: "standard", schema: operatingBriefSchema, schemaName: "operatingBrief", preparedContext: prepared, workingMemory: prepared.packet!.memory.working, messages: [{ role: "system", content: `Return JSON matching operatingBrief. Cite only these source references: ${state.sourceRefs.join(",")}. Read only; do not modify Goal, Mission, Strategy, Evidence, or Ability.` }, { role: "user", content: "Create today's highest priority, active mission status, learning goal, risk reminder, and strategic focus." }] });
        brief = operatingBriefSchema.parse(result.parsed); provider = result.provider; model = result.model; mode = "real";
      } catch { fallbackReason = "provider_failed"; }
    }
    this.validateRefs(brief, new Set(state.sourceRefs));
    const id = randomUUID(), timestamp = now();
    this.repository.db.prepare("INSERT INTO morning_briefs (id,user_id,brief_date,brief_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,fallback_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, USER_ID, this.day(), JSON.stringify(brief), JSON.stringify(brief.sourceRefs), brief.confidence, provider, model, mode, "personal-operating-v1", fallbackReason, timestamp, timestamp);
    this.repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, "operating.morning_brief_created", "morning_brief", id, null, JSON.stringify({ clientRequestId, sourceRefs: brief.sourceRefs }), timestamp);
    return { duplicate: false, brief: this.mapBrief(this.repository.db.prepare("SELECT * FROM morning_briefs WHERE id=?").get(id) as Row), snapshot: this.snapshot() };
  }

  async generatePlan(energy: number, clientRequestId: string) {
    const db = this.repository.db;
    const existing = db.prepare("SELECT * FROM daily_plan_candidates WHERE user_id=? AND (client_request_id=? OR (plan_date=? AND status='candidate')) ORDER BY created_at DESC LIMIT 1").get(USER_ID, clientRequestId, this.day()) as Row | undefined;
    if (existing) return { duplicate: true, candidate: this.mapCandidate(existing), snapshot: this.snapshot() };
    const state = this.state(), fallback = this.fallbackPlan(state, energy), context = new ContextEngine(this.repository);
    let plan = fallback, provider = "demo", model = "local-personal-operating-v1", mode: "demo" | "real" = "demo", fallbackReason: string | null = null;
    if (context.isRealConfigured()) {
      try {
        const prepared = context.prepare({ currentPage: "/", currentTask: "generate a daily plan candidate", currentQuestion: "What should I do today within my energy capacity?", currentChapter: null, currentConversation: [] }, "full", { includeOperationalMemory: true });
        const result = await context.complete({ module: "personal_operating_daily_plan", taskClass: "cheap_daily", maxOutputTokens: 1_800, temperature: 0.1, reasoningMode: "standard", schema: dailyPlanSchema, schemaName: "dailyPlan", preparedContext: prepared, workingMemory: prepared.packet!.memory.working, messages: [{ role: "system", content: `Return JSON matching dailyPlan. User energy is ${energy}/5. Cite only these source references: ${state.sourceRefs.join(",")}. Generate a candidate only; do not activate a plan or modify Goal, Mission, Strategy, Evidence, or Ability.` }, { role: "user", content: "Prioritize active Mission deadline and priority, then today's learning goal and strategic focus." }] });
        plan = dailyPlanSchema.parse(result.parsed); provider = result.provider; model = result.model; mode = "real";
      } catch { fallbackReason = "provider_failed"; }
    }
    this.validateRefs(plan, new Set(state.sourceRefs));
    const id = randomUUID(), timestamp = now();
    db.prepare("INSERT INTO daily_plan_candidates (id,user_id,plan_date,client_request_id,energy,plan_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,fallback_reason,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'candidate',?)").run(id, USER_ID, this.day(), clientRequestId, energy, JSON.stringify(plan), JSON.stringify(plan.sourceRefs), plan.confidence, provider, model, mode, "personal-operating-v1", fallbackReason, timestamp);
    return { duplicate: false, candidate: this.mapCandidate(db.prepare("SELECT * FROM daily_plan_candidates WHERE id=?").get(id) as Row), snapshot: this.snapshot() };
  }

  approvePlan(candidateId: string) {
    const db = this.repository.db;
    return db.transaction(() => {
      const candidate = db.prepare("SELECT * FROM daily_plan_candidates WHERE id=? AND user_id=?").get(candidateId, USER_ID) as Row | undefined;
      if (!candidate) throw new Error("DAILY_PLAN_CANDIDATE_NOT_FOUND");
      if (String(candidate.status) !== "candidate") throw new Error("DAILY_PLAN_CANDIDATE_NOT_PENDING");
      const timestamp = now(), planId = randomUUID();
      const updated = db.prepare("UPDATE daily_plan_candidates SET status='approved',approved_at=?,approved_by=? WHERE id=? AND status='candidate'").run(timestamp, ACTOR, candidateId);
      if (!updated.changes) throw new Error("DAILY_PLAN_CANDIDATE_NOT_PENDING");
      db.prepare("INSERT INTO daily_plans (id,user_id,plan_date,source_candidate_id,plan_json,energy,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?)").run(planId, USER_ID, candidate.plan_date, candidateId, candidate.plan_json, candidate.energy, timestamp, timestamp);
      db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), USER_ID, "operating.daily_plan_approved", "daily_plan_candidate", candidateId, JSON.stringify({ status: "candidate" }), JSON.stringify({ status: "approved", planId }), timestamp);
      return { candidateId, planId, snapshot: this.snapshot() };
    })();
  }

  rejectPlan(candidateId: string, reason: string) {
    const timestamp = now();
    const changed = this.repository.db.prepare("UPDATE daily_plan_candidates SET status='rejected',rejected_at=?,rejected_by=?,reject_reason=? WHERE id=? AND user_id=? AND status='candidate'").run(timestamp, ACTOR, reason, candidateId, USER_ID);
    if (!changed.changes) throw new Error("DAILY_PLAN_CANDIDATE_NOT_PENDING");
    return { candidateId, snapshot: this.snapshot() };
  }

  async submitReflection(input: { completed: string; unfinishedReason: string; newProblems: string; tomorrowAdjustment: string; clientRequestId: string }) {
    const db = this.repository.db, date = this.day();
    const existing = db.prepare("SELECT * FROM operating_reflections WHERE user_id=? AND (client_request_id=? OR reflection_date=?)").get(USER_ID, input.clientRequestId, date) as Row | undefined;
    if (existing) return { duplicate: true, reflection: this.snapshot().reflection, snapshot: this.snapshot() };
    const state = this.state(), id = randomUUID(), timestamp = now();
    db.prepare("INSERT INTO operating_reflections (id,user_id,reflection_date,client_request_id,completed_text,unfinished_reason,new_problems,tomorrow_adjustment,source_refs_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, USER_ID, date, input.clientRequestId, input.completed, input.unfinishedReason, input.newProblems, input.tomorrowAdjustment, JSON.stringify(state.sourceRefs), timestamp, timestamp);
    const evidenceService = new EvidenceService(this.repository);
    evidenceService.createManual({ action: "create", evidenceType: "self_reflection", source: "Personal Operating Loop Evening Reflection", description: `Completed: ${input.completed}\nUnfinished reason: ${input.unfinishedReason}\nNew problems: ${input.newProblems}\nTomorrow adjustment: ${input.tomorrowAdjustment}`, relatedAbility: "Personal operating discipline", capturedAt: timestamp, dataKind: "user", clientRequestId: input.clientRequestId });
    const evidence = db.prepare("SELECT id FROM evidence_items WHERE user_id=? AND source_type='manual' AND source_id=? ORDER BY created_at DESC LIMIT 1").get(USER_ID, input.clientRequestId) as { id: string } | undefined;
    if (!evidence) throw new Error("OPERATING_REFLECTION_EVIDENCE_NOT_CREATED");
    db.prepare("UPDATE operating_reflections SET evidence_item_id=?,updated_at=? WHERE id=?").run(evidence.id, now(), id);
    let analysisPending = false;
    try { await evidenceService.analyze(); } catch { analysisPending = true; }
    const growth = db.prepare("SELECT candidate_id FROM evidence_evaluations WHERE evidence_item_id=? ORDER BY created_at DESC LIMIT 1").get(evidence.id) as { candidate_id: string | null } | undefined;
    if (growth?.candidate_id) db.prepare("UPDATE operating_reflections SET growth_candidate_id=?,updated_at=? WHERE id=?").run(growth.candidate_id, now(), id);
    return { duplicate: false, analysisPending, reflection: this.snapshot().reflection, snapshot: this.snapshot() };
  }

  async execute(raw: unknown) {
    const input = personalOperatingActionSchema.parse(raw);
    if (input.action === "generate_brief") return this.generateBrief(input.clientRequestId);
    if (input.action === "generate_plan") return this.generatePlan(input.energy, input.clientRequestId);
    if (input.action === "approve_plan") return this.approvePlan(input.candidateId);
    if (input.action === "reject_plan") return this.rejectPlan(input.candidateId, input.reason);
    return this.submitReflection(input);
  }
}
