import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // All browser tests intentionally share the one isolated e2e SQLite database.
  // Serial execution prevents one data-cleanup flow from racing another flow.
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3210", channel: "chrome" },
});
