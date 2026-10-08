import { runCapabilityCheck } from "../lib/capabilities/check";

const report = runCapabilityCheck();

console.log("Genesis Capability Contract Check");
console.log(`Git HEAD: ${report.git_head}`);
console.log(`Capability Registry count: ${report.capability_registry_count}`);
console.log(`Capability status distribution: ${JSON.stringify(report.status_distribution)}`);
console.log(`API route files: ${report.api_route_files}`);
console.log(`Product regions: ${report.product_regions}`);
console.log(`Page states: ${report.page_states}`);
console.log(`Migrations: ${report.migration_count}`);
console.log(`Required tables: ${report.required_table_count}`);
console.log(`Required approval triggers: ${report.required_trigger_count}`);
console.log(`Unit test files detected: ${report.unit_test_files}`);
console.log(`E2E specs detected: ${report.e2e_spec_files}`);
console.log(`Contract violations: ${report.contract_violations.length}`);
for (const violation of report.contract_violations) console.error(`VIOLATION ${violation}`);

if (report.contract_violations.length) process.exitCode = 1;
else console.log("PASS Genesis capability baseline and required capabilities are intact.");
