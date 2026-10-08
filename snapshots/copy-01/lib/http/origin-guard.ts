type OriginEnvironment = {
  NODE_ENV?: string;
  ALLOWED_ORIGINS?: string;
  APP_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  AUTH_URL?: string;
};

export type OriginDecision = {
  allowed: boolean;
  reason: "no_origin" | "matched" | "cross_site" | "origin_mismatch";
  receivedOrigin: string | null;
  expectedOrigins: string[];
  requestOrigin: string;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function normalizedOrigin(value: string | null | undefined) {
  if (!value || value === "null" || value.includes("*")) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function originFromHost(protocol: string, host: string | null) {
  if (!host || /[\s/\\]/.test(host)) return null;
  return normalizedOrigin(`${protocol}//${host}`);
}

function isLoopback(origin: string) {
  const hostname = new URL(origin).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function addLoopbackAliases(origins: Set<string>, origin: string | null) {
  if (!origin || !isLoopback(origin)) return;
  const parsed = new URL(origin);
  const suffix = parsed.port ? `:${parsed.port}` : "";
  origins.add(`${parsed.protocol}//localhost${suffix}`);
  origins.add(`${parsed.protocol}//127.0.0.1${suffix}`);
  origins.add(`${parsed.protocol}//[::1]${suffix}`);
}

function configuredOrigins(environment: OriginEnvironment) {
  const values = [
    ...(environment.ALLOWED_ORIGINS || "").split(/[\s,]+/),
    environment.APP_URL,
    environment.NEXT_PUBLIC_APP_URL,
    environment.AUTH_URL,
  ];
  const origins = new Set<string>();
  for (const value of values) {
    const origin = normalizedOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function evaluateRequestOrigin(
  request: Request,
  environment: OriginEnvironment = process.env,
): OriginDecision {
  const requestOrigin = new URL(request.url).origin;
  const receivedOrigin = normalizedOrigin(request.headers.get("origin"));
  const host = firstHeaderValue(request.headers.get("host"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const expected = configuredOrigins(environment);
  const development = environment.NODE_ENV !== "production";

  if (development) {
    const requestProtocol = new URL(request.url).protocol;
    const hostOrigin = originFromHost(requestProtocol, host);
    expected.add(requestOrigin);
    if (hostOrigin) expected.add(hostOrigin);
    addLoopbackAliases(expected, requestOrigin);
    addLoopbackAliases(expected, hostOrigin);

    // Development preview proxies terminate the browser-facing origin and
    // forward to a loopback Next.js server. Trust the forwarded pair only for
    // that local development topology; production still requires the explicit
    // allow-list above.
    if (forwardedHost && forwardedProto && (isLoopback(requestOrigin) || (hostOrigin && isLoopback(hostOrigin)))) {
      const forwardedOrigin = originFromHost(`${forwardedProto}:`, forwardedHost);
      if (forwardedOrigin) expected.add(forwardedOrigin);
    }
  }

  const expectedOrigins = [...expected].sort();
  if (!receivedOrigin) {
    return { allowed: true, reason: "no_origin", receivedOrigin: null, expectedOrigins, requestOrigin, host, forwardedHost, forwardedProto };
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return { allowed: false, reason: "cross_site", receivedOrigin, expectedOrigins, requestOrigin, host, forwardedHost, forwardedProto };
  }
  const allowed = expected.has(receivedOrigin);
  return { allowed, reason: allowed ? "matched" : "origin_mismatch", receivedOrigin, expectedOrigins, requestOrigin, host, forwardedHost, forwardedProto };
}
