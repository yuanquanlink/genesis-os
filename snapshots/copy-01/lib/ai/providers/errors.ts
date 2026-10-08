export type AIErrorCode =
  | "not_configured"
  | "unsupported_provider"
  | "authentication"
  | "insufficient_balance"
  | "rate_limit"
  | "invalid_request"
  | "timeout"
  | "network"
  | "invalid_output"
  | "provider_error";

export class AIProviderError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
    readonly retryable = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export function classifyProviderStatus(status: number) {
  if (status === 401)
    return new AIProviderError(
      "authentication",
      "AI Provider 身份验证失败。",
      false,
      status,
    );
  if (status === 402)
    return new AIProviderError(
      "insufficient_balance",
      "AI Provider 账户余额不足。",
      false,
      status,
    );
  if (status === 429)
    return new AIProviderError(
      "rate_limit",
      "AI Provider 请求过于频繁，请稍后重试。",
      true,
      status,
    );
  if (status === 400 || status === 422)
    return new AIProviderError(
      "invalid_request",
      "AI Provider 拒绝了请求参数。",
      false,
      status,
    );
  if (status === 500 || status === 503)
    return new AIProviderError(
      "provider_error",
      "AI Provider 暂时不可用。",
      true,
      status,
    );
  return new AIProviderError(
    "provider_error",
    `AI Provider 返回 HTTP ${status}。`,
    status >= 500,
    status,
  );
}

export function safeProviderError(error: unknown) {
  if (error instanceof AIProviderError) return error;
  if (error instanceof ZodError)
    return new AIProviderError(
      "invalid_output",
      "AI Provider 返回内容未通过 Schema 验证。",
      false,
    );
  if (error instanceof DOMException && error.name === "AbortError")
    return new AIProviderError("timeout", "AI Provider 请求超时。", true);
  if (error instanceof Error && /abort|timeout/i.test(error.message))
    return new AIProviderError("timeout", "AI Provider 请求超时。", true);
  if (error instanceof Error && /json|schema|parse|output/i.test(error.message))
    return new AIProviderError(
      "invalid_output",
      "AI Provider 返回内容未通过 Schema 验证。",
      false,
    );
  return new AIProviderError("network", "无法连接 AI Provider。", true);
}
import { ZodError } from "zod";
