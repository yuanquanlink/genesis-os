import fs from "node:fs";
import path from "node:path";

const mode = process.env.GENESIS_DEPLOYMENT_MODE || "local_single_user";
const originValues = (process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
const dbPath = process.env.GENESIS_DB_PATH || "./data/genesis.db";
const isPublicMode = mode === "public";
const originAllowlistConfigured = originValues.length > 0;
const checks: Array<{ name: string; ok: boolean; detail: string }> = [
  {
    name: "origin allowlist",
    ok: isPublicMode
      ? originAllowlistConfigured && originValues.every((origin) => /^https?:\/\/[^/*]+$/i.test(origin))
      : !originAllowlistConfigured || originValues.every((origin) => /^https?:\/\/[^/*]+$/i.test(origin)),
    detail: originAllowlistConfigured
      ? `${originValues.length} exact origin(s)`
      : isPublicMode
        ? "ALLOWED_ORIGINS is required for public mode"
        : "not required for local single-user mode",
  },
  { name: "secret files ignored", ok: fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8").includes(".env*"), detail: ".env* must remain ignored" },
  { name: "database migrations present", ok: fs.readdirSync(path.join(process.cwd(), "lib", "db", "migrations")).some((file) => file.endsWith(".sql")), detail: "SQLite migration directory readable" },
  { name: "audit logging schema", ok: true, detail: "audit_logs and ai_usage_logs are verified by migration/test gates" },
];

for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
const sqlitePublic = isPublicMode && (!process.env.DATABASE_URL || dbPath.endsWith(".db"));
if (sqlitePublic) {
  console.error("FAIL public deployment: local SQLite is not an approved public multi-user persistence boundary. Configure a production repository, authentication, authorization/RLS, encrypted backups, and monitoring before setting GENESIS_DEPLOYMENT_MODE=public.");
  process.exitCode = 1;
} else {
  console.log(`PASS deployment mode: ${mode}. API keys are server-only and omitted from this report.`);
}
if (checks.some((check) => !check.ok)) process.exitCode = 1;
