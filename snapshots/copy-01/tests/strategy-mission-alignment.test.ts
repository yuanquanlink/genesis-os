import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { StrategyMissionAlignmentService } from "@/lib/services/strategy-mission-alignment-service";
import { IntelligenceReviewReadService } from "@/lib/services/intelligence-review-read-service";

describe("Phase 4 Step 7 Strategy to Mission Alignment", () => {
  let directory = "";
  let repository: ProfileRepository;
  let strategyId = "";
  let missionCandidateId = "";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-alignment-"));
    repository = new ProfileRepository(path.join(directory, "test.db"));
    const timestamp = "2026-08-11T08:00:00.000Z";
    const strategyCandidateId = randomUUID();
    strategyId = randomUUID();
    const strategy = { currentPosition: "learning engineering", targetPosition: "engineering delivery", opportunity: "engineering project", risk: "scope", priorityRanking: ["engineering", "testing"], abilityGaps: [{ name: "engineering", currentLevel: 0, targetLevel: 3, action: "build project", verification: "tested artifact", evidenceIds: ["EV-1"] }], plans: { d7: { goal: "engineering project", why: "delivery", evidenceIds: ["EV-1"], actions: ["build"], avoid: ["drift"], successMetric: "artifact", risk: "scope" }, d30: { goal: "engineering delivery", why: "delivery", evidenceIds: ["EV-1"], actions: ["ship"], avoid: ["drift"], successMetric: "ship", risk: "scope" }, d90: { goal: "engineering delivery", why: "delivery", evidenceIds: ["EV-1"], actions: ["ship"], avoid: ["drift"], successMetric: "ship", risk: "scope" }, d365: { goal: "engineering delivery", why: "delivery", evidenceIds: ["EV-1"], actions: ["ship"], avoid: ["drift"], successMetric: "ship", risk: "scope" } }, confidence: .6, limitations: ["candidate"] };
    repository.db.prepare("INSERT INTO strategy_candidates (id,user_id,client_request_id,generated_strategy_json,reasoning,evidence_ids_json,confidence,status,created_at,provider,model,model_mode,prompt_version) VALUES (?,?,?,?,?,?,?,'approved',?,'demo','local','demo','test')")
      .run(strategyCandidateId, "genesis-owner", randomUUID(), JSON.stringify(strategy), "approved fixture", JSON.stringify(["EV-1"]), .6, timestamp);
    repository.db.prepare("INSERT INTO growth_strategies (id,user_id,period_key,client_request_id,diagnosis_json,strategies_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,created_at,source_candidate_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(strategyId, "genesis-owner", "2026-W32", randomUUID(), JSON.stringify({ currentPosition: "learning engineering", targetPosition: "engineering delivery" }), JSON.stringify(strategy.plans), JSON.stringify(["EV-1"]), .6, "demo", "local", "demo", "test", timestamp, strategyCandidateId);
    missionCandidateId = randomUUID();
    const mission = { title: "Engineering project delivery", description: "Build and test one engineering project.", sourceGoal: "engineering delivery", priority: "high", deadline: "2026-08-20T08:00:00.000Z", evidenceRequirement: "tested artifact", dailyTasks: ["build project"], evidenceIds: ["EV-1"], confidence: .5, limitations: ["candidate"] };
    repository.db.prepare("INSERT INTO mission_candidates (id,user_id,strategy_id,client_request_id,mission_json,evidence_ids_json,confidence,provider,model,model_mode,prompt_version,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'candidate',?)")
      .run(missionCandidateId, "genesis-owner", strategyId, randomUUID(), JSON.stringify(mission), JSON.stringify(["EV-1"]), .5, "demo", "local", "demo", "test", timestamp);
  });

  afterEach(() => { repository.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  it("creates an untrusted alignment Candidate without changing Strategy or Mission", () => {
    const service = new StrategyMissionAlignmentService(repository);
    const before = repository.db.prepare("SELECT strategies_json FROM growth_strategies WHERE id=?").get(strategyId);
    const result = service.create({ strategyId, missionCandidateId, clientRequestId: randomUUID() });
    expect(result.candidate).toMatchObject({ status: "pending", trustClass: "untrusted", contextEligible: false, alignmentState: "strongly_aligned" });
    expect(repository.db.prepare("SELECT strategies_json FROM growth_strategies WHERE id=?").get(strategyId)).toEqual(before);
    expect(repository.db.prepare("SELECT count(*) AS count FROM missions").get()).toEqual({ count: 0 });
    const envelope = new IntelligenceReviewReadService(repository).get(`strategy_mission_alignment:${(result.candidate as { id: string }).id}`);
    expect(envelope).toMatchObject({ contextEligible: false, trustClass: "untrusted", allowedTargets: [] });
  });

  it("rejects an unapproved Strategy", () => {
    repository.db.prepare("UPDATE strategy_candidates SET status='pending' WHERE id=(SELECT source_candidate_id FROM growth_strategies WHERE id=?)").run(strategyId);
    expect(() => new StrategyMissionAlignmentService(repository).create({ strategyId, missionCandidateId, clientRequestId: randomUUID() })).toThrow("ALIGNMENT_APPROVED_STRATEGY_REQUIRED");
  });

  it("keeps missing overlap explicit and rejects stale Strategy or Mission sources", () => {
    const service = new StrategyMissionAlignmentService(repository);
    repository.db.prepare("UPDATE mission_candidates SET mission_json=? WHERE id=?").run(JSON.stringify({ title: "Unrelated cooking", description: "A separate unrelated activity.", sourceGoal: "unrelated", priority: "low", deadline: "2026-08-20T08:00:00.000Z", evidenceRequirement: "note", dailyTasks: ["cook"], evidenceIds: ["EV-1"], confidence: .3, limitations: ["candidate"] }), missionCandidateId);
    const result = service.create({ strategyId, missionCandidateId, clientRequestId: randomUUID() });
    expect(result.candidate).toMatchObject({ alignmentState: "conflicting" });
    const id = (result.candidate as { id: string }).id;
    repository.db.prepare("UPDATE growth_strategies SET strategies_json=? WHERE id=?").run("{\"changed\":true}", strategyId);
    expect(() => service.assertFresh(id)).toThrow("ALIGNMENT_STALE_STRATEGY");
  });

  it("returns unclear when required alignment factors are missing", () => {
    repository.db.prepare("UPDATE mission_candidates SET mission_json=? WHERE id=?").run(JSON.stringify({ title: "Cooking practice", description: "Prepare a meal and record notes.", sourceGoal: "prepare a meal", priority: "low", deadline: "2026-08-20T08:00:00.000Z", evidenceRequirement: "written note", dailyTasks: ["prepare meal"], evidenceIds: ["EV-1"], confidence: .3, limitations: ["candidate"] }), missionCandidateId);
    const result = new StrategyMissionAlignmentService(repository).create({ strategyId, missionCandidateId, clientRequestId: randomUUID() });
    expect(result.candidate).toMatchObject({ alignmentState: "unclear", contextEligible: false });
    expect((result.candidate as { limitations: string[] }).limitations.join(" ")).toContain("No reliable shared factor");
  });

  it("rejects a stale Mission version without mutating formal domains", () => {
    const service = new StrategyMissionAlignmentService(repository);
    const result = service.create({ strategyId, missionCandidateId, clientRequestId: randomUUID() });
    const id = (result.candidate as { id: string }).id;
    repository.db.prepare("UPDATE mission_candidates SET mission_json=? WHERE id=?").run(JSON.stringify({ title: "Changed mission source", description: "The source changed after review preview.", sourceGoal: "changed source", priority: "normal", deadline: "2026-08-20T08:00:00.000Z", evidenceRequirement: "changed note", dailyTasks: ["review change"], evidenceIds: ["EV-1"], confidence: .3, limitations: ["changed"] }), missionCandidateId);
    expect(() => service.assertFresh(id)).toThrow("ALIGNMENT_STALE_MISSION");
    expect(repository.db.prepare("SELECT count(*) AS count FROM user_memory_profile").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM mastery_decisions").get()).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT count(*) AS count FROM learning_goals").get()).toEqual({ count: 0 });
  });
});
