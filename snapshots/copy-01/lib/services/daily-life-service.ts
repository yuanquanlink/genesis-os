import type { ProfileRepository } from "@/lib/db/repository";
import { EvidenceRepository } from "@/lib/db/evidence-repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

export class DailyLifeService {
  constructor(private readonly repository: ProfileRepository) {}

  private day(value = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai" }).format(value);
  }

  snapshot() {
    new EvidenceRepository(this.repository).syncSources();
    const db = this.repository.db;
    const strategy = db.prepare("SELECT strategy.id,strategy.strategies_json,strategy.evidence_ids_json FROM growth_strategies strategy JOIN strategy_candidates candidate ON candidate.id=strategy.source_candidate_id WHERE strategy.user_id=? AND candidate.status='approved' ORDER BY strategy.created_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const plans = parse<{ d7?: { goal?: string; actions?: string[]; avoid?: string[] }; d90?: { goal?: string } }>(strategy?.strategies_json, {});
    const mission = db.prepare("SELECT mission.learning_objective,mission.estimated_minutes FROM daily_learning_missions mission JOIN learning_goals goal ON goal.id=mission.goal_id WHERE goal.user_id=? AND mission.mission_date=? ORDER BY mission.created_at DESC LIMIT 1").get(USER_ID, this.day()) as Row | undefined;
    const actionMission = db.prepare("SELECT id,title,priority,status,deadline,daily_tasks_json,evidence_requirement FROM missions WHERE user_id=? AND status='active' ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,deadline LIMIT 1").get(USER_ID) as Row | undefined;
    const challenge = db.prepare("SELECT challenge_title FROM project_challenges WHERE user_id=? AND status IN ('active','submitted','verifying','needs_work') ORDER BY updated_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const reflection = db.prepare("SELECT unfinished_text,unfinished_reason,strategy_alignment,strategy_adjustment,biggest_gain,completed_text FROM evening_reflections WHERE user_id=? ORDER BY reflection_date DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const entries = db.prepare("SELECT content,category,occurred_at FROM self_entries WHERE user_id=? AND data_kind='user' AND status='active' AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 50").all(USER_ID) as Row[];
    const evidence = db.prepare("SELECT id,description,related_ability,verification_status,captured_at FROM evidence_items WHERE user_id=? AND data_kind='user' ORDER BY captured_at DESC LIMIT 50").all(USER_ID) as Row[];
    const changes = db.prepare("SELECT node.name,change.previous_level,change.approved_level,change.approved_at FROM ability_change_snapshots change JOIN growth_nodes node ON node.id=change.ability_node_id WHERE change.user_id=? ORDER BY change.approved_at DESC LIMIT 20").all(USER_ID) as Row[];
    const growthFocus = db.prepare("SELECT name,next_improvement FROM growth_nodes WHERE user_id=? AND node_type='ability' AND status='active' ORDER BY current_level ASC,updated_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const knowledge = db.prepare("SELECT content,source FROM knowledge_items WHERE user_id=? AND data_kind='user' ORDER BY created_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const proactive = db.prepare("SELECT insight_json FROM proactive_insights WHERE user_id=? AND status IN ('pending','seen','acted') ORDER BY created_at DESC LIMIT 1").get(USER_ID) as Row | undefined;
    const today = this.day();
    const todayEntries = entries.filter((item) => this.day(new Date(String(item.occurred_at))) === today).slice(0, 5);
    const todayEvidence = evidence.filter((item) => this.day(new Date(String(item.captured_at))) === today).slice(0, 5);
    const todayChanges = changes.filter((item) => this.day(new Date(String(item.approved_at))) === today).slice(0, 5);
    const carry = String(reflection?.unfinished_text || "").trim();
    const latestInsight = parse<{ nextStep?: string; risk?: string }>(proactive?.insight_json, {});
    return {
      date: today,
      morning: {
        highestPriority: String(mission?.learning_objective || plans.d7?.actions?.[0] || "记录一项可验证的最高优先事项，并完成它的最小交付物。"),
        activeMission: actionMission ? { id: String(actionMission.id), title: String(actionMission.title), priority: String(actionMission.priority), deadline: String(actionMission.deadline), dailyTasks: parse<string[]>(actionMission.daily_tasks_json, []), evidenceRequirement: String(actionMission.evidence_requirement) } : null,
        currentStrategy: String(plans.d90?.goal || plans.d7?.goal || "尚无已批准战略。保持范围明确，并保留证据。"),
        learningTask: mission ? `${String(mission.learning_objective)}（${Number(mission.estimated_minutes || 0)} 分钟）` : "今天没有学习任务。先创建或刷新学习目标，再把活动视为进展。",
        projectTask: String(challenge?.challenge_title || "没有进行中的工程挑战。让当前项目交付物保持范围明确且可测试。"),
        knowledgePrompt: knowledge ? `${String(knowledge.content).slice(0, 180)}（来源：${String(knowledge.source)}）` : "近期没有知识笔记。学习后记录一个可复用观点。",
        growthFocus: growthFocus ? `${String(growthFocus.name)}：${String(growthFocus.next_improvement || "收集已验证证据")}` : "当前没有已批准的能力差距。",
        proactiveNextStep: String(latestInsight.nextStep || "尚无每周洞察候选。存在已验证证据后再生成。"),
        risks: [...(plans.d7?.avoid?.slice(0, 2) || []), latestInsight.risk || "不要把计划、自述或 AI 调用本身当作能力增长。"],
        yesterdayCarryover: carry || "没有记录昨日遗留。工作完成后填写晚间复盘。",
      },
      evening: {
        completed: todayEntries.map((item) => `${String(item.category)}: ${String(item.content).slice(0, 180)}`),
        learningGain: String(reflection?.biggest_gain || "尚未复盘今天的学习收获。"),
        projectProgress: String(reflection?.completed_text || todayEntries.filter((item) => String(item.category) === "project").map((item) => String(item.content)).join("；") || "今天还没有记录项目进展。"),
        unfinishedReason: String(reflection?.unfinished_reason || "尚未填写晚间复盘。"),
        strategicAlignment: String(reflection?.strategy_alignment || "not_assessed"),
        adjustment: String(reflection?.strategy_adjustment || "审查实际结果后，记录晚间调整。"),
        abilityChanges: todayChanges.map((item) => `${String(item.name)} ${Number(item.previous_level)}/5 -> ${Number(item.approved_level)}/5`),
        newEvidence: todayEvidence.map((item) => ({ id: String(item.id), description: String(item.description).slice(0, 180), status: String(item.verification_status), ability: String(item.related_ability) })),
        missionCompletion: actionMission ? "进行中使命正在推进" : "没有进行中使命",
      },
    };
  }
}
