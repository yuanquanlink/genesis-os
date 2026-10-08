import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { DailyLifeService } from "@/lib/services/daily-life-service";
import { ProfileService } from "@/lib/services/profile-service";
import { StrategyApprovalService } from "@/lib/services/strategy-approval-service";
import { StrategyService } from "@/lib/services/strategy-service";

describe("Daily Life Loop and self-input evidence boundary", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-daily-life-"));
    process.env.DEEPSEEK_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });
  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  it("syncs learning, project, competition, reading, idea, mood, and stage goals as evidence without changing Ability", async () => {
    const service = new ProfileService(repository);
    const records = [
      ["learning", ["learning"], "Completed a Python practice exercise and recorded the test result."],
      ["project", ["project"], "Implemented an API endpoint, added validation, and saved a failing test case."],
      ["experience", ["competition"], "Participated in a programming competition and recorded judge feedback."],
      ["learning", ["reading"], "Read a chapter about database transactions and wrote a short note."],
      ["reflection", ["idea"], "Idea: reduce the current project scope before adding another integration."],
      ["state", ["mood"], "Mood was distracted today, so I reduced the task into a smaller deliverable."],
      ["goal", ["stage-goal"], "Stage goal: finish one verified backend project before starting a new framework."],
    ] as const;
    for (const [category, tags, content] of records) {
      await service.submitEntry({ content, category, tags, importance: 3, occurredAt: new Date().toISOString(), allowAi: false, clientRequestId: crypto.randomUUID(), dataKind: "user" });
    }
    const rows = repository.db.prepare("SELECT evidence_type,source_id FROM evidence_items WHERE source_type='self_entry' ORDER BY created_at").all() as Array<{ evidence_type: string; source_id: string }>;
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.evidence_type)).toEqual(expect.arrayContaining(["learning", "project", "competition", "self_reflection"]));
    expect(repository.db.prepare("SELECT count(*) count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
  });

  it("derives a daily life snapshot from approved strategy, activity, and evidence without mutating formal ability", async () => {
    const strategy = new StrategyService(repository);
    const candidate = (await strategy.act({ action: "generate", clientRequestId: crypto.randomUUID() })).candidate!;
    new StrategyApprovalService(repository).approveCandidate(candidate.id);
    await new ProfileService(repository).submitEntry({ content: "Completed a documented project task and saved the test output for review.", category: "project", tags: ["project"], importance: 4, occurredAt: new Date().toISOString(), allowAi: false, clientRequestId: crypto.randomUUID(), dataKind: "user" });
    const snapshot = new DailyLifeService(repository).snapshot();
    expect(snapshot.morning.currentStrategy).not.toContain("No approved strategy");
    expect(snapshot.evening.completed).toHaveLength(1);
    expect(snapshot.evening.newEvidence.some((item) => item.ability === "Engineering delivery")).toBe(true);
    expect(repository.db.prepare("SELECT count(*) count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
  });
});
