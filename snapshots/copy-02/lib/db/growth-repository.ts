import { createHash, randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import type {
  GrowthAnalysis,
  GrowthCandidate,
  GrowthCandidateDecision,
  GrowthNodeType,
} from "@/lib/domain/growth";

const USER_ID = "genesis-owner";
const now = () => new Date().toISOString();
const asText = (value: unknown) => String(value ?? "").trim();
const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

export function growthCanonicalKey(type: GrowthNodeType, name: string) {
  const normalized = name
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
  return createHash("sha256").update(`${type}:${normalized}`).digest("hex");
}

export function growthConceptKey(type: GrowthNodeType, name: string) {
  const normalized = name
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
  const aliases: Array<[boolean, string]> =
    type === "ability"
      ? [
          [/产品(?:意识|想法|思维)/.test(normalized), "product_awareness"],
          [/(?:ai|人工智能).*工具|工具.*(?:ai|人工智能)/i.test(normalized), "ai_tool_use"],
          [
            /项目.*(?:闭环|交付)|(?:闭环|交付).*项目/.test(normalized),
            "project_delivery",
          ],
          [
            /工程.*(?:学习|进展|实践)|(?:学习|进展|实践).*工程/.test(normalized),
            "engineering_practice",
          ],
        ]
      : type === "weakness"
        ? [
            [
              /执行.*(?:不稳定|波动)|(?:多项目|项目).*(?:未闭环|缺少闭环)/.test(
                normalized,
              ),
              "execution_closure_risk",
            ],
            [
              /(?:编程|数学|计算机).*(?:基础|体系).*(?:不足|薄弱)?/.test(
                normalized,
              ),
              "foundation_gap",
            ],
          ]
        : [];
  const alias = aliases.find(([matches]) => matches)?.[1] ?? normalized;
  return createHash("sha256").update(`${type}:${alias}`).digest("hex");
}

export type GrowthEvidenceRecord = {
  id: string;
  sourceType: string;
  sourceId: string;
  excerpt: string;
  confidence: number;
  status: string;
  createdAt: string;
};

export type GrowthNodeRecord = {
  id: string;
  nodeType: GrowthNodeType;
  name: string;
  currentLevel: number;
  confidence: number;
  nextImprovement: string;
  status: string;
  evidenceCount: number;
  lastUpdated: string;
  evidence: GrowthEvidenceRecord[];
  relatedGoals: string[];
};

export type GrowthCandidateRecord = GrowthCandidate & {
  id: string;
  status: "pending" | "approved" | "rejected";
  candidateKind: "growth_inference" | "evidence_assessment";
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  createdAt: string;
  decidedAt: string | null;
};

type CandidatePersistenceMeta = {
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  promptVersion: string;
  allowedEvidenceIds: Set<string>;
  candidateKind?: "growth_inference" | "evidence_assessment";
};

export type GrowthRecommendationRecord = GrowthAnalysis["recommendation"] & {
  id: string;
  provider: string;
  model: string;
  modelMode: "demo" | "real";
  status: string;
  createdAt: string;
};

export type GrowthGraphSnapshot = {
  nodes: GrowthNodeRecord[];
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    relation: string;
    confidence: number;
  }>;
  candidates: GrowthCandidateRecord[];
  recommendation: GrowthRecommendationRecord | null;
  radar: Array<{
    id: string;
    name: string;
    level: number;
    percent: number;
    confidence: number;
    evidenceCount: number;
    nextImprovement: string;
  }>;
};

type TrustedNode = {
  type: GrowthNodeType;
  name: string;
  level: number;
  confidence: number;
  nextImprovement?: string;
  sourceType: GrowthEvidenceRecord["sourceType"];
  sourceId: string;
  excerpt: string;
};

export class GrowthRepository {
  constructor(private readonly repository: ProfileRepository) {}

  private audit(
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    this.repository.db
      .prepare(
        "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        USER_ID,
        action,
        entityType,
        entityId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        now(),
      );
  }

  private upsertTrustedNode(input: TrustedNode) {
    const timestamp = now();
    const canonical = growthCanonicalKey(input.type, input.name);
    let node = this.repository.db
      .prepare(
        "SELECT * FROM growth_nodes WHERE user_id=? AND node_type=? AND canonical_key=?",
      )
      .get(USER_ID, input.type, canonical) as Record<string, unknown> | undefined;
    if (!node) {
      const compatible = (
        this.repository.db
          .prepare(
            "SELECT * FROM growth_nodes WHERE user_id=? AND node_type=? AND status='active'",
          )
          .all(USER_ID, input.type) as Array<Record<string, unknown>>
      ).find(
        (candidate) =>
          growthConceptKey(input.type, asText(candidate.name)) ===
          growthConceptKey(input.type, input.name),
      );
      node = compatible;
    }
    if (!node) {
      const id = randomUUID();
      this.repository.db
        .prepare(
          "INSERT INTO growth_nodes (id,user_id,node_type,name,canonical_key,current_level,confidence,next_improvement,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'active',?,?)",
        )
        .run(
          id,
          USER_ID,
          input.type,
          input.name,
          canonical,
          input.level,
          input.confidence,
          input.nextImprovement ?? "",
          timestamp,
          timestamp,
        );
      node = { id, current_level: input.level, confidence: input.confidence };
    } else {
      this.repository.db
        .prepare(
          "UPDATE growth_nodes SET current_level=max(current_level,?),confidence=max(confidence,?),next_improvement=CASE WHEN ?<>'' THEN ? ELSE next_improvement END,status='active',updated_at=? WHERE id=?",
        )
        .run(
          input.level,
          input.confidence,
          input.nextImprovement ?? "",
          input.nextImprovement ?? "",
          timestamp,
          node.id,
        );
    }
    this.repository.db
      .prepare(
        "INSERT OR IGNORE INTO growth_evidence (id,user_id,node_id,source_type,source_id,excerpt,confidence,status,created_at,confirmed_at) VALUES (?,?,?,?,?,?,?,'confirmed',?,?)",
      )
      .run(
        randomUUID(),
        USER_ID,
        node.id,
        input.sourceType,
        input.sourceId,
        input.excerpt,
        input.confidence,
        timestamp,
        timestamp,
      );
    return String(node.id);
  }

  private reconcilePendingCandidates() {
    const db = this.repository.db;
    const pending = db
      .prepare(
        "SELECT * FROM growth_evidence_candidates WHERE user_id=? AND status='pending' ORDER BY created_at DESC",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    const formal = db
      .prepare(
        "SELECT id,node_type,name FROM growth_nodes WHERE user_id=? AND status='active'",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    const formalKeys = new Set(
      formal.map((node) =>
        growthConceptKey(
          asText(node.node_type) as GrowthNodeType,
          asText(node.name),
        ),
      ),
    );
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const candidate of pending) {
      const key = growthConceptKey(
        asText(candidate.node_type) as GrowthNodeType,
        asText(candidate.node_name),
      );
      const group = groups.get(key) ?? [];
      group.push(candidate);
      groups.set(key, group);
    }
    const timestamp = now();
    for (const [key, group] of groups) {
      const evidenceCandidates = group.filter((candidate) => {
        const evidence = parseJson<Array<{ evidenceId: string }>>(
          candidate.evidence_json,
          [],
        );
        return (
          asText(candidate.candidate_kind) === "evidence_assessment" ||
          evidence.some((item) => item.evidenceId.startsWith("EV:"))
        );
      });
      if (formalKeys.has(key) && evidenceCandidates.length === 0) {
        for (const candidate of group) {
          db.prepare(
            "UPDATE growth_evidence_candidates SET status='rejected',decided_at=?,updated_at=? WHERE id=?",
          ).run(timestamp, timestamp, candidate.id);
          this.audit(
            "growth.candidate_deduplicated",
            "growth_evidence_candidate",
            asText(candidate.id),
            candidate,
            { reason: "matches_confirmed_node" },
          );
        }
        continue;
      }
      const eligible = formalKeys.has(key) ? evidenceCandidates : group;
      for (const candidate of group.filter((item) => !eligible.includes(item))) {
        db.prepare(
          "UPDATE growth_evidence_candidates SET status='rejected',decided_at=?,updated_at=? WHERE id=?",
        ).run(timestamp, timestamp, candidate.id);
        this.audit(
          "growth.candidate_deduplicated",
          "growth_evidence_candidate",
          asText(candidate.id),
          candidate,
          { reason: "replaced_by_direct_evidence_candidate" },
        );
      }
      const keeper = [...eligible].sort((left, right) => {
        const evidenceDifference =
          parseJson<unknown[]>(right.evidence_json, []).length -
          parseJson<unknown[]>(left.evidence_json, []).length;
        if (evidenceDifference) return evidenceDifference;
        const confidenceDifference = Number(right.confidence) - Number(left.confidence);
        if (confidenceDifference) return confidenceDifference;
        return asText(right.created_at).localeCompare(asText(left.created_at));
      })[0];
      const duplicates = eligible.filter((candidate) => candidate.id !== keeper.id);
      const mergedEvidence = [
        ...new Map(
          eligible
            .flatMap((candidate) =>
              parseJson<Array<{ evidenceId: string; excerpt: string; reason: string }>>(
                candidate.evidence_json,
                [],
              ),
            )
            .map((evidence) => [
              `${evidence.evidenceId}:${evidence.excerpt}`,
              evidence,
            ]),
        ).values(),
      ].slice(0, 8);
      for (const duplicate of duplicates) {
        db.prepare(
          "UPDATE growth_evidence_candidates SET status='rejected',decided_at=?,updated_at=? WHERE id=?",
        ).run(timestamp, timestamp, duplicate.id);
        this.audit(
          "growth.candidate_deduplicated",
          "growth_evidence_candidate",
          asText(duplicate.id),
          duplicate,
          { reason: "semantic_duplicate", keptCandidateId: keeper.id },
        );
      }
      db.prepare(
        "UPDATE growth_evidence_candidates SET canonical_key=?,evidence_json=?,candidate_kind=?,updated_at=? WHERE id=?",
      ).run(
        key,
        JSON.stringify(mergedEvidence),
        evidenceCandidates.length ? "evidence_assessment" : "growth_inference",
        timestamp,
        keeper.id,
      );
    }
  }

  private persistCandidates(
    candidates: GrowthCandidate[],
    meta: CandidatePersistenceMeta,
  ) {
    const db = this.repository.db;
    const timestamp = now();
    const candidateByEvidence = new Map<string, string>();
    for (const candidate of candidates) {
      for (const evidence of candidate.evidence)
        if (!meta.allowedEvidenceIds.has(evidence.evidenceId))
          throw new Error(`GROWTH_UNKNOWN_EVIDENCE:${evidence.evidenceId}`);
      const canonical = growthConceptKey(candidate.nodeType, candidate.name);
      const matchesFormal = (
        db.prepare(
          "SELECT name FROM growth_nodes WHERE user_id=? AND node_type=? AND status='active'",
        ).all(USER_ID, candidate.nodeType) as Array<{ name: string }>
      ).some(
        (node) => growthConceptKey(candidate.nodeType, node.name) === canonical,
      );
      const candidateKind = meta.candidateKind ?? "growth_inference";
      if (matchesFormal && candidateKind !== "evidence_assessment") continue;
      const existing = db
        .prepare(
          "SELECT * FROM growth_evidence_candidates WHERE user_id=? AND node_type=? AND canonical_key=? AND status='pending'",
        )
        .get(USER_ID, candidate.nodeType, canonical) as
        | Record<string, unknown>
        | undefined;
      const candidateId = existing ? asText(existing.id) : randomUUID();
      if (existing) {
        const mergedEvidence = [
          ...new Map(
            [
              ...parseJson<GrowthCandidate["evidence"]>(existing.evidence_json, []),
              ...candidate.evidence,
            ].map((item) => [`${item.evidenceId}:${item.excerpt}`, item]),
          ).values(),
        ].slice(0, 8);
        db.prepare(
          "UPDATE growth_evidence_candidates SET proposed_level=max(proposed_level,?),confidence=max(confidence,?),next_improvement=?,related_goals_json=?,evidence_json=?,candidate_kind=?,provider=?,model=?,model_mode=?,prompt_version=?,updated_at=? WHERE id=?",
        ).run(
          candidate.proposedLevel,
          candidate.confidence,
          candidate.nextImprovement,
          JSON.stringify([
            ...new Set([
              ...parseJson<string[]>(existing.related_goals_json, []),
              ...candidate.relatedGoals,
            ]),
          ].slice(0, 6)),
          JSON.stringify(mergedEvidence),
          candidateKind === "evidence_assessment"
            ? "evidence_assessment"
            : asText(existing.candidate_kind) || "growth_inference",
          meta.provider,
          meta.model,
          meta.modelMode,
          meta.promptVersion,
          timestamp,
          candidateId,
        );
      } else {
        db.prepare(
          "INSERT INTO growth_evidence_candidates (id,user_id,node_type,node_name,canonical_key,proposed_level,confidence,next_improvement,related_goals_json,evidence_json,status,provider,model,model_mode,prompt_version,created_at,updated_at,candidate_kind) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?)",
        ).run(
          candidateId,
          USER_ID,
          candidate.nodeType,
          candidate.name,
          canonical,
          candidate.proposedLevel,
          candidate.confidence,
          candidate.nextImprovement,
          JSON.stringify(candidate.relatedGoals),
          JSON.stringify(candidate.evidence),
          meta.provider,
          meta.model,
          meta.modelMode,
          meta.promptVersion,
          timestamp,
          timestamp,
          candidateKind,
        );
      }
      for (const evidence of candidate.evidence)
        candidateByEvidence.set(evidence.evidenceId, candidateId);
    }
    return candidateByEvidence;
  }

  saveCandidates(candidates: GrowthCandidate[], meta: CandidatePersistenceMeta) {
    return this.repository.db.transaction(() => this.persistCandidates(candidates, meta))();
  }

  syncTrustedEvidence() {
    const db = this.repository.db;
    return db.transaction(() => {
      const user = db
        .prepare(
          "SELECT long_term_goal,current_stage FROM users WHERE id=?",
        )
        .get(USER_ID) as Record<string, unknown>;
      if (asText(user.current_stage))
        this.upsertTrustedNode({
          type: "identity",
          name: `当前阶段：${asText(user.current_stage)}`,
          level: 0,
          confidence: 0.95,
          sourceType: "user_input",
          sourceId: "user:current_stage",
          excerpt: asText(user.current_stage),
        });
      if (asText(user.long_term_goal))
        this.upsertTrustedNode({
          type: "goal",
          name: asText(user.long_term_goal),
          level: 0,
          confidence: 0.95,
          sourceType: "user_input",
          sourceId: "user:long_term_goal",
          excerpt: asText(user.long_term_goal),
        });

      const facts = db
        .prepare(
          "SELECT id,content,fact_type,confidence,evidence_count FROM profile_facts WHERE user_id=? AND status='active' AND is_active=1 AND deleted_at IS NULL",
        )
        .all(USER_ID) as Array<Record<string, unknown>>;
      for (const fact of facts) {
        const factType = asText(fact.fact_type);
        const type: GrowthNodeType =
          factType === "capability" || factType === "opportunity"
            ? "ability"
            : factType === "goal"
              ? "goal"
              : factType === "risk" || factType === "pattern"
                ? "weakness"
                : "identity";
        const evidenceCount = Number(fact.evidence_count || 1);
        const confidence = Number(fact.confidence || 0.5);
        const level =
          type === "ability"
            ? evidenceCount >= 3 && confidence >= 0.75
              ? 3
              : evidenceCount >= 2
                ? 2
                : 1
            : 0;
        this.upsertTrustedNode({
          type,
          name: asText(fact.content),
          level,
          confidence,
          sourceType: "profile_fact",
          sourceId: asText(fact.id),
          excerpt: asText(fact.content),
        });
      }

      const goals = db
        .prepare(
          "SELECT id,title,purpose,final_goal FROM learning_goals WHERE user_id=? AND data_kind='user' AND status<>'archived' AND deleted_at IS NULL",
        )
        .all(USER_ID) as Array<Record<string, unknown>>;
      for (const goal of goals)
        this.upsertTrustedNode({
          type: "goal",
          name: asText(goal.title),
          level: 0,
          confidence: 0.95,
          nextImprovement: asText(goal.final_goal),
          sourceType: "learning_goal",
          sourceId: asText(goal.id),
          excerpt: [asText(goal.purpose), asText(goal.final_goal)]
            .filter(Boolean)
            .join("；") || asText(goal.title),
        });

      const abilities = db
        .prepare(
          "SELECT n.id,n.title,n.mastery,n.mastery_confidence,n.evidence_count,n.updated_at,g.title goal_title FROM knowledge_nodes n JOIN learning_goals g ON g.id=n.goal_id WHERE g.user_id=? AND g.data_kind='user' AND g.deleted_at IS NULL AND n.evidence_count>0",
        )
        .all(USER_ID) as Array<Record<string, unknown>>;
      for (const ability of abilities)
        this.upsertTrustedNode({
          type: "ability",
          name: asText(ability.title),
          level: Math.max(1, Math.min(5, Math.round(Number(ability.mastery) * 5))),
          confidence: Math.max(0, Math.min(1, Number(ability.mastery_confidence))),
          nextImprovement: `继续在“${asText(ability.goal_title)}”中完成独立实践与延迟测试`,
          sourceType: "learning_evidence",
          sourceId: asText(ability.id),
          excerpt: `掌握度 ${Math.round(Number(ability.mastery) * 100)}%，证据 ${Number(ability.evidence_count)} 条`,
        });

      const projects = db
        .prepare(
          "SELECT o.id,o.title,o.status,o.demo_notes,o.retrospective FROM engineering_outcomes o JOIN learning_goals g ON g.id=o.goal_id WHERE g.user_id=? AND g.data_kind='user'",
        )
        .all(USER_ID) as Array<Record<string, unknown>>;
      for (const project of projects)
        this.upsertTrustedNode({
          type: "project",
          name: asText(project.title),
          level: 0,
          confidence: 0.92,
          sourceType: "engineering_outcome",
          sourceId: asText(project.id),
          excerpt: [asText(project.status), asText(project.demo_notes), asText(project.retrospective)]
            .filter(Boolean)
            .join("；")
            .slice(0, 800),
        });
      this.reconcilePendingCandidates();
      return this.snapshot(false);
    })();
  }

  saveAnalysis(
    analysis: GrowthAnalysis,
    meta: CandidatePersistenceMeta,
  ) {
    const db = this.repository.db;
    return db.transaction(() => {
      const timestamp = now();
      this.persistCandidates(analysis.candidates, meta);
      const recommendationIds = [
        ...analysis.recommendation.next30Days.flatMap((entry) => entry.evidenceIds),
        ...analysis.recommendation.next90Days.evidenceIds,
        ...analysis.recommendation.nextYear.evidenceIds,
      ];
      for (const evidenceId of recommendationIds)
        if (!meta.allowedEvidenceIds.has(evidenceId))
          throw new Error(`GROWTH_UNKNOWN_EVIDENCE:${evidenceId}`);
      db.prepare(
        "UPDATE growth_recommendations SET status='archived',updated_at=? WHERE user_id=? AND status='draft'",
      ).run(timestamp, USER_ID);
      const recommendationId = randomUUID();
      db.prepare(
        "INSERT INTO growth_recommendations (id,user_id,goal,next_30_days_json,next_90_days_json,next_year_json,evidence_ids_json,confidence,limitations_json,status,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?)",
      ).run(
        recommendationId,
        USER_ID,
        analysis.recommendation.goal,
        JSON.stringify(analysis.recommendation.next30Days),
        JSON.stringify(analysis.recommendation.next90Days),
        JSON.stringify(analysis.recommendation.nextYear),
        JSON.stringify([...new Set(recommendationIds)]),
        analysis.recommendation.confidence,
        JSON.stringify(analysis.recommendation.limitations),
        meta.provider,
        meta.model,
        meta.modelMode,
        meta.promptVersion,
        timestamp,
        timestamp,
      );
      this.audit("growth.analysis_created", "growth_recommendation", recommendationId, null, {
        candidateCount: analysis.candidates.length,
        provider: meta.provider,
        modelMode: meta.modelMode,
      });
      return this.snapshot(false);
    })();
  }

  decideCandidate(id: string, decision: GrowthCandidateDecision) {
    const db = this.repository.db;
    return db.transaction(() => {
      const candidate = db
        .prepare(
          "SELECT * FROM growth_evidence_candidates WHERE id=? AND user_id=?",
        )
        .get(id, USER_ID) as Record<string, unknown> | undefined;
      if (!candidate) throw new Error("GROWTH_CANDIDATE_NOT_FOUND");
      if (candidate.status !== "pending") throw new Error("GROWTH_CANDIDATE_ALREADY_DECIDED");
      const timestamp = now();
      db.prepare(
        "UPDATE growth_evidence_candidates SET status=?,decided_at=?,updated_at=? WHERE id=?",
      ).run(decision.action === "approve" ? "approved" : "rejected", timestamp, timestamp, id);
      const evidenceReferences = parseJson<Array<{ evidenceId: string; excerpt: string; reason: string }>>(
        candidate.evidence_json,
        [],
      );
      const evidenceItemIds = evidenceReferences
        .map((evidence) => evidence.evidenceId)
        .filter((evidenceId) => evidenceId.startsWith("EV:"))
        .map((evidenceId) => evidenceId.slice(3));
      if (decision.action === "reject") {
        for (const evidenceItemId of evidenceItemIds)
          db.prepare(
            "UPDATE evidence_items SET verification_status='rejected',updated_at=? WHERE id=? AND verification_status<>'verified'",
          ).run(timestamp, evidenceItemId);
        this.audit("growth.candidate_rejected", "growth_evidence_candidate", id, candidate, {
          status: "rejected",
        });
        return this.snapshot(false);
      }
      const nodeType = asText(candidate.node_type) as GrowthNodeType;
      const name = decision.name ?? asText(candidate.node_name);
      const existingNode = (
        db.prepare(
          "SELECT * FROM growth_nodes WHERE user_id=? AND node_type=? AND status='active'",
        ).all(USER_ID, nodeType) as Array<Record<string, unknown>>
      ).find(
        (node) =>
          growthConceptKey(nodeType, asText(node.name)) ===
          growthConceptKey(nodeType, name),
      );
      const previousLevel = Number(existingNode?.current_level || 0);
      const previousConfidence = Number(existingNode?.confidence || 0);
      let level = decision.currentLevel ?? Number(candidate.proposed_level);
      const evidenceItems = evidenceItemIds.map((evidenceItemId) =>
        db.prepare("SELECT * FROM evidence_items WHERE id=?").get(evidenceItemId),
      ) as Array<Record<string, unknown> | undefined>;
      if (asText(candidate.candidate_kind) === "evidence_assessment") {
        level = Math.min(level, previousLevel + 1);
        if (
          evidenceItems.length > 0 &&
          evidenceItems.every((item) => asText(item?.evidence_type) === "self_reflection")
        )
          level = previousLevel;
      }
      const nextImprovement = decision.nextImprovement ?? asText(candidate.next_improvement);
      const nodeId = this.upsertTrustedNode({
        type: nodeType,
        name,
        level,
        confidence: Number(candidate.confidence),
        nextImprovement,
        sourceType: "ai_evaluation",
        sourceId: id,
        excerpt: evidenceReferences
          .map((evidence) => evidence.excerpt)
          .join("；")
          .slice(0, 800),
      });
      db.prepare(
        "UPDATE growth_nodes SET current_level=?,next_improvement=?,updated_at=? WHERE id=?",
      ).run(level, nextImprovement, timestamp, nodeId);
      for (const evidenceItemId of evidenceItemIds) {
        const evidenceItem = db
          .prepare("SELECT * FROM evidence_items WHERE id=?")
          .get(evidenceItemId) as Record<string, unknown> | undefined;
        if (!evidenceItem) throw new Error(`EVIDENCE_ITEM_NOT_FOUND:${evidenceItemId}`);
        const reference = evidenceReferences.find(
          (item) => item.evidenceId === `EV:${evidenceItemId}`,
        );
        db.prepare(
          "INSERT OR IGNORE INTO growth_evidence (id,user_id,node_id,source_type,source_id,excerpt,confidence,status,created_at,confirmed_at) VALUES (?,?,?,?,?,?,?,'confirmed',?,?)",
        ).run(
          randomUUID(),
          USER_ID,
          nodeId,
          "evidence_item",
          evidenceItemId,
          reference?.excerpt || asText(evidenceItem.description),
          Number(evidenceItem.confidence),
          timestamp,
          timestamp,
        );
        db.prepare(
          "UPDATE evidence_items SET verification_status='verified',updated_at=? WHERE id=?",
        ).run(timestamp, evidenceItemId);
        if (nodeType === "ability")
          db.prepare(
            "INSERT OR IGNORE INTO ability_change_snapshots (id,user_id,evidence_item_id,candidate_id,ability_node_id,previous_level,proposed_level,approved_level,previous_confidence,approved_confidence,reason,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          ).run(
            randomUUID(),
            USER_ID,
            evidenceItemId,
            id,
            nodeId,
            previousLevel,
            Number(candidate.proposed_level),
            level,
            previousConfidence,
            Number(candidate.confidence),
            reference?.reason || "用户批准成长证据候选",
            timestamp,
          );
      }
      const relatedGoals = parseJson<string[]>(candidate.related_goals_json, []);
      for (const goalName of relatedGoals) {
        const goal = db
          .prepare(
            "SELECT id FROM growth_nodes WHERE user_id=? AND node_type='goal' AND canonical_key=? AND status='active'",
          )
          .get(USER_ID, growthCanonicalKey("goal", goalName)) as { id: string } | undefined;
        if (!goal || goal.id === nodeId) continue;
        db.prepare(
          "INSERT OR IGNORE INTO growth_edges (id,user_id,source_node_id,target_node_id,relation,confidence,status,created_at,updated_at) VALUES (?,?,?,?, 'relates_to',?,'active',?,?)",
        ).run(randomUUID(), USER_ID, nodeId, goal.id, Number(candidate.confidence), timestamp, timestamp);
      }
      this.audit("growth.candidate_approved", "growth_evidence_candidate", id, candidate, {
        nodeId,
        name,
        currentLevel: level,
      });
      return this.snapshot(false);
    })();
  }

  snapshot(sync = true): GrowthGraphSnapshot {
    if (sync) return this.syncTrustedEvidence();
    const db = this.repository.db;
    const nodeRows = db
      .prepare(
        "SELECT * FROM growth_nodes WHERE user_id=? AND status='active' ORDER BY node_type,name",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    const evidenceStatement = db.prepare(
      "SELECT * FROM growth_evidence WHERE node_id=? AND status='confirmed' ORDER BY created_at DESC",
    );
    const goalStatement = db.prepare(
      "SELECT target.name FROM growth_edges edge JOIN growth_nodes target ON target.id=edge.target_node_id WHERE edge.source_node_id=? AND edge.status='active' AND target.node_type='goal'",
    );
    const nodes: GrowthNodeRecord[] = nodeRows.map((node) => {
      const evidenceRows = evidenceStatement.all(node.id) as Array<Record<string, unknown>>;
      return {
        id: asText(node.id),
        nodeType: asText(node.node_type) as GrowthNodeType,
        name: asText(node.name),
        currentLevel: Number(node.current_level),
        confidence: Number(node.confidence),
        nextImprovement: asText(node.next_improvement),
        status: asText(node.status),
        evidenceCount: evidenceRows.length,
        lastUpdated: asText(node.updated_at),
        evidence: evidenceRows.map((evidence) => ({
          id: asText(evidence.id),
          sourceType: asText(evidence.source_type),
          sourceId: asText(evidence.source_id),
          excerpt: asText(evidence.excerpt),
          confidence: Number(evidence.confidence),
          status: asText(evidence.status),
          createdAt: asText(evidence.created_at),
        })),
        relatedGoals: (goalStatement.all(node.id) as Array<{ name: string }>).map(
          (goal) => goal.name,
        ),
      };
    });
    const edgeRows = db
      .prepare(
        "SELECT * FROM growth_edges WHERE user_id=? AND status='active' ORDER BY created_at",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    const candidateRows = db
      .prepare(
        "SELECT * FROM growth_evidence_candidates WHERE user_id=? ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100",
      )
      .all(USER_ID) as Array<Record<string, unknown>>;
    const recommendation = db
      .prepare(
        "SELECT * FROM growth_recommendations WHERE user_id=? AND status IN ('draft','accepted') ORDER BY created_at DESC LIMIT 1",
      )
      .get(USER_ID) as Record<string, unknown> | undefined;
    const candidates: GrowthCandidateRecord[] = candidateRows.map((candidate) => ({
      id: asText(candidate.id),
      nodeType: asText(candidate.node_type) as GrowthNodeType,
      name: asText(candidate.node_name),
      proposedLevel: Number(candidate.proposed_level),
      confidence: Number(candidate.confidence),
      nextImprovement: asText(candidate.next_improvement),
      relatedGoals: parseJson<string[]>(candidate.related_goals_json, []),
      evidence: parseJson<GrowthCandidate["evidence"]>(candidate.evidence_json, []),
      status: asText(candidate.status) as GrowthCandidateRecord["status"],
      candidateKind: (asText(candidate.candidate_kind) ||
        "growth_inference") as GrowthCandidateRecord["candidateKind"],
      provider: asText(candidate.provider),
      model: asText(candidate.model),
      modelMode: asText(candidate.model_mode) as "demo" | "real",
      createdAt: asText(candidate.created_at),
      decidedAt: candidate.decided_at ? asText(candidate.decided_at) : null,
    }));
    const recommendationRecord: GrowthRecommendationRecord | null = recommendation
      ? {
          id: asText(recommendation.id),
          goal: asText(recommendation.goal),
          next30Days: parseJson(recommendation.next_30_days_json, []),
          next90Days: parseJson(recommendation.next_90_days_json, {
            project: "",
            deliverables: [],
            evidenceIds: [],
          }),
          nextYear: parseJson(recommendation.next_year_json, {
            stage: "",
            proof: [],
            evidenceIds: [],
          }),
          confidence: Number(recommendation.confidence),
          limitations: parseJson(recommendation.limitations_json, []),
          provider: asText(recommendation.provider),
          model: asText(recommendation.model),
          modelMode: asText(recommendation.model_mode) as "demo" | "real",
          status: asText(recommendation.status),
          createdAt: asText(recommendation.created_at),
        }
      : null;
    return {
      nodes,
      edges: edgeRows.map((edge) => ({
        id: asText(edge.id),
        sourceNodeId: asText(edge.source_node_id),
        targetNodeId: asText(edge.target_node_id),
        relation: asText(edge.relation),
        confidence: Number(edge.confidence),
      })),
      candidates,
      recommendation: recommendationRecord,
      radar: nodes
        .filter((node) => node.nodeType === "ability" && node.evidenceCount > 0)
        .map((node) => ({
          id: node.id,
          name: node.name,
          level: node.currentLevel,
          percent: node.currentLevel * 20,
          confidence: node.confidence,
          evidenceCount: node.evidenceCount,
          nextImprovement: node.nextImprovement,
        })),
    };
  }
}
