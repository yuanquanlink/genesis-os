import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { UsageService } from "@/lib/services/usage-service";

const USER_ID = "genesis-owner";
const localDay = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value);

describe("Genesis v1 Beta refinement", () => {
  let directory = "";
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-beta-refinement-"));
    repository = new ProfileRepository(path.join(directory, "refinement.db"));
  });

  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  it("derives bounded 7 and 30 day trends from persisted records without retaining raw content in analytics", () => {
    const db = repository.db;
    const now = new Date().toISOString();
    const knowledgeId = crypto.randomUUID();
    db.prepare("INSERT INTO knowledge_items (id,user_id,type,content,source,tags_json,data_kind,content_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(knowledgeId, USER_ID, "note", "Refinement fixture source only.", "test", "[]", "user", crypto.randomUUID(), now, now);
    for (let offset = 29; offset >= 0; offset -= 1) {
      const occurredAt = new Date(Date.now() - offset * 86_400_000).toISOString();
      const date = localDay(new Date(occurredAt));
      db.prepare("INSERT INTO morning_briefs (id,user_id,brief_date,brief_json,source_refs_json,confidence,provider,model,model_mode,prompt_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), USER_ID, date, "{}", "[]", 0.5, "demo", "local", "demo", "refinement-test", occurredAt, occurredAt);
      for (let sample = 0; sample < 8; sample += 1) {
        db.prepare("INSERT INTO evidence_items (id,user_id,evidence_type,source_type,source_id,source,description,related_ability,content_hash,data_kind,captured_at,verification_status,confidence,impact,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(crypto.randomUUID(), USER_ID, "project", "fixture", crypto.randomUUID(), "refinement test", `Private fixture evidence ${offset}-${sample}`, "Engineering", crypto.randomUUID(), "user", occurredAt, "verified", 0.5, 0.4, occurredAt, occurredAt);
      }
    }
    for (let index = 0; index < 40; index += 1) {
      const payload = { memoryType: "learning_pattern", content: `Use bounded delivery loop ${index} before opening unrelated work.`, reasoning: "This test candidate must remain pending until a user makes an explicit decision.", sourceKnowledgeIds: [knowledgeId], importance: 0.5, confidence: 0.5 };
      db.prepare("INSERT INTO memory_candidates (id,user_id,generation_request_id,dedupe_key,candidate_json,source_knowledge_ids_json,importance,confidence,provider,model,model_mode,prompt_version,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), USER_ID, crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(payload), JSON.stringify([knowledgeId]), 0.5, 0.5, "demo", "local", "demo", "refinement-test", "pending", now);
    }

    const snapshot = new UsageService(repository).snapshot();
    expect(snapshot.days).toHaveLength(7);
    expect(snapshot.days30).toHaveLength(30);
    expect(snapshot.beta.dailyLoopActiveDaysLast30).toBe(30);
    expect(snapshot.beta.evidenceAddedLast30).toBe(240);
    expect(snapshot.beta.memoryCandidates).toBe(40);
    expect(snapshot.beta.memoryConfirmationRate).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain("Private fixture evidence");
  });
});
