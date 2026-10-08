import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ProfileRepository } from "@/lib/db/repository";
import {
  type EvidenceAnalysis,
  type EvidenceEvaluation,
  type EvidenceReport,
  type EvidenceType,
  type ManualEvidenceInput,
} from "@/lib/domain/evidence";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const asText = (value: unknown) => String(value ?? "").trim();
const clamp = (value: unknown, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number(value) || 0));
const hash = (value: string) =>
  createHash("sha256").update(value.normalize("NFKC").trim()).digest("hex");
const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

const baseConfidence: Record<EvidenceType, number> = {
  learning: 0.65,
  project: 0.72,
  competition: 0.85,
  external: 0.75,
  self_reflection: 0.25,
};

export type EvidenceSourceRecord = {
  id: string;
  sourceType: string;
  sourceId: string;
  source: string;
  capturedAt: string;
};

export type EvidenceEvaluationRecord = EvidenceEvaluation & {
  id: string;
  candidateId: string | null;
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  createdAt: string;
};

export type EvidenceItemRecord = {
  id: string;
  evidenceType: EvidenceType;
  sourceType: string;
  sourceId: string;
  source: string;
  description: string;
  relatedAbility: string;
  dataKind: string;
  capturedAt: string;
  verificationStatus: "pending" | "verified" | "needs_review" | "rejected";
  truthfulness: number | null;
  difficulty: number | null;
  independence: number | null;
  engineeringValue: number | null;
  longTermValue: number | null;
  confidence: number;
  impact: number;
  sources: EvidenceSourceRecord[];
  latestEvaluation: EvidenceEvaluationRecord | null;
  createdAt: string;
  updatedAt: string;
};

export type AbilityChangeRecord = {
  id: string;
  evidenceItemId: string;
  candidateId: string;
  abilityNodeId: string;
  abilityName: string;
  previousLevel: number;
  proposedLevel: number;
  approvedLevel: number;
  previousConfidence: number;
  approvedConfidence: number;
  reason: string;
  approvedAt: string;
};

export type DailyEvidenceReportRecord = EvidenceReport & {
  id: string;
  reportDate: string;
  evidenceIds: string[];
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  confidence: number;
  todayCompleted: Array<{ id: string; summary: string }>;
  createdAt: string;
  updatedAt: string;
};

export type EvidenceSnapshot = {
  items: EvidenceItemRecord[];
  pendingCandidates: Array<{
    id: string;
    nodeType: string;
    name: string;
    proposedLevel: number;
    confidence: number;
    evidenceIds: string[];
    createdAt: string;
  }>;
  abilityChanges: AbilityChangeRecord[];
  dailyReport: DailyEvidenceReportRecord | null;
  stats: {
    total: number;
    pending: number;
    verified: number;
    needsReview: number;
    candidatesPending: number;
  };
  adapters: Array<{
    id: string;
    label: string;
    status: "available" | "not_connected";
    signals: string[];
  }>;
  lastSync: { inserted: number; reused: number; sources: number } | null;
};

type RawEvidence = {
  evidenceType: EvidenceType;
  sourceType: string;
  sourceId: string;
  source: string;
  description: string;
  relatedAbility: string;
  capturedAt: string;
  dataKind?: "user" | "demo" | "test";
};

type EvaluationMeta = {
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
};

export class EvidenceRepository {
  private latestSync: EvidenceSnapshot["lastSync"] = null;

  constructor(private readonly repository: ProfileRepository) {}

  private audit(action: string, entityType: string, entityId: string, after: unknown) {
    this.repository.db
      .prepare(
        "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,NULL,?,?)",
      )
      .run(randomUUID(), USER_ID, action, entityType, entityId, JSON.stringify(after), now());
  }

  private addRawEvidence(input: RawEvidence) {
    const db = this.repository.db;
    const contentHash = hash(
      `${input.evidenceType}:${input.description}:${input.relatedAbility}`,
    );
    let item = db
      .prepare(
        "SELECT id FROM evidence_items WHERE user_id=? AND source_type=? AND source_id=?",
      )
      .get(USER_ID, input.sourceType, input.sourceId) as { id: string } | undefined;
    let inserted = false;
    if (!item)
      item = db
        .prepare(
          "SELECT id FROM evidence_items WHERE user_id=? AND evidence_type=? AND source_type=? AND content_hash=?",
        )
        .get(USER_ID, input.evidenceType, input.sourceType, contentHash) as
        | { id: string }
        | undefined;
    if (!item) {
      const id = randomUUID();
      const timestamp = now();
      db.prepare(
        "INSERT INTO evidence_items (id,user_id,evidence_type,source_type,source_id,source,description,related_ability,content_hash,data_kind,captured_at,verification_status,confidence,impact,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?,0,?,?)",
      ).run(
        id,
        USER_ID,
        input.evidenceType,
        input.sourceType,
        input.sourceId,
        input.source,
        input.description,
        input.relatedAbility,
        contentHash,
        input.dataKind ?? "user",
        input.capturedAt,
        baseConfidence[input.evidenceType],
        timestamp,
        timestamp,
      );
      item = { id };
      inserted = true;
    }
    const sourceInsert = db
      .prepare(
        "INSERT OR IGNORE INTO evidence_item_sources (id,evidence_item_id,source_type,source_id,source,captured_at,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        item.id,
        input.sourceType,
        input.sourceId,
        input.source,
        input.capturedAt,
        now(),
      );
    return { inserted, sourceInserted: sourceInsert.changes > 0, id: item.id };
  }

  private collectLearningEvidence(): RawEvidence[] {
    const db = this.repository.db;
    const rows: RawEvidence[] = [];
    const mastery = db
      .prepare(
        "SELECT e.*,n.title ability,g.title goal_title,g.data_kind FROM mastery_evidence e JOIN knowledge_nodes n ON n.id=e.node_id JOIN learning_goals g ON g.id=e.goal_id WHERE g.user_id=? AND g.deleted_at IS NULL",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    for (const entry of mastery)
      rows.push({
        evidenceType: "learning",
        sourceType: "mastery_evidence",
        sourceId: asText(entry.id),
        source: `学习目标：${asText(entry.goal_title)}`,
        description: [
          `${asText(entry.evidence_type)} 得分 ${Math.round(Number(entry.score) * 100)}%`,
          asText(entry.detail),
          asText(entry.user_output),
          entry.code_authorship ? `代码来源：${asText(entry.code_authorship)}` : "",
        ]
          .filter(Boolean)
          .join("；")
          .slice(0, 2_000),
        relatedAbility: asText(entry.ability),
        capturedAt: asText(entry.created_at),
        dataKind: asText(entry.data_kind) as RawEvidence["dataKind"],
      });

    const sessions = db
      .prepare(
        "SELECT s.*,n.title ability,g.title goal_title,g.data_kind FROM learning_sessions s JOIN knowledge_nodes n ON n.id=s.node_id JOIN learning_goals g ON g.id=s.goal_id WHERE g.user_id=? AND g.deleted_at IS NULL AND s.status='completed'",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    for (const session of sessions)
      rows.push({
        evidenceType: "learning",
        sourceType: "learning_session",
        sourceId: asText(session.id),
        source: `学习会话：${asText(session.goal_title)}`,
        description: `完成学习会话“${asText(session.title)}”${asText(session.summary) ? `；总结：${asText(session.summary)}` : ""}`.slice(0, 2_000),
        relatedAbility: asText(session.ability),
        capturedAt: asText(session.completed_at || session.started_at),
        dataKind: asText(session.data_kind) as RawEvidence["dataKind"],
      });

    const assessments = db
      .prepare(
        "SELECT attempt.*,question.concept,assessment.assessment_type,g.title goal_title,g.data_kind FROM assessment_attempts attempt JOIN assessment_questions question ON question.id=attempt.question_id JOIN assessments assessment ON assessment.id=attempt.assessment_id JOIN learning_goals g ON g.id=assessment.goal_id WHERE g.user_id=? AND g.deleted_at IS NULL",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    for (const attempt of assessments)
      rows.push({
        evidenceType: "learning",
        sourceType: "assessment_attempt",
        sourceId: asText(attempt.id),
        source: `${asText(attempt.assessment_type)} 测试：${asText(attempt.goal_title)}`,
        description: `测试得分 ${Math.round(Number(attempt.score) * 100)}%；正确性 ${asText(attempt.correctness)}；原始回答：${asText(attempt.user_answer)}`.slice(0, 2_000),
        relatedAbility: asText(attempt.concept),
        capturedAt: asText(attempt.created_at),
        dataKind: asText(attempt.data_kind) as RawEvidence["dataKind"],
      });

    const reviews = db
      .prepare(
        "SELECT attempt.*,n.title ability,g.title goal_title,g.data_kind FROM review_attempts attempt JOIN knowledge_nodes n ON n.id=attempt.node_id JOIN learning_goals g ON g.id=attempt.goal_id WHERE g.user_id=? AND g.deleted_at IS NULL",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    for (const attempt of reviews)
      rows.push({
        evidenceType: "learning",
        sourceType: "review_attempt",
        sourceId: asText(attempt.id),
        source: `延迟复习：${asText(attempt.goal_title)}`,
        description: `延迟复习得分 ${Math.round(Number(attempt.score) * 100)}%；间隔 ${Number(attempt.previous_interval_days)}→${Number(attempt.next_interval_days)} 天；回答：${asText(attempt.user_answer)}`.slice(0, 2_000),
        relatedAbility: asText(attempt.ability),
        capturedAt: asText(attempt.created_at),
        dataKind: asText(attempt.data_kind) as RawEvidence["dataKind"],
      });
    return rows;
  }

  private collectProjectEvidence(): RawEvidence[] {
    const db = this.repository.db;
    const rows: RawEvidence[] = [];
    const outcomes = db
      .prepare(
        "SELECT outcome.*,goal.title goal_title,goal.data_kind FROM engineering_outcomes outcome JOIN learning_goals goal ON goal.id=outcome.goal_id WHERE goal.user_id=? AND goal.deleted_at IS NULL",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    for (const outcome of outcomes)
      rows.push({
        evidenceType: "project",
        sourceType: "engineering_outcome",
        sourceId: asText(outcome.id),
        source: `工程成果：${asText(outcome.goal_title)}`,
        description: [
          `${asText(outcome.title)}；状态 ${asText(outcome.status)}`,
          asText(outcome.demo_notes),
          asText(outcome.retrospective),
          outcome.deployment_url ? `部署：${asText(outcome.deployment_url)}` : "",
          `代码来源：${asText(outcome.code_authorship)}`,
        ]
          .filter(Boolean)
          .join("；")
          .slice(0, 2_000),
        relatedAbility: "软件工程",
        capturedAt: asText(outcome.updated_at || outcome.created_at),
        dataKind: asText(outcome.data_kind) as RawEvidence["dataKind"],
      });

    const submissions = db
      .prepare(
        "SELECT submission.*,project.title project_title,goal.data_kind FROM engineering_submissions submission JOIN engineering_projects project ON project.id=submission.project_id JOIN learning_goals goal ON goal.id=project.goal_id WHERE goal.user_id=? AND goal.deleted_at IS NULL",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    for (const submission of submissions)
      rows.push({
        evidenceType: "project",
        sourceType: "engineering_submission",
        sourceId: asText(submission.id),
        source: `工程提交：${asText(submission.project_title)}`,
        description: [
          asText(submission.user_output),
          asText(submission.independent_changes),
          asText(submission.test_results),
          submission.repository_url ? `仓库：${asText(submission.repository_url)}` : "",
          submission.deployment_url ? `部署：${asText(submission.deployment_url)}` : "",
          `作者标记：${asText(submission.authorship)}`,
        ]
          .filter(Boolean)
          .join("；")
          .slice(0, 2_000),
        relatedAbility: "工程交付",
        capturedAt: asText(submission.created_at),
        dataKind: asText(submission.data_kind) as RawEvidence["dataKind"],
      });

    const aiUsage = db
      .prepare(
        "SELECT id,purpose,provider,model,created_at FROM ai_usage_logs WHERE user_id=? AND success=1 AND mode='real' AND provider<>'demo'",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    for (const usage of aiUsage)
      rows.push({
        evidenceType: "project",
        sourceType: "ai_usage_log",
        sourceId: asText(usage.id),
        source: "Genesis OS AI 运行日志",
        description: `服务端真实 AI 调用成功；模块 ${asText(usage.purpose)}；Provider ${asText(usage.provider)}；模型 ${asText(usage.model)}。这只证明系统链路运行，不证明用户独立掌握。`,
        relatedAbility: "AI 应用工程",
        capturedAt: asText(usage.created_at),
      });

    const migrations = db
      .prepare("SELECT name,applied_at FROM schema_migrations WHERE name>='0007'")
      .all() as Array<Record<string, unknown>>;
    for (const migration of migrations)
      rows.push({
        evidenceType: "project",
        sourceType: "database_migration",
        sourceId: asText(migration.name),
        source: "Genesis OS 数据库迁移记录",
        description: `数据库已成功应用迁移 ${asText(migration.name)}。这证明对应数据结构在本地运行，不单独证明代码作者或工程熟练度。`,
        relatedAbility: "软件工程",
        capturedAt: asText(migration.applied_at),
      });
    return rows;
  }

  private collectSelfReflections(): RawEvidence[] {
    const entries = this.repository.db
      .prepare(
        "SELECT id,content,occurred_at,data_kind FROM self_entries WHERE user_id=? AND category='reflection' AND status='active' AND deleted_at IS NULL",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    return entries.map((entry) => ({
      evidenceType: "self_reflection",
      sourceType: "self_entry",
      sourceId: asText(entry.id),
      source: "用户每日反思",
      description: asText(entry.content).slice(0, 2_000),
      relatedAbility: "自我认知与复盘",
      capturedAt: asText(entry.occurred_at),
      dataKind: asText(entry.data_kind) as RawEvidence["dataKind"],
    }));
  }

  private collectOtherSelfEntries(): RawEvidence[] {
    const entries = this.repository.db.prepare(
      "SELECT id,content,category,tags_json,occurred_at,data_kind FROM self_entries WHERE user_id=? AND category!='reflection' AND status='active' AND deleted_at IS NULL",
    ).all(USER_ID) as Array<Record<string, unknown>>;
    return entries.map((entry) => {
      const category = asText(entry.category);
      const tags = parseJson<string[]>(entry.tags_json, []).map((tag) => tag.toLowerCase());
      const isCompetition = tags.some((tag) => /competition|contest|比赛|竞赛/.test(tag));
      const evidenceType: EvidenceType = category === "learning" ? "learning"
        : category === "project" ? "project"
          : category === "experience" && isCompetition ? "competition"
            : category === "experience" ? "external" : "self_reflection";
      return {
        evidenceType,
        sourceType: "self_entry",
        sourceId: asText(entry.id),
        source: "User self-input record",
        description: asText(entry.content).slice(0, 2_000),
        relatedAbility: category === "project" ? "Engineering delivery"
          : category === "learning" ? "Learning practice"
            : category === "experience" && isCompetition ? "Competition practice"
              : "Self-awareness and planning",
        capturedAt: asText(entry.occurred_at),
        dataKind: asText(entry.data_kind) as RawEvidence["dataKind"],
      };
    });
  }

  private collectProjectArtifacts(): RawEvidence[] {
    const artifacts = [
      ["lib/ai/router.ts", "AI 应用工程", "统一 AI Router 与 Provider 分层"],
      ["lib/ai/context-engine.ts", "AI 应用工程", "Genesis Context Engine 三层记忆"],
      ["lib/db/migrations/0009_growth_graph.sql", "软件工程", "Growth Graph 数据模型"],
      ["lib/db/migrations/0010_evidence_engine.sql", "软件工程", "Evidence Engine 数据模型"],
    ] as const;
    return artifacts.flatMap(([relativePath, ability, label]) => {
      const absolute = path.join(
        /* turbopackIgnore: true */ process.cwd(),
        relativePath,
      );
      if (!fs.existsSync(absolute)) return [];
      const content = fs.readFileSync(absolute);
      const stat = fs.statSync(absolute);
      const version = createHash("sha256").update(content).digest("hex");
      return [{
        evidenceType: "project" as const,
        sourceType: "project_artifact",
        sourceId: `${relativePath}:${version}`,
        source: `本地项目产物：${relativePath}`,
        description: `Genesis OS 存在可审查的${label}产物 ${relativePath}，版本指纹 ${version.slice(0, 12)}。文件存在不等同于用户独立完成。`,
        relatedAbility: ability,
        capturedAt: stat.mtime.toISOString(),
      }];
    });
  }

  syncSources() {
    const raw = [
      ...this.collectLearningEvidence(),
      ...this.collectProjectEvidence(),
      ...this.collectSelfReflections(),
      ...this.collectOtherSelfEntries(),
      ...this.collectProjectArtifacts(),
    ];
    const result = this.repository.db.transaction(() => {
      let inserted = 0;
      let reused = 0;
      let sources = 0;
      for (const evidence of raw) {
        const saved = this.addRawEvidence(evidence);
        if (saved.inserted) inserted += 1;
        else reused += 1;
        if (saved.sourceInserted) sources += 1;
      }
      this.audit("evidence.sources_synced", "evidence_engine", USER_ID, {
        inserted,
        reused,
        sources,
      });
      return { inserted, reused, sources };
    })();
    this.latestSync = result;
    return result;
  }

  createManual(input: ManualEvidenceInput) {
    const saved = this.repository.db.transaction(() => {
      const record = this.addRawEvidence({
        evidenceType: input.evidenceType,
        sourceType: "manual",
        sourceId: input.clientRequestId,
        source: input.source,
        description: input.description,
        relatedAbility: input.relatedAbility,
        capturedAt: input.capturedAt,
        dataKind: input.dataKind,
      });
      this.audit("evidence.manual_created", "evidence_item", record.id, {
        evidenceType: input.evidenceType,
        source: input.source,
        relatedAbility: input.relatedAbility,
        duplicate: !record.inserted,
      });
      return record;
    })();
    this.latestSync = {
      inserted: saved.inserted ? 1 : 0,
      reused: saved.inserted ? 0 : 1,
      sources: saved.sourceInserted ? 1 : 0,
    };
    return this.snapshot(false);
  }

  createLearningAgentResult(input: {
    resultId: string;
    goalTitle: string;
    description: string;
    relatedAbility: string;
    evidenceType: "learning" | "project";
    capturedAt: string;
    dataKind: "user" | "demo" | "test";
  }) {
    const saved = this.repository.db.transaction(() => {
      const record = this.addRawEvidence({
        evidenceType: input.evidenceType,
        sourceType: "learning_agent_result",
        sourceId: input.resultId,
        source: `Learning Agent：${input.goalTitle}`,
        description: input.description,
        relatedAbility: input.relatedAbility,
        capturedAt: input.capturedAt,
        dataKind: input.dataKind,
      });
      this.audit("evidence.learning_agent_result_created", "evidence_item", record.id, {
        resultId: input.resultId,
        relatedAbility: input.relatedAbility,
        inserted: record.inserted,
      });
      return record;
    })();
    return saved;
  }

  createLearningPhase2Evidence(input: {
    sourceType: "formal_assessment" | "code_assessment" | "project_challenge" | "mastery_decision";
    sourceId: string;
    goalTitle: string;
    description: string;
    relatedAbility: string;
    evidenceType: "learning" | "project";
    capturedAt: string;
    dataKind: "user" | "demo" | "test";
  }) {
    return this.repository.db.transaction(() => {
      const record = this.addRawEvidence({
        evidenceType: input.evidenceType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        source: `${input.sourceType === "project_challenge" ? "Project Challenge" : input.sourceType === "code_assessment" ? "Code Assessment" : input.sourceType === "mastery_decision" ? "Mastery Truth Decision" : "Formal Assessment"}：${input.goalTitle}`,
        description: input.description,
        relatedAbility: input.relatedAbility,
        capturedAt: input.capturedAt,
        dataKind: input.dataKind,
      });
      this.audit("evidence.learning_phase2_created", "evidence_item", record.id, {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        relatedAbility: input.relatedAbility,
        inserted: record.inserted,
      });
      return record;
    })();
  }

  pendingForAnalysis(limit = 20) {
    return this.repository.db
      .prepare(
        "SELECT id,evidence_type,source,description,related_ability,captured_at,confidence FROM evidence_items WHERE user_id=? AND verification_status='pending' AND data_kind='user' ORDER BY captured_at DESC LIMIT ?",
      )
      .all(USER_ID, limit) as Array<Record<string, unknown>>;
  }

  reportContext(limit = 12) {
    const reportDate = this.localDate();
    const rows = this.repository.db
      .prepare(
        "SELECT id,evidence_type,source,description,related_ability,captured_at,confidence,truthfulness,difficulty,independence,engineering_value,long_term_value FROM evidence_items WHERE user_id=? AND data_kind='user' AND verification_status IN ('verified','needs_review') ORDER BY captured_at DESC LIMIT 100",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    return {
      reportDate,
      items: rows
        .filter(
          (row) =>
            this.localDate(new Date(asText(row.captured_at))) === reportDate,
        )
        .slice(0, limit),
    };
  }

  saveAnalysis(
    analysis: EvidenceAnalysis,
    allowedEvidenceIds: Set<string>,
    meta: EvaluationMeta,
  ) {
    const db = this.repository.db;
    return db.transaction(() => {
      const returned = new Set(analysis.evaluations.map((item) => item.evidenceId));
      for (const evidenceId of returned)
        if (!allowedEvidenceIds.has(evidenceId))
          throw new Error(`EVIDENCE_UNKNOWN_ID:${evidenceId}`);
      for (const summary of analysis.report.newEvidenceSummary)
        if (!allowedEvidenceIds.has(summary.evidenceId))
          throw new Error(`EVIDENCE_UNKNOWN_REPORT_ID:${summary.evidenceId}`);
      if (returned.size !== allowedEvidenceIds.size)
        throw new Error("EVIDENCE_INCOMPLETE_ANALYSIS");

      const evaluationIds = new Map<string, string>();
      for (const raw of analysis.evaluations) {
        const item = db
          .prepare("SELECT * FROM evidence_items WHERE id=? AND user_id=?")
          .get(raw.evidenceId, USER_ID) as Record<string, unknown> | undefined;
        if (!item) throw new Error(`EVIDENCE_UNKNOWN_ID:${raw.evidenceId}`);
        const type = asText(item.evidence_type) as EvidenceType;
        const confidenceCap = Math.min(
          type === "self_reflection" ? 0.35 : 0.9,
          baseConfidence[type] + 0.12,
        );
        const evaluation: EvidenceEvaluation = {
          ...raw,
          confidence: Math.min(raw.confidence, confidenceCap),
          impact:
            type === "self_reflection"
              ? 0
              : clamp(raw.impact, 0, 1),
          proposedLevel:
            type === "self_reflection"
              ? 0
              : Math.min(raw.proposedLevel, 4),
          verificationStatus:
            type === "self_reflection" && raw.verificationStatus === "verified"
              ? "needs_review"
              : raw.verificationStatus,
        };
        const evaluationId = randomUUID();
        evaluationIds.set(raw.evidenceId, evaluationId);
        db.prepare(
          "INSERT INTO evidence_evaluations (id,user_id,evidence_item_id,candidate_id,related_ability,truthfulness,difficulty,independence,engineering_value,long_term_value,confidence,impact,verification_status,reasoning,proposed_level,next_improvement,provider,model,model_mode,prompt_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          evaluationId,
          USER_ID,
          raw.evidenceId,
          null,
          evaluation.relatedAbility,
          evaluation.truthfulness,
          evaluation.difficulty,
          evaluation.independence,
          evaluation.engineeringValue,
          evaluation.longTermValue,
          evaluation.confidence,
          evaluation.impact,
          evaluation.verificationStatus,
          evaluation.reasoning,
          evaluation.proposedLevel,
          evaluation.nextImprovement,
          meta.provider,
          meta.model,
          meta.modelMode,
          meta.promptVersion,
          now(),
        );
        db.prepare(
          "UPDATE evidence_items SET related_ability=?,verification_status=?,truthfulness=?,difficulty=?,independence=?,engineering_value=?,long_term_value=?,confidence=?,impact=?,provider=?,model=?,model_mode=?,updated_at=? WHERE id=?",
        ).run(
          evaluation.relatedAbility,
          evaluation.verificationStatus,
          evaluation.truthfulness,
          evaluation.difficulty,
          evaluation.independence,
          evaluation.engineeringValue,
          evaluation.longTermValue,
          evaluation.confidence,
          evaluation.impact,
          meta.provider,
          meta.model,
          meta.modelMode,
          now(),
          raw.evidenceId,
        );
      }
      this.saveDailyReport(analysis.report, [...allowedEvidenceIds], meta);
      this.audit("evidence.analysis_created", "evidence_engine", randomUUID(), {
        evidenceCount: allowedEvidenceIds.size,
        provider: meta.provider,
        modelMode: meta.modelMode,
      });
      return evaluationIds;
    })();
  }

  linkEvaluationsToCandidates(candidateByEvidence: Map<string, string>) {
    const update = this.repository.db.prepare(
      "UPDATE evidence_evaluations SET candidate_id=? WHERE evidence_item_id=? AND candidate_id IS NULL",
    );
    this.repository.db.transaction(() => {
      for (const [evidenceId, candidateId] of candidateByEvidence)
        update.run(candidateId, evidenceId);
    })();
  }

  saveDailyReport(
    report: EvidenceReport,
    evidenceIds: string[],
    meta: Pick<EvaluationMeta, "provider" | "model" | "modelMode">,
    reportDate = this.localDate(),
  ) {
    const timestamp = now();
    const existing = this.repository.db
      .prepare("SELECT id,created_at FROM daily_evidence_reports WHERE user_id=? AND report_date=?")
      .get(USER_ID, reportDate) as { id: string; created_at: string } | undefined;
    const id = existing?.id ?? randomUUID();
    this.repository.db
      .prepare(
        "INSERT INTO daily_evidence_reports (id,user_id,report_date,evidence_ids_json,new_evidence_summary_json,largest_strength,largest_weakness,next_90_days_json,limitations_json,provider,model,model_mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,report_date) DO UPDATE SET evidence_ids_json=excluded.evidence_ids_json,new_evidence_summary_json=excluded.new_evidence_summary_json,largest_strength=excluded.largest_strength,largest_weakness=excluded.largest_weakness,next_90_days_json=excluded.next_90_days_json,limitations_json=excluded.limitations_json,provider=excluded.provider,model=excluded.model,model_mode=excluded.model_mode,updated_at=excluded.updated_at",
      )
      .run(
        id,
        USER_ID,
        reportDate,
        JSON.stringify([...new Set(evidenceIds)]),
        JSON.stringify(report.newEvidenceSummary),
        report.largestStrength,
        report.largestWeakness,
        JSON.stringify(report.next90Days),
        JSON.stringify(report.limitations),
        meta.provider,
        meta.model,
        meta.modelMode,
        existing?.created_at ?? timestamp,
        timestamp,
      );
    return id;
  }

  ensureAutomaticDailyReport() {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
    const threshold = clamp(process.env.EVIDENCE_DAILY_HOUR ?? 20, 0, 23);
    const reportDate = this.localDate();
    const existing = this.repository.db
      .prepare("SELECT id FROM daily_evidence_reports WHERE user_id=? AND report_date=?")
      .get(USER_ID, reportDate);
    if (existing || hour < threshold) return;
    const rows = this.repository.db
      .prepare(
        "SELECT id,description,related_ability,verification_status,engineering_value,long_term_value,independence FROM evidence_items WHERE user_id=? AND data_kind='user' AND substr(captured_at,1,10)=? ORDER BY captured_at DESC LIMIT 20",
      )
      .all(USER_ID, reportDate) as Array<Record<string, unknown>>;
    if (!rows.length) return;
    const strongest = [...rows].sort(
      (left, right) =>
        Number(right.engineering_value || 0) + Number(right.long_term_value || 0) -
        Number(left.engineering_value || 0) - Number(left.long_term_value || 0),
    )[0];
    const weakest = [...rows].sort(
      (left, right) => Number(left.independence || 0) - Number(right.independence || 0),
    )[0];
    this.saveDailyReport(
      {
        newEvidenceSummary: rows.slice(0, 8).map((item) => ({
          evidenceId: asText(item.id),
          summary: asText(item.description).slice(0, 500),
        })),
        largestStrength: strongest
          ? `今日证据对“${asText(strongest.related_ability)}”支持相对最强，但仍以五维评估和用户批准为准。`
          : "今日暂无足够证据判断优势。",
        largestWeakness: weakest
          ? `“${asText(weakest.related_ability)}”的独立完成证据仍不足，需要补充可审查产物。`
          : "今日暂无足够证据判断短板。",
        next90Days: [
          "为关键能力持续补充独立产出、测试结果和复盘记录。",
          "用一个可部署项目贯通需求、实现、测试、交付和用户反馈。",
          "每周复核证据质量，不用自我表述替代可验证成果。",
        ],
        limitations: ["这是晚间首次访问时生成的确定性摘要，未调用 AI；人工分析后会被带 Provider 审计的报告替换。"],
      },
      rows.map((item) => asText(item.id)),
      { provider: "local", model: "deterministic-daily-v1", modelMode: "demo" },
      reportDate,
    );
  }

  private localDate(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.GENESIS_TIME_ZONE || "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  snapshot(autoDaily = true): EvidenceSnapshot {
    if (autoDaily) this.ensureAutomaticDailyReport();
    const db = this.repository.db;
    const sourceStatement = db.prepare(
      "SELECT * FROM evidence_item_sources WHERE evidence_item_id=? ORDER BY captured_at DESC",
    );
    const evaluationStatement = db.prepare(
      "SELECT * FROM evidence_evaluations WHERE evidence_item_id=? ORDER BY created_at DESC LIMIT 1",
    );
    const rows = db
      .prepare(
        "SELECT * FROM evidence_items WHERE user_id=? ORDER BY captured_at DESC,created_at DESC LIMIT 200",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    const items: EvidenceItemRecord[] = rows.map((item) => {
      const evaluation = evaluationStatement.get(item.id) as
        | Record<string, unknown>
        | undefined;
      return {
        id: asText(item.id),
        evidenceType: asText(item.evidence_type) as EvidenceType,
        sourceType: asText(item.source_type),
        sourceId: asText(item.source_id),
        source: asText(item.source),
        description: asText(item.description),
        relatedAbility: asText(item.related_ability),
        dataKind: asText(item.data_kind),
        capturedAt: asText(item.captured_at),
        verificationStatus: asText(item.verification_status) as EvidenceItemRecord["verificationStatus"],
        truthfulness: item.truthfulness === null ? null : Number(item.truthfulness),
        difficulty: item.difficulty === null ? null : Number(item.difficulty),
        independence: item.independence === null ? null : Number(item.independence),
        engineeringValue:
          item.engineering_value === null ? null : Number(item.engineering_value),
        longTermValue:
          item.long_term_value === null ? null : Number(item.long_term_value),
        confidence: Number(item.confidence),
        impact: Number(item.impact),
        sources: (sourceStatement.all(item.id) as Array<Record<string, unknown>>).map(
          (source) => ({
            id: asText(source.id),
            sourceType: asText(source.source_type),
            sourceId: asText(source.source_id),
            source: asText(source.source),
            capturedAt: asText(source.captured_at),
          }),
        ),
        latestEvaluation: evaluation
          ? {
              id: asText(evaluation.id),
              evidenceId: asText(evaluation.evidence_item_id),
              candidateId: evaluation.candidate_id
                ? asText(evaluation.candidate_id)
                : null,
              relatedAbility: asText(evaluation.related_ability),
              truthfulness: Number(evaluation.truthfulness),
              difficulty: Number(evaluation.difficulty),
              independence: Number(evaluation.independence),
              engineeringValue: Number(evaluation.engineering_value),
              longTermValue: Number(evaluation.long_term_value),
              confidence: Number(evaluation.confidence),
              impact: Number(evaluation.impact),
              verificationStatus: asText(
                evaluation.verification_status,
              ) as EvidenceEvaluation["verificationStatus"],
              reasoning: asText(evaluation.reasoning),
              proposedLevel: Number(evaluation.proposed_level),
              nextImprovement: asText(evaluation.next_improvement),
              provider: asText(evaluation.provider),
              model: asText(evaluation.model),
              modelMode: asText(evaluation.model_mode) as "demo" | "real",
              createdAt: asText(evaluation.created_at),
            }
          : null,
        createdAt: asText(item.created_at),
        updatedAt: asText(item.updated_at),
      };
    });
    const changeRows = db
      .prepare(
        "SELECT change.*,node.name ability_name FROM ability_change_snapshots change JOIN growth_nodes node ON node.id=change.ability_node_id WHERE change.user_id=? ORDER BY change.approved_at DESC LIMIT 100",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    const report = db
      .prepare(
        "SELECT * FROM daily_evidence_reports WHERE user_id=? ORDER BY report_date DESC LIMIT 1",
      )
      .get(USER_ID) as Record<string, unknown> | undefined;
    const reportEvidenceIds = report
      ? parseJson<string[]>(report.evidence_ids_json, [])
      : [];
    const reportEvidence = items.filter((item) =>
      reportEvidenceIds.includes(item.id),
    );
    const reportConfidence = reportEvidence.length
      ? reportEvidence.reduce((sum, item) => sum + item.confidence, 0) /
        reportEvidence.length
      : 0;
    const todayCompleted = report
      ? (db
          .prepare(
            "SELECT id,title,summary,occurred_at FROM life_events WHERE user_id=? AND data_kind='user' AND is_primary=1 AND hidden_at IS NULL AND deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 60",
          )
          .all(USER_ID) as Array<Record<string, unknown>>)
          .filter(
            (event) =>
              this.localDate(new Date(asText(event.occurred_at))) ===
              asText(report.report_date),
          )
          .slice(0, 8)
          .map((event) => ({
            id: asText(event.id),
            summary: `${asText(event.title)}：${asText(event.summary)}`.slice(
              0,
              500,
            ),
          }))
      : [];
    const candidatesPending = Number(
      (
        db
          .prepare(
            "SELECT count(*) count FROM growth_evidence_candidates WHERE user_id=? AND status='pending' AND candidate_kind='evidence_assessment'",
          )
          .get(USER_ID) as { count: number }
      ).count,
    );
    const pendingCandidateRows = db
      .prepare(
        "SELECT id,node_type,node_name,proposed_level,confidence,evidence_json,created_at FROM growth_evidence_candidates WHERE user_id=? AND status='pending' AND candidate_kind='evidence_assessment' ORDER BY created_at DESC LIMIT 100",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    return {
      items,
      pendingCandidates: pendingCandidateRows.map((candidate) => ({
        id: asText(candidate.id),
        nodeType: asText(candidate.node_type),
        name: asText(candidate.node_name),
        proposedLevel: Number(candidate.proposed_level),
        confidence: Number(candidate.confidence),
        evidenceIds: parseJson<Array<{ evidenceId: string }>>(candidate.evidence_json, []).map(
          (item) => item.evidenceId,
        ),
        createdAt: asText(candidate.created_at),
      })),
      abilityChanges: changeRows.map((change) => ({
        id: asText(change.id),
        evidenceItemId: asText(change.evidence_item_id),
        candidateId: asText(change.candidate_id),
        abilityNodeId: asText(change.ability_node_id),
        abilityName: asText(change.ability_name),
        previousLevel: Number(change.previous_level),
        proposedLevel: Number(change.proposed_level),
        approvedLevel: Number(change.approved_level),
        previousConfidence: Number(change.previous_confidence),
        approvedConfidence: Number(change.approved_confidence),
        reason: asText(change.reason),
        approvedAt: asText(change.approved_at),
      })),
      dailyReport: report
        ? {
            id: asText(report.id),
            reportDate: asText(report.report_date),
            evidenceIds: reportEvidenceIds,
            newEvidenceSummary: parseJson(report.new_evidence_summary_json, []),
            largestStrength: asText(report.largest_strength),
            largestWeakness: asText(report.largest_weakness),
            next90Days: parseJson(report.next_90_days_json, []),
            limitations: parseJson(report.limitations_json, []),
            provider: asText(report.provider),
            model: asText(report.model),
            modelMode: asText(report.model_mode) as "demo" | "real",
            confidence: reportConfidence,
            todayCompleted,
            createdAt: asText(report.created_at),
            updatedAt: asText(report.updated_at),
          }
        : null,
      stats: {
        total: items.length,
        pending: items.filter((item) => item.verificationStatus === "pending").length,
        verified: items.filter((item) => item.verificationStatus === "verified").length,
        needsReview: items.filter((item) => item.verificationStatus === "needs_review").length,
        candidatesPending,
      },
      adapters: [
        {
          id: "git",
          label: "Git Evidence Adapter",
          status: "not_connected",
          signals: ["提交频率", "代码规模", "项目结构", "README 质量", "Issue 处理", "测试覆盖"],
        },
      ],
      lastSync: this.latestSync,
    };
  }
}
