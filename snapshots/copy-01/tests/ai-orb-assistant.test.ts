import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { orbAssistantRequestSchema } from "@/lib/domain/ai-orb";
import { OrbAssistantService } from "@/lib/services/orb-assistant-service";
import { GenesisAgentController } from "@/lib/services/orb-agent-controller-service";

const original = {
  key: process.env.DEEPSEEK_API_KEY,
  provider: process.env.MODEL_PROVIDER,
};

describe("Genesis AI Orb assistant", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "";
    process.env.MODEL_PROVIDER = "deepseek";
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-orb-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
    if (original.key === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = original.key;
    if (original.provider === undefined) delete process.env.MODEL_PROVIDER;
    else process.env.MODEL_PROVIDER = original.provider;
  });

  it("validates the Chinese-first Orb request contract", () => {
    expect(() => orbAssistantRequestSchema.parse({ message: "x" })).toThrow();
    const parsed = orbAssistantRequestSchema.parse({
      message: "今天我应该先看什么？",
      currentPath: "/",
      conversation: [{ role: "assistant", content: "我只读已批准上下文。" }],
    });
    expect(parsed.currentPath).toBe("/");
    expect(parsed.conversation).toHaveLength(1);
  });

  it("uses ContextEngine and AI Router boundaries without importing Providers directly", () => {
    const root = process.cwd();
    const component = fs.readFileSync(path.join(root, "components/ai-orb-assistant.tsx"), "utf8");
    const service = fs.readFileSync(path.join(root, "lib/services/orb-assistant-service.ts"), "utf8");
    const route = fs.readFileSync(path.join(root, "app/api/orb-assistant/route.ts"), "utf8");
    expect(component).toContain("createOrbRenderer");
    expect(component).toContain("/api/orb-assistant");
    expect(component).not.toMatch(/DeepSeekProvider|OpenAIProvider|providers\/(deepseek|openai)/);
    expect(service).toContain("new ContextEngine");
    expect(service).toContain("context.complete");
    expect(service).toContain("approvedOnly: true");
    expect(service).not.toMatch(/providers\/(deepseek|openai)|DeepSeekProvider|OpenAIProvider|getAIRouter/);
    expect(route).toContain("readTrustedJson");
  });

  it("ports the upstream Orb runtime instead of a custom icon button", () => {
    const root = process.cwd();
    const component = fs.readFileSync(path.join(root, "components/ai-orb-assistant.tsx"), "utf8");
    const renderer = fs.readFileSync(path.join(root, "lib/orb/orb-renderer.ts"), "utf8");
    const presets = fs.readFileSync(path.join(root, "lib/orb/presets.ts"), "utf8");
    expect(component).toContain("orb-runtime-canvas");
    expect(component).toContain("data-testid=\"genesis-orb-webgpu\"");
    expect(renderer).toContain("/orb/effect.wgsl");
    expect(renderer).toContain("webgpu");
    expect(presets).toContain("Ported from lersent001/orb");
    expect(fs.existsSync(path.join(root, "public/orb/effect.wgsl"))).toBe(true);
  });

  it("allows the documented 127.0.0.1 local dev origin to hydrate Orb interactions", () => {
    const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("allowedDevOrigins");
    expect(config).toContain("127.0.0.1");
  });

  it("answers through deterministic fallback without mutating formal Genesis state", async () => {
    const formalCountsBefore = counts(repository);
    const result = await new OrbAssistantService(repository).ask({
      message: "请解释当前 Genesis 状态，不要修改任何数据。",
      currentPath: "/",
      conversation: [],
    });

    expect(result.answer.stateBoundary).toBe("read_only_no_formal_mutation");
    expect(result.answer.answer).toContain("本地受控 Agent 降级");
    expect(result.meta.provider).toBe("demo");
    expect(result.meta.mode).toBe("demo");
    expect(result.meta.contextEvidenceCount).toBeGreaterThanOrEqual(0);
    expect(counts(repository)).toEqual({
      ...formalCountsBefore,
      agentToolAudits: formalCountsBefore.agentToolAudits + (result.answer.agent?.tools.length ?? 0),
      aiUsage: formalCountsBefore.aiUsage + 1,
    });
  });

  it("turns natural-language commands into Action Candidates without formal mutation", async () => {
    const formalCountsBefore = counts(repository);
    const result = await new OrbAssistantService(repository).ask({
      message: "帮我安排今晚学习计算机网络",
      currentPath: "/today",
      clientRequestId: crypto.randomUUID(),
      conversation: [],
    });

    expect(result.answer.agent?.mode).toBe("controlled_agent");
    expect(result.answer.agent?.intent.id).toBe("create_daily_plan_candidate");
    expect(result.answer.agent?.actionCandidate?.status).toBe("pending");
    expect(result.answer.agent?.actionCandidate?.contextEligible).toBe(false);
    expect(result.answer.agent?.actionCandidate?.formalMutationAllowed).toBe(false);
    expect(result.answer.answer).toContain("Action Candidate");
    expect(counts(repository)).toEqual({
      ...formalCountsBefore,
      agentActionCandidates: formalCountsBefore.agentActionCandidates + 1,
      agentToolAudits: formalCountsBefore.agentToolAudits + 2,
      aiUsage: formalCountsBefore.aiUsage + 1,
    });
  });

  it("keeps read-only Agent tools audited without creating candidates", () => {
    const formalCountsBefore = counts(repository);
    const result = new GenesisAgentController(repository).handle({
      command: "查看我的成长情况",
      currentPath: "/usage",
      clientRequestId: crypto.randomUUID(),
    });

    expect(result.intent.id).toBe("read_growth_status");
    expect(result.actionCandidate).toBeNull();
    expect(result.execution.status).toBe("read_only_completed");
    expect(result.tools.length).toBeGreaterThanOrEqual(2);
    expect(counts(repository)).toEqual({
      ...formalCountsBefore,
      agentToolAudits: formalCountsBefore.agentToolAudits + result.tools.length,
    });
  });

  it("guards Agent Action Candidates from ContextEngine eligibility and direct projection", async () => {
    const result = new GenesisAgentController(repository).handle({
      command: "安排今天学习操作系统",
      currentPath: "/today",
      clientRequestId: crypto.randomUUID(),
    });
    const candidateId = result.actionCandidate?.id;
    expect(candidateId).toBeTruthy();

    expect(() => repository.db.prepare("UPDATE agent_action_candidates SET context_eligible=1 WHERE id=?").run(candidateId)).toThrow(
      /AGENT_ACTION_CANDIDATE_MUST_REMAIN_UNTRUSTED/,
    );
    expect(() => repository.db.prepare("UPDATE agent_action_candidates SET status='executed' WHERE id=?").run(candidateId)).toThrow(
      /AGENT_ACTION_REQUIRES_OWNER_AUTHORIZATION_AND_PROJECTION/,
    );
    const row = repository.db.prepare("SELECT status,context_eligible,formal_mutation_allowed FROM agent_action_candidates WHERE id=?").get(candidateId);
    expect(row).toEqual({ status: "pending", context_eligible: 0, formal_mutation_allowed: 0 });
  });

  it("does not expose pending or rejected candidates to the Orb context path", async () => {
    const now = new Date().toISOString();
    repository.db.prepare(`INSERT INTO memory_candidates
      (id,user_id,generation_request_id,dedupe_key,candidate_json,source_knowledge_ids_json,importance,confidence,provider,model,model_mode,prompt_version,status,created_at,approved_at,rejected_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(crypto.randomUUID(), "genesis-owner", crypto.randomUUID(), "orb-pending", JSON.stringify({ content: "PENDING_SECRET_ORB_MEMORY" }), "[]", 0.3, 0.4, "demo", "local", "demo", "test", "pending", now, null, null);
    repository.db.prepare(`INSERT INTO memory_candidates
      (id,user_id,generation_request_id,dedupe_key,candidate_json,source_knowledge_ids_json,importance,confidence,provider,model,model_mode,prompt_version,status,created_at,approved_at,rejected_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(crypto.randomUUID(), "genesis-owner", crypto.randomUUID(), "orb-rejected", JSON.stringify({ content: "REJECTED_SECRET_ORB_MEMORY" }), "[]", 0.3, 0.4, "demo", "local", "demo", "test", "rejected", now, null, now);

    const result = await new OrbAssistantService(repository).ask({
      message: "总结我的长期记忆。",
      currentPath: "/memory",
      conversation: [],
    });

    expect(result.answer.answer).not.toContain("PENDING_SECRET_ORB_MEMORY");
    expect(result.answer.answer).not.toContain("REJECTED_SECRET_ORB_MEMORY");
    expect(repository.db.prepare("SELECT count(*) AS count FROM user_memory_profile").get()).toEqual({ count: 0 });
  });
});

function counts(repository: ProfileRepository) {
  const value = (table: string) => Number(repository.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
  return {
    missions: value("missions"),
    evidence: value("evidence_items"),
    ability: value("ability_change_snapshots"),
    mastery: value("mastery_decisions"),
    memory: value("user_memory_profile"),
    strategy: value("growth_strategies"),
    dailyPlans: value("daily_plans"),
    profileFacts: value("profile_facts"),
    aiUsage: value("ai_usage_logs"),
    agentActionCandidates: value("agent_action_candidates"),
    agentToolAudits: value("agent_tool_audit_logs"),
  };
}
