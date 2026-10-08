import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";

describe("Genesis Strategic Brain approval loop", () => {
  let directory = "";
  let repository: ProfileRepository;
  let strategy: StrategyService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-strategy-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
    strategy = new StrategyService(repository);
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("generates a pending candidate without creating a formal strategy", async () => {
    const result = await strategy.act({ action: "generate", clientRequestId: crypto.randomUUID() });
    expect(result.duplicate).toBe(false);
    expect(result.candidate!.status).toBe("pending");
    expect(repository.db.prepare("SELECT count(*) count FROM growth_strategies").get()).toMatchObject({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) count FROM strategy_candidates WHERE status='pending'").get()).toMatchObject({ count: 1 });
  });

  it("approves exactly once, retains provenance, and exposes only the approved strategy to ContextEngine", async () => {
    const generated = await strategy.act({ action: "generate", clientRequestId: crypto.randomUUID() });
    const pendingPacket = new ContextEngine(repository).buildPacket({ currentPage: "/mentor", currentTask: "test", currentQuestion: "test", currentChapter: null, currentConversation: [] });
    expect(pendingPacket.strategicContext.currentStrategy).toBeNull();

    const candidate = generated.candidate!;
    const approval = new StrategyApprovalService(repository).approveCandidate(candidate.id);
    const row = repository.db.prepare("SELECT source_candidate_id FROM growth_strategies WHERE id=?").get(approval.strategyId) as { source_candidate_id: string };
    expect(row.source_candidate_id).toBe(candidate.id);
    expect(repository.db.prepare("SELECT status,approved_by FROM strategy_candidates WHERE id=?").get(candidate.id)).toMatchObject({ status: "approved", approved_by: "genesis-owner" });
    const packet = new ContextEngine(repository).buildPacket({ currentPage: "/mentor", currentTask: "test", currentQuestion: "test", currentChapter: null, currentConversation: [] });
    expect(packet.strategicContext.currentStrategy?.value).toContain("Project");
    expect(() => new StrategyApprovalService(repository).approveCandidate(candidate.id)).toThrow("STRATEGY_CANDIDATE_ALREADY_DECIDED");
    expect(repository.db.prepare("SELECT count(*) count FROM audit_logs WHERE action='strategy.candidate_approved'").get()).toMatchObject({ count: 1 });
  });

  it("rejects a pending candidate with a reason and never creates a formal strategy", async () => {
    const generated = await strategy.act({ action: "generate", clientRequestId: crypto.randomUUID() });
    const candidate = generated.candidate!;
    const rejected = new StrategyApprovalService(repository).rejectCandidate(candidate.id, "Not aligned with current deadline.");
    expect(rejected.rejectReason).toContain("deadline");
    expect(repository.db.prepare("SELECT status,reject_reason FROM strategy_candidates WHERE id=?").get(candidate.id)).toMatchObject({ status: "rejected", reject_reason: "Not aligned with current deadline." });
    expect(repository.db.prepare("SELECT count(*) count FROM growth_strategies").get()).toMatchObject({ count: 0 });
  });

  it("returns an existing pending candidate on repeat generation and lowers confidence with little evidence", async () => {
    const first = await strategy.act({ action: "generate", clientRequestId: crypto.randomUUID() });
    const second = await strategy.act({ action: "generate", clientRequestId: crypto.randomUUID() });
    expect(second.duplicate).toBe(true);
    expect(second.candidate!.id).toBe(first.candidate!.id);
    expect(first.candidate!.confidence).toBeLessThanOrEqual(0.6);
  });

  it("falls back to a Demo candidate when the configured provider fails", async () => {
    const configured = vi.spyOn(ContextEngine.prototype, "isRealConfigured").mockReturnValue(true);
    const complete = vi.spyOn(ContextEngine.prototype, "complete").mockRejectedValue(new Error("provider unavailable"));
    try {
      const generated = await strategy.act({ action: "generate", clientRequestId: crypto.randomUUID() });
      const row = repository.db.prepare("SELECT model_mode,fallback_reason FROM strategy_candidates WHERE id=?").get(generated.candidate!.id) as { model_mode: string; fallback_reason: string };
      expect(row).toMatchObject({ model_mode: "demo", fallback_reason: "provider_failed" });
    } finally {
      complete.mockRestore();
      configured.mockRestore();
    }
  });

  it("database guard rejects a formal strategy without an approved candidate", () => {
    expect(() => repository.db.prepare("INSERT INTO growth_strategies (id,user_id,period_key,client_request_id,diagnosis_json,strategies_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,fallback_reason,created_at,source_candidate_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), "genesis-owner", "test", crypto.randomUUID(), "{}", "{}", "[]", 0.2, "demo", "local", "demo", "test", null, new Date().toISOString(), null)).toThrow("STRATEGY_APPROVAL_REQUIRED");
  });
});
