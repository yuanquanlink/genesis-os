import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BetaFeedbackService } from "@/lib/services/beta-feedback-service";
import { BetaValidationService } from "@/lib/services/beta-validation-service";
import { ProfileRepository } from "@/lib/db/repository";

const USER_ID = "genesis-owner";
const localDay = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value);

describe("Genesis v1 Beta long-term validation", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-beta-long-term-"));
    repository = new ProfileRepository(path.join(directory, "validation.db"));
  });

  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  it("captures an idempotent daily fact log, summarizes a 30-day cycle, and keeps private feedback out of the snapshot", () => {
    const db = repository.db;
    const timestamp = new Date().toISOString();
    const today = localDay(new Date());
    db.prepare("INSERT INTO morning_briefs (id,user_id,brief_date,brief_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), USER_ID, today, "{}", "[]", 0.5, "demo", "local", "demo", "long-term-test", timestamp, timestamp);
    db.prepare("INSERT INTO evidence_items (id,user_id,evidence_type,source_type,source_id,source,description,related_ability,content_hash,data_kind,captured_at,verification_status,confidence,impact,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), USER_ID, "project", "fixture", crypto.randomUUID(), "long-term test", "Private validation evidence must never appear in local metrics.", "Engineering", crypto.randomUUID(), "user", timestamp, "verified", 0.7, 0.5, timestamp, timestamp);
    new BetaFeedbackService(repository).submit({ feedbackType: "difficulty", content: "Private feedback fixture stays outside the validation summary content.", clientRequestId: crypto.randomUUID() });
    for (let offset = 29; offset >= 1; offset -= 1) {
      const date = localDay(new Date(Date.now() - offset * 86_400_000));
      db.prepare("INSERT INTO beta_validation_log (id,user_id,log_date,daily_loop_status,mission_status,mission_completed_count,evidence_added_count,memory_confirmed_count,mentor_call_count,feedback_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), USER_ID, date, offset % 2 ? "reflected" : "not_started", "none", 0, 0, 0, 0, 0, timestamp, timestamp);
    }
    const formalBefore = {
      strategies: db.prepare("SELECT count(*) AS count FROM growth_strategies").get(),
      memories: db.prepare("SELECT count(*) AS count FROM user_memory_profile").get(),
      evidence: db.prepare("SELECT count(*) AS count FROM evidence_items").get(),
    };
    const service = new BetaValidationService(repository);
    const first = service.capture({ action: "capture", logDate: today });
    const repeated = service.capture({ action: "capture", logDate: today });

    expect(first.duplicate).toBe(false);
    expect(repeated.duplicate).toBe(true);
    expect(repeated.snapshot.summary.recordedDays).toBe(30);
    expect(repeated.snapshot.logs[0]).toEqual(expect.objectContaining({ date: today, dailyLoopStatus: "in_progress", missionStatus: "none", evidenceAddedCount: 1, feedbackCount: 1 }));
    expect(repeated.snapshot.health.loopConsistency).not.toBeNull();
    expect(repeated.snapshot.health.evidenceQuality).toBe(1);
    expect(JSON.stringify(repeated.snapshot)).not.toContain("Private validation evidence");
    expect(JSON.stringify(repeated.snapshot)).not.toContain("Private feedback fixture");
    expect({
      strategies: db.prepare("SELECT count(*) AS count FROM growth_strategies").get(),
      memories: db.prepare("SELECT count(*) AS count FROM user_memory_profile").get(),
      evidence: db.prepare("SELECT count(*) AS count FROM evidence_items").get(),
    }).toEqual(formalBefore);
    expect(() => service.capture({ action: "capture", logDate: "2999-01-01" })).toThrow("BETA_VALIDATION_FUTURE_DATE");
  });
});
