import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRepository } from "@/lib/db/repository";

const state = vi.hoisted(() => ({ repository: undefined as ProfileRepository | undefined }));
vi.mock("@/lib/db/repository", () => ({
  getRepository: () => state.repository,
}));

describe("Research API integration", () => {
  let directory: string;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-research-api-"));
    const { ProfileRepository } = await vi.importActual<typeof import("@/lib/db/repository")>("@/lib/db/repository");
    state.repository = new ProfileRepository(path.join(directory, "api.db"));
  });

  afterEach(() => {
    state.repository?.close();
    state.repository = undefined;
    fs.rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });

  it("serves read-only history from persisted local research data", async () => {
    const { GET } = await import("@/app/api/research/history/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runs: [] });
  });

  it("returns an explicit not-configured response without pretending research succeeded", async () => {
    process.env.TAVILY_API_KEY = "";
    const { POST } = await import("@/app/api/research/route");
    const response = await POST(new Request("http://localhost:3000/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "search",
        clientRequestId: "f0e185d6-3ae2-4d7b-bc6f-162513bd30a0",
        query: "research without a configured provider",
        consumers: ["learning"],
      }),
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "not_configured" });
    expect(state.repository?.db.prepare("SELECT status FROM research_runs").get()).toMatchObject({ status: "failed" });
  });
});
