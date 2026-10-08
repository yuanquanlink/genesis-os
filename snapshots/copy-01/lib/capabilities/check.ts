import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  capabilityStatusDefinitions,
  GENESIS_PHASE_0_BASELINE,
  GENESIS_REQUIRED_APPROVAL_TRIGGERS,
  GENESIS_REQUIRED_CAPABILITY_IDS,
  GENESIS_REQUIRED_NAVIGATION_SECTIONS,
  genesisCapabilityRegistry,
  type GenesisCapabilityStatus,
} from "@/lib/domain/genesis-capabilities";
import { ProfileRepository } from "@/lib/db/repository";
import { sectionKeys } from "@/lib/navigation";

export type CapabilityCheckReport = {
  git_head: string;
  capability_registry_count: number;
  status_distribution: Record<GenesisCapabilityStatus, number>;
  api_route_files: number;
  product_regions: number;
  page_states: number;
  migration_count: number;
  required_table_count: number;
  required_trigger_count: number;
  unit_test_files: number;
  e2e_spec_files: number;
  contract_violations: string[];
};

function filesBelow(root: string, directory: string, predicate: (name: string) => boolean) {
  const base = path.join(root, directory);
  if (!fs.existsSync(base)) return [];
  const output: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (predicate(entry.name)) output.push(path.relative(root, target).replace(/\\/g, "/"));
    }
  };
  visit(base);
  return output.sort();
}
function gitHead(root: string) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  return result.status === 0 ? result.stdout.trim() : "unavailable";
}

function inspectMigratedSchema(root: string) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-capability-schema-"));
  const dbPath = path.join(temporaryRoot, "contract.db");
  let repository: ProfileRepository | undefined;
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    repository = new ProfileRepository(dbPath);
    const tables = new Set(
      (repository.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name),
    );
    const triggers = new Set(
      (repository.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as Array<{ name: string }>).map((row) => row.name),
    );
    return { tables, triggers };
  } finally {
    repository?.close();
    process.chdir(previousCwd);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function statusDistribution() {
  const distribution = Object.fromEntries(
    Object.keys(capabilityStatusDefinitions).map((status) => [status, 0]),
  ) as Record<GenesisCapabilityStatus, number>;
  for (const item of genesisCapabilityRegistry) distribution[item.current_status] += 1;
  return distribution;
}

export function runCapabilityCheck(root = process.cwd()): CapabilityCheckReport {
  const violations: string[] = [];
  const apiRoutes = filesBelow(root, "app/api", (name) => name === "route.ts");
  const unitTests = filesBelow(root, "tests", (name) => name.endsWith(".test.ts"));
  const e2eSpecs = filesBelow(root, "e2e", (name) => name.endsWith(".spec.ts"));
  const migrationFiles = filesBelow(root, "lib/db/migrations", (name) => /^\d{4}_.+\.sql$/.test(name));
  const migrationNumbers = migrationFiles.map((name) => Number(path.basename(name).slice(0, 4))).sort((a, b) => a - b);
  const productRegions = sectionKeys.length + 1;
  const pageStates = productRegions + (fs.existsSync(path.join(root, "app/strategy/[id]/page.tsx")) ? 1 : 0);

  if (apiRoutes.length < GENESIS_PHASE_0_BASELINE.minimum_api_route_files)
    violations.push(`API route files regressed: ${apiRoutes.length} < ${GENESIS_PHASE_0_BASELINE.minimum_api_route_files}`);
  if (productRegions < GENESIS_PHASE_0_BASELINE.minimum_product_regions)
    violations.push(`Product regions regressed: ${productRegions} < ${GENESIS_PHASE_0_BASELINE.minimum_product_regions}`);
  if (pageStates < GENESIS_PHASE_0_BASELINE.minimum_page_states)
    violations.push(`Page states regressed: ${pageStates} < ${GENESIS_PHASE_0_BASELINE.minimum_page_states}`);
  if (migrationFiles.length < GENESIS_PHASE_0_BASELINE.minimum_migrations)
    violations.push(`Migrations regressed: ${migrationFiles.length} < ${GENESIS_PHASE_0_BASELINE.minimum_migrations}`);
  if (unitTests.length < GENESIS_PHASE_0_BASELINE.minimum_unit_test_files)
    violations.push(`Unit test files regressed: ${unitTests.length} < ${GENESIS_PHASE_0_BASELINE.minimum_unit_test_files}`);
  if (e2eSpecs.length < GENESIS_PHASE_0_BASELINE.minimum_e2e_spec_files)
    violations.push(`E2E spec files regressed: ${e2eSpecs.length} < ${GENESIS_PHASE_0_BASELINE.minimum_e2e_spec_files}`);

  for (let index = 0; index < migrationNumbers.length; index += 1) {
    const expected = index + 1;
    if (migrationNumbers[index] !== expected) {
      violations.push(`Migration lineage is not continuous at ${String(expected).padStart(4, "0")}`);
      break;
    }
  }

  const ids = genesisCapabilityRegistry.map((item) => item.capability_id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) violations.push("Capability Registry contains duplicate capability_id values");
  for (const requiredId of GENESIS_REQUIRED_CAPABILITY_IDS) {
    if (!idSet.has(requiredId)) violations.push(`Required capability missing: ${requiredId}`);
  }
  for (const capability of genesisCapabilityRegistry) {
    if (capability.can_be_removed !== false) violations.push(`Capability may not be removable: ${capability.capability_id}`);
    if (!(capability.current_status in capabilityStatusDefinitions))
      violations.push(`Capability has invalid status: ${capability.capability_id}`);
    const requiredPaths = [...capability.required_surfaces, ...capability.required_routes, ...capability.required_tests];
    for (const requiredPath of requiredPaths) {
      if (!fs.existsSync(path.join(root, requiredPath)))
        violations.push(`${capability.capability_id} missing required path: ${requiredPath}`);
    }
  }

  for (const section of GENESIS_REQUIRED_NAVIGATION_SECTIONS) {
    if (!(sectionKeys as readonly string[]).includes(section)) violations.push(`Required navigation section missing: ${section}`);
  }
  for (const page of ["app/page.tsx", "app/[section]/page.tsx", "app/strategy/[id]/page.tsx"]) {
    if (!fs.existsSync(path.join(root, page))) violations.push(`Required page entry missing: ${page}`);
  }

  const e2eOrchestrator = fs.readFileSync(path.join(root, "scripts/e2e.ts"), "utf8");
  for (const spec of e2eSpecs) {
    if (!e2eOrchestrator.includes(`"${spec}"`)) violations.push(`E2E spec is not orchestrated by npm run test:e2e: ${spec}`);
  }

  const forbiddenTestControl = /\b(?:describe|it|test)\.(?:skip|todo|only)\b/;
  for (const testFile of [...unitTests, ...e2eSpecs]) {
    if (forbiddenTestControl.test(fs.readFileSync(path.join(root, testFile), "utf8")))
      violations.push(`Forbidden skip/todo/only in test: ${testFile}`);
  }

  const requiredTables = new Set(genesisCapabilityRegistry.flatMap((item) => [...item.required_tables]));
  const schema = inspectMigratedSchema(root);
  for (const table of requiredTables) {
    if (!schema.tables.has(table)) violations.push(`Required SQLite table missing after migrations: ${table}`);
  }
  for (const trigger of GENESIS_REQUIRED_APPROVAL_TRIGGERS) {
    if (!schema.triggers.has(trigger)) violations.push(`Required approval trigger missing after migrations: ${trigger}`);
  }

  return {
    git_head: gitHead(root),
    capability_registry_count: genesisCapabilityRegistry.length,
    status_distribution: statusDistribution(),
    api_route_files: apiRoutes.length,
    product_regions: productRegions,
    page_states: pageStates,
    migration_count: migrationFiles.length,
    required_table_count: requiredTables.size,
    required_trigger_count: GENESIS_REQUIRED_APPROVAL_TRIGGERS.length,
    unit_test_files: unitTests.length,
    e2e_spec_files: e2eSpecs.length,
    contract_violations: violations,
  };
}
