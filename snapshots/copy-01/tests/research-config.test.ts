import { afterEach, describe, expect, it, vi } from "vitest";
import { readResearchConfig, resetResearchConfigWarningForTests, warnIfResearchProviderMissing } from "@/lib/research/config";

afterEach(() => {
  vi.restoreAllMocks();
  resetResearchConfigWarningForTests();
});

describe("Research environment configuration", () => {
  it("reads Tavily settings without exposing secrets", () => {
    expect(readResearchConfig({ TAVILY_API_KEY: "server-only-key", TAVILY_BASE_URL: "https://research.example/" })).toMatchObject({
      apiKey: "server-only-key",
      baseUrl: "https://research.example",
      researchPollIntervalMs: 1_000,
      researchMaxPolls: 90,
      researchModel: "mini",
    });
  });

  it("warns once when the server-side key is missing", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfResearchProviderMissing({ TAVILY_API_KEY: "" });
    warnIfResearchProviderMissing({ TAVILY_API_KEY: "" });
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0][0]).toContain("TAVILY_API_KEY");
    expect(warning.mock.calls[0][0]).not.toContain("server-only-key");
  });
});
