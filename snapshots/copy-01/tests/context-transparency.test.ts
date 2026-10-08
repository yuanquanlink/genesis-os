import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { ContextTransparencyService } from "@/lib/services/context-transparency-service";

describe("Approved Context transparency inspector", () => {
  let directory: string;
  let repository: ProfileRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-context-transparency-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("reports all Context purposes and permanent exclusions without inventing visible data", () => {
    const snapshot = new ContextTransparencyService(repository, () => new Date("2026-08-24T08:00:00.000Z")).snapshot();
    expect(snapshot.purposes.map((item) => item.purpose)).toEqual([
      "daily_operation",
      "mentor",
      "learning",
      "strategy",
      "reflection",
      "research",
    ]);
    expect(snapshot.totals).toEqual({ visible: 0, excluded: 0, purposes: 6 });
    expect(snapshot.policyExclusions.map((item) => item.label)).toContain("待确认与已拒绝候选");
    expect(snapshot.boundary).toContain("只读检查视图");
  });

  it("does not expose or mutate a Planning Candidate", () => {
    const now = "2026-08-24T08:00:00.000Z";
    repository.db.prepare(`INSERT INTO planning_candidates
      (id,owner_id,client_request_id,title,description,source,category,status,approval_state,provenance_json,content_hash,context_eligible,formal_mutation_allowed,created_at,updated_at)
      VALUES ('candidate-private','genesis-owner','candidate-request','尚未确认的未来计划','这条原始候选不得进入 ContextEngine。','owner_input','future_goal','captured','pending','{}',?,0,0,?,?)`)
      .run("a".repeat(64), now, now);
    const before = repository.db.prepare("SELECT * FROM planning_candidates WHERE id='candidate-private'").get();

    const snapshot = new ContextTransparencyService(repository, () => new Date(now)).snapshot();
    const after = repository.db.prepare("SELECT * FROM planning_candidates WHERE id='candidate-private'").get();

    expect(snapshot.purposes.flatMap((item) => [...item.visible, ...item.excluded])).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("尚未确认的未来计划");
    expect(after).toEqual(before);
  });
});
