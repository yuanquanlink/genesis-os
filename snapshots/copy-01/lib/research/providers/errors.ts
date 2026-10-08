import { ZodError } from "zod";

export type ResearchErrorCode =
  | "not_configured"
  | "authentication"
  | "rate_limit"
  | "invalid_request"
  | "timeout"
  | "network"
  | "invalid_output"
  | "provider_error";

export class ResearchProviderError extends Error {
  constructor(
    readonly code: ResearchErrorCode,
    message: string,
    readonly retryable = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ResearchProviderError";
  }
}

export function classifyResearchStatus(status: number) {
  if (status === 401 || status === 403)
    return new ResearchProviderError(
      "authentication",
      "Tavily authentication failed.",
      false,
      status,
    );
  if (status === 429)
    return new ResearchProviderError(
      "rate_limit",
      "Tavily rate limit reached.",
      true,
      status,
    );
  if (status === 400 || status === 404 || status === 422)
    return new ResearchProviderError(
      "invalid_request",
      "Tavily rejected the research request.",
      false,
      status,
    );
  return new ResearchProviderError(
    "provider_error",
    `Tavily returned HTTP ${status}.`,
    status >= 500,
    status,
  );
}

export function safeResearchError(error: unknown) {
  if (error instanceof ResearchProviderError) return error;
  if (error instanceof ZodError)
    return new ResearchProviderError(
      "invalid_output",
      "Tavily returned an invalid response.",
      false,
    );
  if (error instanceof DOMException && error.name === "AbortError")
    return new ResearchProviderError("timeout", "Tavily request timed out.", true);
  if (error instanceof Error && /abort|timeout/i.test(error.message))
    return new ResearchProviderError("timeout", "Tavily request timed out.", true);
  if (error instanceof Error && /json|parse|schema|output/i.test(error.message))
    return new ResearchProviderError(
      "invalid_output",
      "Tavily returned an invalid response.",
      false,
    );
  return new ResearchProviderError(
    "network",
    "Tavily could not be reached.",
    true,
  );
}
