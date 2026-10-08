import { randomUUID } from "node:crypto";
import { betaValidationCaptureSchema } from "@/lib/domain/beta-validation";
import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;

function day(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai" }).format(new Date(value));
}

function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }

export type BetaValidationSnapshot = {
  logs: Array<{ id: string; date: string; dailyLoopStatus: "not_started" | "in_progress" | "reflected"; missionStatus: "none" | "active" | "completed" | "mixed"; missionCompletedCount: number; evidenceAddedCount: number; memoryConfirmedCount: number; mentorCallCount: number; feedbackCount: number; createdAt: string; updatedAt: string }>;
  summary: { recordedDays: number; firstDate: string | null; lastDate: string | null; totalEvidenceAdded: number; totalMissionCompleted: number; totalMentorCalls: number; totalFeedback: number };
  health: { loopConsistency: number | null; evidenceQuality: number | null; missionCompletion: number | null; memoryStability: number | null; mentorValue: number | null };
};

export class BetaValidationService {
  constructor(private readonly repository: ProfileRepository) {}

  snapshot(): BetaValidationSnapshot {
    const db = this.repository.db;
    const logs = db.prepare("SELECT id,log_date,daily_loop_status,mission_status,mission_completed_count,evidence_added_count,memory_confirmed_count,mentor_call_count,feedback_count,created_at,updated_at FROM beta_validation_log WHERE user_id=? ORDER BY log_date DESC LIMIT 30").all(USER_ID) as Row[];
    const allLogs = db.prepare("SELECT log_date,daily_loop_status,evidence_added_count,mission_completed_count,mentor_call_count,feedback_count FROM beta_validation_log WHERE user_id=? ORDER BY log_date ASC").all(USER_ID) as Row[];
    const evidence = db.prepare("SELECT verification_status FROM evidence_items WHERE user_id=? AND data_kind='user'").all(USER_ID) as Row[];
    const missions = db.prepare("SELECT status FROM missions WHERE user_id=?").all(USER_ID) as Row[];
    const memories = db.prepare("SELECT status FROM user_memory_profile WHERE user_id=?").all(USER_ID) as Row[];
    const mentor = db.prepare("SELECT source_refs_json FROM mentor_analyses WHERE user_id=?").all(USER_ID) as Row[];
    const sourceBoundMentor = mentor.filter((item) => {
      try { const value = JSON.parse(String(item.source_refs_json)); return Array.isArray(value) && value.length > 0; } catch { return false; }
    }).length;
    const closedMissions = missions.filter((item) => ["completed", "failed", "archived"].includes(String(item.status)));
    const activeMemories = memories.filter((item) => String(item.status) === "active").length;
    const mappedLogs = logs.map((item) => ({
      id: String(item.id), date: String(item.log_date), dailyLoopStatus: String(item.daily_loop_status) as "not_started" | "in_progress" | "reflected", missionStatus: String(item.mission_status) as "none" | "active" | "completed" | "mixed",
      missionCompletedCount: Number(item.mission_completed_count), evidenceAddedCount: Number(item.evidence_added_count), memoryConfirmedCount: Number(item.memory_confirmed_count), mentorCallCount: Number(item.mentor_call_count), feedbackCount: Number(item.feedback_count), createdAt: String(item.created_at), updatedAt: String(item.updated_at),
    }));
    return {
      logs: mappedLogs,
      summary: {
        recordedDays: allLogs.length,
        firstDate: allLogs.length ? String(allLogs[0].log_date) : null,
        lastDate: allLogs.length ? String(allLogs.at(-1)?.log_date) : null,
        totalEvidenceAdded: allLogs.reduce((sum, item) => sum + Number(item.evidence_added_count), 0),
        totalMissionCompleted: allLogs.reduce((sum, item) => sum + Number(item.mission_completed_count), 0),
        totalMentorCalls: allLogs.reduce((sum, item) => sum + Number(item.mentor_call_count), 0),
        totalFeedback: allLogs.reduce((sum, item) => sum + Number(item.feedback_count), 0),
      },
      health: {
        loopConsistency: ratio(allLogs.filter((item) => String(item.daily_loop_status) !== "not_started").length, allLogs.length),
        evidenceQuality: ratio(evidence.filter((item) => String(item.verification_status) === "verified").length, evidence.length),
        missionCompletion: ratio(closedMissions.filter((item) => String(item.status) === "completed").length, closedMissions.length),
        memoryStability: ratio(activeMemories, memories.length),
        mentorValue: ratio(sourceBoundMentor, mentor.length),
      },
    };
  }

  capture(raw: unknown) {
    const input = betaValidationCaptureSchema.parse(raw);
    const logDate = input.logDate || day(new Date());
    if (logDate > day(new Date())) throw new Error("BETA_VALIDATION_FUTURE_DATE");
    const db = this.repository.db;
    const daily = db.prepare("SELECT (SELECT count(*) FROM morning_briefs WHERE user_id=? AND brief_date=?) AS briefs,(SELECT count(*) FROM daily_plans WHERE user_id=? AND plan_date=?) AS plans,(SELECT count(*) FROM operating_reflections WHERE user_id=? AND reflection_date=?) AS reflections").get(USER_ID, logDate, USER_ID, logDate, USER_ID, logDate) as Row;
    const dailyLoopStatus = Number(daily.reflections) > 0 ? "reflected" : Number(daily.briefs) + Number(daily.plans) > 0 ? "in_progress" : "not_started";
    const countOnDay = (sql: string, field: string) => (db.prepare(sql).all(USER_ID) as Row[])
      .filter((item) => item[field] && day(String(item[field])) === logDate).length;
    const missionCompletedCount = countOnDay("SELECT completed_at FROM missions WHERE user_id=? AND status='completed'", "completed_at");
    const activeMissionCount = Number((db.prepare("SELECT count(*) AS count FROM missions WHERE user_id=? AND status='active'").get(USER_ID) as { count: number }).count);
    const missionStatus = activeMissionCount && missionCompletedCount ? "mixed" : activeMissionCount ? "active" : missionCompletedCount ? "completed" : "none";
    const evidenceAddedCount = countOnDay("SELECT captured_at FROM evidence_items WHERE user_id=? AND data_kind='user'", "captured_at");
    const memoryConfirmedCount = countOnDay("SELECT approved_at FROM memory_candidates WHERE user_id=? AND status='approved'", "approved_at");
    const mentorCallCount = countOnDay("SELECT created_at FROM ai_usage_logs WHERE user_id=? AND purpose IN ('ai_mentor','genesis_mentor_deep')", "created_at");
    const feedbackCount = countOnDay("SELECT created_at FROM beta_feedback WHERE user_id=?", "created_at");
    const at = new Date().toISOString();
    const existing = db.prepare("SELECT id FROM beta_validation_log WHERE user_id=? AND log_date=?").get(USER_ID, logDate) as { id: string } | undefined;
    const id = existing?.id || randomUUID();
    db.transaction(() => {
      db.prepare("INSERT INTO beta_validation_log (id,user_id,log_date,daily_loop_status,mission_status,mission_completed_count,evidence_added_count,memory_confirmed_count,mentor_call_count,feedback_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,log_date) DO UPDATE SET daily_loop_status=excluded.daily_loop_status,mission_status=excluded.mission_status,mission_completed_count=excluded.mission_completed_count,evidence_added_count=excluded.evidence_added_count,memory_confirmed_count=excluded.memory_confirmed_count,mentor_call_count=excluded.mentor_call_count,feedback_count=excluded.feedback_count,updated_at=excluded.updated_at")
        .run(id, USER_ID, logDate, dailyLoopStatus, missionStatus, missionCompletedCount, evidenceAddedCount, memoryConfirmedCount, mentorCallCount, feedbackCount, at, at);
      db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .run(randomUUID(), USER_ID, "beta.validation_logged", "beta_validation_log", id, null, JSON.stringify({ logDate, dailyLoopStatus, missionStatus, missionCompletedCount, evidenceAddedCount, memoryConfirmedCount, mentorCallCount, feedbackCount }), at);
    })();
    return { logId: id, duplicate: Boolean(existing), snapshot: this.snapshot() };
  }
}
