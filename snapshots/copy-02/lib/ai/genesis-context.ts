import "server-only";
import type { ProfileRepository } from "@/lib/db/repository";

type Row = Record<string, unknown>;

const text = (value: unknown, max = 1_200) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const isoDay = (value: unknown) => text(value, 32).slice(0, 10);

export type GenesisAIContext = {
  text: string;
  evidenceCount: number;
  today: string;
};

export function buildGenesisAIContext(
  repository: ProfileRepository,
  now = new Date(),
  options: { includeAIUsage?: boolean } = {},
): GenesisAIContext {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const user = repository.db
    .prepare(
      "SELECT name,long_term_goal,current_stage FROM users WHERE id='genesis-owner'",
    )
    .get() as Row;
  const facts = repository.db
    .prepare(
      "SELECT id,content,fact_type,confidence,evidence_count,last_verified_at FROM profile_facts WHERE user_id='genesis-owner' AND status='active' AND is_active=1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 12",
    )
    .all() as Row[];
  const rawEntries = repository.db
    .prepare(
      "SELECT id,content,category,occurred_at FROM self_entries WHERE user_id='genesis-owner' AND data_kind='user' AND status='active' AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 30",
    )
    .all() as Row[];
  const seenEntries = new Set<string>();
  const entries = rawEntries
    .filter((entry) => {
      const key = text(entry.content)
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("zh-CN");
      if (seenEntries.has(key)) return false;
      seenEntries.add(key);
      return true;
    })
    .slice(0, 8);
  const events = repository.db
    .prepare(
      "SELECT id,event_type,title,summary,occurred_at FROM life_events WHERE user_id='genesis-owner' AND data_kind='user' AND is_primary=1 AND hidden_at IS NULL AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 12",
    )
    .all() as Row[];
  const goals = repository.db
    .prepare(
      "SELECT id,title,purpose,current_basis,final_goal,target_level,status,created_at FROM learning_goals WHERE user_id='genesis-owner' AND data_kind='user' AND status!='archived' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 8",
    )
    .all() as Row[];
  const outcomes = repository.db
    .prepare(
      "SELECT o.id,o.title,o.status,o.demo_notes,o.retrospective,o.created_at,g.title goal_title FROM engineering_outcomes o JOIN learning_goals g ON g.id=o.goal_id WHERE g.data_kind='user' ORDER BY o.created_at DESC LIMIT 6",
    )
    .all() as Row[];
  const usage = options.includeAIUsage
    ? (repository.db
        .prepare(
          "SELECT id,provider,model,purpose,task_class,input_tokens,output_tokens,latency_ms,success,error_code,created_at FROM ai_usage_logs WHERE user_id='genesis-owner' ORDER BY created_at DESC LIMIT 12",
        )
        .all() as Row[])
    : [];
  const usageStats = usage.length
    ? {
        total: usage.length,
        succeeded: usage.filter((item) => Boolean(item.success)).length,
        failed: usage.filter((item) => !Boolean(item.success)).length,
      }
    : null;

  const lines = [
    `当前日期（Asia/Shanghai）：${today}`,
    `[用户档案 U1] 姓名=${text(user.name, 80)}；长期目标=${text(user.long_term_goal, 500)}；当前阶段=${text(user.current_stage, 300)}`,
    ...facts.map(
      (item, index) =>
        `[已批准画像事实 F${index + 1}] 类型=${text(item.fact_type, 40)}；内容=${text(item.content)}；置信度=${Number(item.confidence).toFixed(2)}；证据数=${Number(item.evidence_count)}；最后验证=${isoDay(item.last_verified_at)}`,
    ),
    ...entries.map(
      (item, index) =>
        `[用户原始自述 R${index + 1}] 日期=${isoDay(item.occurred_at)}；类别=${text(item.category, 40)}；原文=${text(item.content, 2_400)}`,
    ),
    ...events.map(
      (item, index) =>
        `[系统时间线 T${index + 1}] 日期=${isoDay(item.occurred_at)}；类型=${text(item.event_type, 60)}；标题=${text(item.title, 180)}；摘要=${text(item.summary, 600)}`,
    ),
    ...goals.map(
      (item, index) =>
        `[学习目标 G${index + 1}] 创建=${isoDay(item.created_at)}；标题=${text(item.title, 180)}；目的=${text(item.purpose, 600)}；当前基础=${text(item.current_basis, 600)}；最终目标=${text(item.final_goal, 600)}；层级=${text(item.target_level, 40)}；状态=${text(item.status, 40)}`,
    ),
    ...outcomes.map(
      (item, index) =>
        `[工程成果 O${index + 1}] 日期=${isoDay(item.created_at)}；学习目标=${text(item.goal_title, 180)}；成果=${text(item.title, 240)}；状态=${text(item.status, 40)}；验收=${text(item.demo_notes, 600)}；复盘=${text(item.retrospective, 600)}`,
    ),
    ...(usageStats
      ? [
          `[AI调用确定性统计 AS1] 最近日志总数=${usageStats.total}；成功=${usageStats.succeeded}；失败=${usageStats.failed}。该统计由服务端计算，引用时不得重新计数或改写。`,
        ]
      : []),
    ...usage.map(
      (item, index) =>
        `[AI调用日志 A${index + 1}] 日期=${isoDay(item.created_at)}；provider=${text(item.provider, 40)}；model=${text(item.model, 100)}；模块=${text(item.purpose, 80)}；任务=${text(item.task_class, 60)}；输入token=${Number(item.input_tokens ?? 0)}；输出token=${Number(item.output_tokens ?? 0)}；耗时ms=${Number(item.latency_ms)}；成功=${Boolean(item.success)}；错误=${text(item.error_code, 80) || "无"}`,
    ),
  ];
  return {
    text: lines.join("\n"),
    evidenceCount:
      1 +
      facts.length +
      entries.length +
      events.length +
      goals.length +
      outcomes.length +
      (usageStats ? 1 : 0) +
      usage.length,
    today,
  };
}
