import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEngine } from "@/lib/ai/context-engine";
import { ProfileRepository } from "@/lib/db/repository";
import { BetaFeedbackService } from "@/lib/services/beta-feedback-service";
import { UsageService } from "@/lib/services/usage-service";

const USER_ID = "genesis-owner";
const localDay = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value);

describe("Genesis v1 Beta observation", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-beta-observation-"));
    repository = new ProfileRepository(path.join(directory, "observation.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("derives a seven-day local observation window and keeps feedback out of formal data and Context", () => {
    const timestamp = new Date().toISOString();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = localDay(new Date(Date.now() - offset * 86_400_000));
      repository.db.prepare("INSERT INTO morning_briefs (id,user_id,brief_date,brief_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), USER_ID, date, "{}", "[]", 0.4, "demo", "local", "demo", "beta-observation-test", timestamp, timestamp);
    }

    const before = {
      abilities: repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get(),
      evidence: repository.db.prepare("SELECT count(*) AS count FROM evidence_items").get(),
      strategies: repository.db.prepare("SELECT count(*) AS count FROM growth_strategies").get(),
      memory: repository.db.prepare("SELECT count(*) AS count FROM user_memory_profile").get(),
    };
    const feedback = new BetaFeedbackService(repository);
    const clientRequestId = crypto.randomUUID();
    const saved = feedback.submit({ feedbackType: "difficulty", content: "The Day 3 Daily Plan confirmation was hard to find on a narrow screen.", clientRequestId });
    const duplicate = feedback.submit({ feedbackType: "difficulty", content: "The Day 3 Daily Plan confirmation was hard to find on a narrow screen.", clientRequestId });
    expect(() => feedback.transition({ id: saved.feedbackId, status: "resolved" })).toThrow("cannot move backward or skip review");
    const reviewed = feedback.transition({ id: saved.feedbackId, status: "reviewed" });
    const resolved = feedback.transition({ id: saved.feedbackId, status: "resolved" });
    const usage = new UsageService(repository).snapshot();
    const context = new ContextEngine(repository).buildPacket({ currentPage: "/usage", currentTask: "Beta observation", currentQuestion: "What data is available?", currentChapter: null, currentConversation: [] });

    expect(saved.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(reviewed.duplicate).toBe(false);
    expect(resolved.duplicate).toBe(false);
    expect(feedback.snapshot().feedback).toEqual([expect.objectContaining({ status: "resolved", reviewedAt: expect.any(String), resolvedAt: expect.any(String) })]);
    expect(usage.beta.betaRunDays).toBeGreaterThanOrEqual(7);
    expect(usage.beta.dailyLoopStreak).toBe(7);
    expect(JSON.stringify(usage)).not.toContain("Day 3 Daily Plan confirmation");
    expect(JSON.stringify(context)).not.toContain("Day 3 Daily Plan confirmation");
    expect({
      abilities: repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get(),
      evidence: repository.db.prepare("SELECT count(*) AS count FROM evidence_items").get(),
      strategies: repository.db.prepare("SELECT count(*) AS count FROM growth_strategies").get(),
      memory: repository.db.prepare("SELECT count(*) AS count FROM user_memory_profile").get(),
    }).toEqual(before);
  });
});
