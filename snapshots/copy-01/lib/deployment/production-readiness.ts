import fs from "node:fs";
import path from "node:path";
import { genesisCapabilityRegistry } from "@/lib/domain/genesis-capabilities";

export type ProductionReadinessCheck = { name: string; ok: boolean; detail: string };
export type ProductionReadinessReport = {
  mode: string;
  verdict: "GO" | "NO_GO";
  checks: ProductionReadinessCheck[];
};

const exactOrigin = /^https?:\/\/[^/*]+$/i;

export function evaluateProductionReadiness(
  env: Readonly<Record<string, string | undefined>> = process.env,
  root = process.cwd(),
): ProductionReadinessReport {
  const mode = env.GENESIS_DEPLOYMENT_MODE || "local_single_user";
  const origins = (env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const isPublic = mode === "public";
  const isHosted = isPublic || mode === "private_cloud";
  const supportedMode = ["local_development", "local_single_user", "private_cloud", "public"].includes(mode);
  const persistence = genesisCapabilityRegistry.find((item) => item.capability_id === "platform.postgres_vector_object_storage");
  const hardening = genesisCapabilityRegistry.find((item) => item.capability_id === "security.public_production_hardening");
  const migrationDirectory = path.join(root, "lib", "db", "migrations");
  const gitignore = path.join(root, ".gitignore");
  const checks: ProductionReadinessCheck[] = [
    { name: "recognized deployment mode", ok: supportedMode, detail: mode },
    {
      name: "origin allowlist",
      ok: isPublic ? origins.length > 0 && origins.every((origin) => exactOrigin.test(origin)) : origins.every((origin) => exactOrigin.test(origin)),
      detail: origins.length ? `${origins.length} exact origin(s)` : isPublic ? "ALLOWED_ORIGINS is required for public mode" : "optional outside public mode",
    },
    {
      name: "secret files ignored",
      ok: fs.existsSync(gitignore) && fs.readFileSync(gitignore, "utf8").includes(".env*"),
      detail: ".env* must remain ignored while .env.example stays tracked",
    },
    {
      name: "database migrations present",
      ok: fs.existsSync(migrationDirectory) && fs.readdirSync(migrationDirectory).some((file) => file.endsWith(".sql")),
      detail: "migration lineage must remain readable",
    },
    {
      name: "production persistence boundary",
      ok: !isHosted || (persistence?.current_status === "production_verified" && Boolean(env.DATABASE_URL)),
      detail: isHosted
        ? `capability=${persistence?.current_status || "missing"}; a DATABASE_URL alone cannot certify the runtime adapter, RLS, backup and recovery path`
        : "local SQLite is permitted only for local modes",
    },
    {
      name: "authentication and public hardening boundary",
      ok: !isHosted || hardening?.current_status === "production_verified",
      detail: isHosted
        ? `capability=${hardening?.current_status || "missing"}; auth, authorization, monitoring and recovery need production verification`
        : "local single-user boundary remains explicit",
    },
    {
      name: "SQLite excluded from hosted claims",
      ok: !isHosted,
      detail: isHosted
        ? "the active ProfileRepository is SQLite; no production repository adapter is wired"
        : "active local SQLite repository matches the selected local mode",
    },
  ];
  return { mode, verdict: checks.every((check) => check.ok) ? "GO" : "NO_GO", checks };
}
