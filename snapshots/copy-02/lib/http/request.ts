import "server-only";
import { evaluateRequestOrigin } from "@/lib/http/origin-guard";

export class RequestValidationError extends Error {
  constructor(readonly status: number, readonly publicMessage: string) {
    super(publicMessage);
  }
}

function assertTrustedOrigin(request: Request) {
  const originDecision = evaluateRequestOrigin(request);
  if (!originDecision.allowed) {
    console.warn("[OriginGuard] rejected write request", {
      receivedOrigin: originDecision.receivedOrigin,
      expectedOrigins: originDecision.expectedOrigins,
      requestOrigin: originDecision.requestOrigin,
      host: originDecision.host,
      forwardedHost: originDecision.forwardedHost,
      forwardedProto: originDecision.forwardedProto,
      reason: originDecision.reason,
    });
    const message = originDecision.reason === "cross_site" ? "拒绝跨站写入请求" : "请求来源无效";
    throw new RequestValidationError(403, message);
  }
}

export async function readTrustedJson(request: Request) {
  assertTrustedOrigin(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) throw new RequestValidationError(415, "仅接受 JSON 请求");
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 64 * 1024) throw new RequestValidationError(413, "请求内容过大");
  try {
    return await request.json() as unknown;
  } catch {
    throw new RequestValidationError(400, "JSON 格式无效");
  }
}

export async function readTrustedFormData(request: Request, maxBytes = 16 * 1024 * 1024) {
  assertTrustedOrigin(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("multipart/form-data")) throw new RequestValidationError(415, "仅接受 multipart/form-data 上传");
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new RequestValidationError(413, "上传内容过大");
  try {
    return await request.formData();
  } catch {
    throw new RequestValidationError(400, "上传表单格式无效");
  }
}

export function publicServerError(scope: string, error: unknown) {
  const errorId = crypto.randomUUID();
  console.error(`[${scope}] ${errorId}`, error);
  return { error: "服务器暂时无法完成请求", errorId };
}
