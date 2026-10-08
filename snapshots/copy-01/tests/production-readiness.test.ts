import { describe, expect, it } from "vitest";
import { evaluateProductionReadiness } from "@/lib/deployment/production-readiness";

describe("production readiness boundary", () => {
  it("keeps the current local single-user runtime available", () => {
    const report = evaluateProductionReadiness({ GENESIS_DEPLOYMENT_MODE: "local_single_user" });
    expect(report.verdict).toBe("GO");
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it("does not let public mode pass by supplying environment variables to the SQLite runtime", () => {
    const report = evaluateProductionReadiness({
      GENESIS_DEPLOYMENT_MODE: "public",
      ALLOWED_ORIGINS: "https://genesis.example.com",
      DATABASE_URL: "postgresql://configured-but-not-wired/example",
      GENESIS_DB_PATH: "./data/not-a-production-boundary.db",
    });
    expect(report.verdict).toBe("NO_GO");
    expect(report.checks.find((check) => check.name === "production persistence boundary")?.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "authentication and public hardening boundary")?.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "SQLite excluded from hosted claims")?.ok).toBe(false);
  });

  it("rejects a public wildcard origin", () => {
    const report = evaluateProductionReadiness({ GENESIS_DEPLOYMENT_MODE: "public", ALLOWED_ORIGINS: "*" });
    expect(report.verdict).toBe("NO_GO");
    expect(report.checks.find((check) => check.name === "origin allowlist")?.ok).toBe(false);
  });
});
