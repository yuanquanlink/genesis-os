import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cognitionModuleIdSchema } from "@/lib/domain/cognition";
import {
  capabilityStatusDefinitions,
  GENESIS_REQUIRED_CAPABILITY_IDS,
  genesisCapabilityRegistry,
} from "@/lib/domain/genesis-capabilities";
import { runCapabilityCheck } from "@/lib/capabilities/check";

describe("Genesis Capability Constitution", () => {
  it("keeps every required capability versioned, non-removable and honestly classified", () => {
    expect(genesisCapabilityRegistry).toHaveLength(GENESIS_REQUIRED_CAPABILITY_IDS.length);
    expect(new Set(genesisCapabilityRegistry.map((item) => item.capability_id)).size).toBe(GENESIS_REQUIRED_CAPABILITY_IDS.length);
    expect(genesisCapabilityRegistry.map((item) => item.capability_id)).toEqual(
      expect.arrayContaining([...GENESIS_REQUIRED_CAPABILITY_IDS]),
    );
    expect(genesisCapabilityRegistry.every((item) => item.can_be_removed === false)).toBe(true);
    expect(Object.keys(capabilityStatusDefinitions)).toEqual([
      "defined",
      "scaffolded",
      "implemented",
      "local_loop_verified",
      "real_user_verified",
      "production_verified",
    ]);
    expect(genesisCapabilityRegistry.some((item) => item.current_status === "real_user_verified")).toBe(false);
    expect(genesisCapabilityRegistry.some((item) => item.current_status === "production_verified")).toBe(false);
  });

  it("checks real navigation, files, migrations, isolated SQLite schema, guards and test orchestration", () => {
    const report = runCapabilityCheck();
    expect(report.contract_violations).toEqual([]);
    expect(report.api_route_files).toBeGreaterThanOrEqual(55);
    expect(report.product_regions).toBeGreaterThanOrEqual(21);
    expect(report.page_states).toBeGreaterThanOrEqual(22);
    expect(report.migration_count).toBeGreaterThanOrEqual(33);
    expect(report.required_table_count).toBeGreaterThan(40);
    expect(report.required_trigger_count).toBeGreaterThanOrEqual(4);
    expect(report.unit_test_files).toBeGreaterThan(34);
    expect(report.e2e_spec_files).toBeGreaterThanOrEqual(18);
  });

  it("preserves four separately addressable cognition modules", () => {
    for (const moduleId of ["thinking_model", "book_intelligence", "business_learning", "movie_reflection"]) {
      expect(cognitionModuleIdSchema.safeParse(moduleId).success).toBe(true);
    }
  });

  it("keeps the Strategy approval route behind the shared trusted-origin JSON guard", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/strategy/candidates/[id]/approve/route.ts"), "utf8");
    expect(route).toContain('import { readTrustedJson } from "@/lib/http/request"');
    expect(route).toContain("await readTrustedJson(request)");
  });
});
