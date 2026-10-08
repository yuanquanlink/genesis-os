import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { AgentActionService } from "@/lib/services/agent-action-service";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";
import { UsageService } from "@/lib/services/usage-service";

const USER_ID = "genesis-owner";
const localDay = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value);

describe("Genesis OS v1 beta usage foundation", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-beta-usage-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "beta.db"));
  });

  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  it("derives privacy-minimal beta metrics from the Day 1 to Day 30 lifecycle", async () => {
    const db = repository.db;
    const timestamp = new Date().toISOString();
    for (let offset = 2; offset >= 0; offset -= 1) {
      const date = localDay(new Date(Date.now() - offset * 86_400_000));
      db.prepare("INSERT INTO morning_briefs (id,user_id,brief_date,brief_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), USER_ID, date, "{}", "[]", 0.5, "demo", "local", "demo", "beta-test", timestamp, timestamp);
    }
    for (const status of ["approved", "rejected"] as const) {
      db.prepare("INSERT INTO memory_candidates (id,user_id,generation_request_id,dedupe_key,candidate_json,source_knowledge_ids_json,importance,confidence,provider,model,model_mode,prompt_version,status,created_at,approved_at,rejected_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), USER_ID, crypto.randomUUID(), crypto.randomUUID(), "{}", "[]", 0.5, 0.5, "demo", "local", "demo", "beta-test", status, timestamp, status === "approved" ? timestamp : null, status === "rejected" ? timestamp : null);
    }

    const strategy = await new StrategyService(repository).act({ action: "generate", clientRequestId: crypto.randomUUID() });
    const approvedStrategy = new StrategyApprovalService(repository).approveCandidate(strategy.candidate!.id);
    const actions = new AgentActionService(repository);
    const mission = await actions.generate(crypto.randomUUID());
    const approvedMission = actions.approve(mission.candidate!.id);
    await actions.complete(approvedMission.missionId, "Day 21 bounded Mission completed with a reproducible result.", crypto.randomUUID());
    repository.logAi({ purpose: "genesis_mentor_deep", provider: "demo", model: "local", mode: "demo", inputTokens: 0, outputTokens: 0, latencyMs: 1, success: true });

    const snapshot = new UsageService(repository).snapshot();
    expect(approvedStrategy.strategyId).toBeTruthy();
    expect(snapshot.beta.dailyLoopStreak).toBe(3);
    expect(snapshot.beta.dailyLoopActiveDaysLast30).toBeGreaterThanOrEqual(3);
    expect(snapshot.beta.memoryConfirmationRate).toBe(0.5);
    expect(snapshot.beta.missionCompletionRate).toBe(1);
    expect(snapshot.beta.evidenceTrend.reduce((sum, item) => sum + item.count, 0)).toBeGreaterThan(0);
    expect(snapshot.beta.mentorActiveDaysLast7).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain("Day 21 bounded Mission completed");
  });
});
