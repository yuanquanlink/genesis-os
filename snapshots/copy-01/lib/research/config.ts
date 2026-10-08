import "server-only";

let missingKeyWarningShown = false;

export type ResearchConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  researchPollIntervalMs: number;
  researchMaxPolls: number;
  researchModel: "mini" | "pro";
};

type ResearchEnvironment = {
  TAVILY_API_KEY?: string;
  TAVILY_BASE_URL?: string;
  RESEARCH_REQUEST_TIMEOUT_MS?: string;
  RESEARCH_MAX_RETRIES?: string;
  RESEARCH_POLL_INTERVAL_MS?: string;
  RESEARCH_MAX_POLLS?: string;
  TAVILY_RESEARCH_MODEL?: string;
};

export function readResearchConfig(environment: ResearchEnvironment = process.env as ResearchEnvironment): ResearchConfig {
  return {
    apiKey: environment.TAVILY_API_KEY?.trim() || "",
    baseUrl: (environment.TAVILY_BASE_URL || "https://api.tavily.com").replace(/\/$/, ""),
    timeoutMs: Number(environment.RESEARCH_REQUEST_TIMEOUT_MS || 30_000),
    maxRetries: Math.max(0, Math.min(3, Number(environment.RESEARCH_MAX_RETRIES || 1))),
    researchPollIntervalMs: Math.max(250, Math.min(5_000, Number(environment.RESEARCH_POLL_INTERVAL_MS || 1_000))),
    researchMaxPolls: Math.max(1, Math.min(180, Number(environment.RESEARCH_MAX_POLLS || 90))),
    researchModel: environment.TAVILY_RESEARCH_MODEL === "pro" ? "pro" : "mini",
  };
}

export function warnIfResearchProviderMissing(environment: ResearchEnvironment = process.env as ResearchEnvironment) {
  const config = readResearchConfig(environment);
  if (!config.apiKey && !missingKeyWarningShown) {
    missingKeyWarningShown = true;
    console.warn("[Genesis Research] TAVILY_API_KEY is not configured; Research Engine remains unavailable until a server-side key is provided.");
  }
  return config;
}

export function resetResearchConfigWarningForTests() {
  missingKeyWarningShown = false;
}
