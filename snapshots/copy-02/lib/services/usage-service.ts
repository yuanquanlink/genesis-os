import type { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
type Row = Record<string, unknown>;

function day(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
  }).format(new Date(value));
}

function recentDays(count: number) {
  const values: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const value = new Date();
    value.setDate(value.getDate() - index);
    values.push(day(value));
  }
  return values;
}

export type UsageSnapshot = {
  generatedAt: string;
  days: Array<{ date: string; inputs: number; mentorCalls: number; evidence: number }>;
  days30: Array<{ date: string; inputs: number; mentorCalls: number; evidence: number }>;
  metrics: {
    todayInputs: number;
    mentorCallsLast7Days: number;
    learningCompletionRate: number | null;
    evidenceTotal: number;
    evidenceAddedLast7Days: number;
    strategyAlignmentRate: number | null;
    activeMissions: number;
    completedMissionsLast7Days: number;
  };
  ai: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    inputTokens: number;
    outputTokens: number;
    averageLatencyMs: number;
    providers: Array<{ provider: string; calls: number; failures: number }>;
  };
  beta: {
    betaRunDays: number;
    dailyLoopActiveDaysLast30: number;
    dailyLoopStreak: number;
    missionTotal: number;
    missionCompleted: number;
    missionCompletionRate: number | null;
    missionCompletionRateLast7: number | null;
    missionCompletionRatePrevious7: number | null;
    missionCompletionRateChange: number | null;
    evidenceTrend: Array<{ date: string; count: number }>;
    evidenceAddedLast30: number;
    memoryCandidates: number;
    memoryConfirmed: number;
    memoryConfirmationRate: number | null;
    mentorActiveDaysLast7: number;
  };
};

export class UsageService {
  constructor(private readonly repository: ProfileRepository) {}

  snapshot(): UsageSnapshot {
    const db = this.repository.db;
    const days = recentDays(7);
    const days30 = recentDays(30);
    const inputs = db.prepare("SELECT occurred_at FROM self_entries WHERE user_id=? AND data_kind='user' AND status='active' AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 1000").all(USER_ID) as Row[];
    const mentorCalls = db.prepare("SELECT created_at FROM ai_usage_logs WHERE user_id=? AND purpose IN ('ai_mentor','genesis_mentor_deep') ORDER BY created_at DESC LIMIT 1000").all(USER_ID) as Row[];
    const evidence = db.prepare("SELECT captured_at FROM evidence_items WHERE user_id=? AND data_kind='user' ORDER BY captured_at DESC LIMIT 1000").all(USER_ID) as Row[];
    const byDay = (rows: Row[], field: string) => rows.reduce<Record<string, number>>((result, item) => {
      const key = day(String(item[field]));
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
    const inputCounts = byDay(inputs, "occurred_at");
    const mentorCounts = byDay(mentorCalls, "created_at");
    const evidenceCounts = byDay(evidence, "captured_at");
    const missionRows = db.prepare("SELECT mission.status FROM daily_learning_missions mission JOIN learning_goals goal ON goal.id=mission.goal_id WHERE goal.user_id=? AND mission.mission_date>=? ORDER BY mission.mission_date DESC").all(USER_ID, days[0]) as Row[];
    const actionMissions = db.prepare("SELECT status,completed_at,failed_at,archived_at,updated_at FROM missions WHERE user_id=?").all(USER_ID) as Row[];
    const memoryRows = db.prepare("SELECT status FROM memory_candidates WHERE user_id=?").all(USER_ID) as Row[];
    const dailyLoopRows = db.prepare("SELECT brief_date AS date FROM morning_briefs WHERE user_id=? UNION SELECT plan_date AS date FROM daily_plans WHERE user_id=? UNION SELECT reflection_date AS date FROM operating_reflections WHERE user_id=?").all(USER_ID, USER_ID, USER_ID) as Row[];
    const completedMissions = missionRows.filter((item) => String(item.status) === "completed").length;
    const alignments = db.prepare("SELECT strategy_alignment FROM evening_reflections WHERE user_id=? AND reflection_date>=? AND strategy_alignment IN ('aligned','partial','off_track')").all(USER_ID, days[0]) as Row[];
    const aligned = alignments.filter((item) => String(item.strategy_alignment) === "aligned").length;
    const usageRows = db.prepare("SELECT provider,input_tokens,output_tokens,latency_ms,success FROM ai_usage_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 1000").all(USER_ID) as Row[];
    const betaActivityRows = db.prepare("SELECT brief_date AS occurred_at FROM morning_briefs WHERE user_id=? UNION ALL SELECT plan_date AS occurred_at FROM daily_plans WHERE user_id=? UNION ALL SELECT reflection_date AS occurred_at FROM operating_reflections WHERE user_id=? UNION ALL SELECT created_at AS occurred_at FROM missions WHERE user_id=? UNION ALL SELECT created_at AS occurred_at FROM memory_candidates WHERE user_id=? UNION ALL SELECT captured_at AS occurred_at FROM evidence_items WHERE user_id=? AND data_kind='user' UNION ALL SELECT created_at AS occurred_at FROM ai_usage_logs WHERE user_id=? AND purpose IN ('ai_mentor','genesis_mentor_deep')").all(USER_ID, USER_ID, USER_ID, USER_ID, USER_ID, USER_ID, USER_ID) as Row[];
    const providers = new Map<string, { calls: number; failures: number }>();
    for (const item of usageRows) {
      const provider = String(item.provider || "demo");
      const current = providers.get(provider) || { calls: 0, failures: 0 };
      current.calls += 1;
      if (!Boolean(item.success)) current.failures += 1;
      providers.set(provider, current);
    }
    const totalCalls = usageRows.length;
    const dailyLoopDates = new Set(dailyLoopRows.map((item) => String(item.date)));
    const recentThirtyDays = days30;
    let dailyLoopStreak = 0;
    for (let index = recentThirtyDays.length - 1; index >= 0; index -= 1) {
      if (!dailyLoopDates.has(recentThirtyDays[index])) break;
      dailyLoopStreak += 1;
    }
    const closedMissions = actionMissions.filter((item) => ["completed", "failed", "archived"].includes(String(item.status)));
    const completedActionMissions = actionMissions.filter((item) => String(item.status) === "completed").length;
    const decisionedMemory = memoryRows.filter((item) => ["approved", "rejected"].includes(String(item.status)));
    const confirmedMemory = memoryRows.filter((item) => String(item.status) === "approved").length;
    const firstBetaActivity = betaActivityRows
      .map((item) => Date.parse(String(item.occurred_at)))
      .filter((value) => Number.isFinite(value))
      .reduce<number | null>((earliest, value) => earliest === null || value < earliest ? value : earliest, null);
    const betaRunDays = firstBetaActivity === null ? 0 : Math.max(1, Math.floor((Date.now() - firstBetaActivity) / 86_400_000) + 1);
    const closedRateFor = (range: string[]) => {
      const closed = closedMissions.filter((item) => {
        const closedAt = item.completed_at || item.failed_at || item.archived_at || item.updated_at;
        return closedAt && range.includes(day(String(closedAt)));
      });
      return closed.length ? closed.filter((item) => String(item.status) === "completed").length / closed.length : null;
    };
    const previousDays = recentDays(14).slice(0, 7);
    const missionCompletionRateLast7 = closedRateFor(days);
    const missionCompletionRatePrevious7 = closedRateFor(previousDays);
    return {
      generatedAt: new Date().toISOString(),
      days: days.map((date) => ({ date, inputs: inputCounts[date] || 0, mentorCalls: mentorCounts[date] || 0, evidence: evidenceCounts[date] || 0 })),
      days30: days30.map((date) => ({ date, inputs: inputCounts[date] || 0, mentorCalls: mentorCounts[date] || 0, evidence: evidenceCounts[date] || 0 })),
      metrics: {
        todayInputs: inputCounts[days.at(-1) || day(new Date())] || 0,
        mentorCallsLast7Days: mentorCalls.filter((item) => days.includes(day(String(item.created_at)))).length,
        learningCompletionRate: missionRows.length ? completedMissions / missionRows.length : null,
        evidenceTotal: evidence.length,
        evidenceAddedLast7Days: evidence.filter((item) => days.includes(day(String(item.captured_at)))).length,
        strategyAlignmentRate: alignments.length ? aligned / alignments.length : null,
        activeMissions: actionMissions.filter((item) => String(item.status) === "active").length,
        completedMissionsLast7Days: actionMissions.filter((item) => String(item.status) === "completed" && item.completed_at && days.includes(day(String(item.completed_at)))).length,
      },
      ai: {
        totalCalls,
        successfulCalls: usageRows.filter((item) => Boolean(item.success)).length,
        failedCalls: usageRows.filter((item) => !Boolean(item.success)).length,
        inputTokens: usageRows.reduce((sum, item) => sum + Number(item.input_tokens || 0), 0),
        outputTokens: usageRows.reduce((sum, item) => sum + Number(item.output_tokens || 0), 0),
        averageLatencyMs: totalCalls ? Math.round(usageRows.reduce((sum, item) => sum + Number(item.latency_ms || 0), 0) / totalCalls) : 0,
        providers: [...providers.entries()].map(([provider, value]) => ({ provider, ...value })).sort((a, b) => b.calls - a.calls),
      },
      beta: {
        betaRunDays,
        dailyLoopActiveDaysLast30: recentThirtyDays.filter((date) => dailyLoopDates.has(date)).length,
        dailyLoopStreak,
        missionTotal: actionMissions.length,
        missionCompleted: completedActionMissions,
        missionCompletionRate: closedMissions.length ? completedActionMissions / closedMissions.length : null,
        missionCompletionRateLast7,
        missionCompletionRatePrevious7,
        missionCompletionRateChange: missionCompletionRateLast7 !== null && missionCompletionRatePrevious7 !== null ? missionCompletionRateLast7 - missionCompletionRatePrevious7 : null,
        evidenceTrend: days.map((date) => ({ date, count: evidenceCounts[date] || 0 })),
        evidenceAddedLast30: evidence.filter((item) => days30.includes(day(String(item.captured_at)))).length,
        memoryCandidates: memoryRows.length,
        memoryConfirmed: confirmedMemory,
        memoryConfirmationRate: decisionedMemory.length ? confirmedMemory / decisionedMemory.length : null,
        mentorActiveDaysLast7: new Set(mentorCalls.map((item) => day(String(item.created_at))).filter((date) => days.includes(date))).size,
      },
    };
  }
}
