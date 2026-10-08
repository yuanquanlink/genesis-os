import { evaluateProductionReadiness } from "@/lib/deployment/production-readiness";

const report = evaluateProductionReadiness();
for (const check of report.checks)
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);

console.log(`${report.verdict} deployment mode: ${report.mode}. API keys are server-only and omitted from this report.`);
if (report.verdict === "NO_GO") process.exitCode = 1;
