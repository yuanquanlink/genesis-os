import { describe, expect, it } from "vitest";
import { evaluateRequestOrigin } from "@/lib/http/origin-guard";

function request(url: string, origin: string, extraHeaders: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { Origin: origin, Host: new URL(url).host, ...extraHeaders } });
}

describe("origin guard", () => {
  it("allows localhost and 127.0.0.1 aliases on the same development port", () => {
    expect(evaluateRequestOrigin(request("http://127.0.0.1:3000/api/self-entries", "http://localhost:3000"), { NODE_ENV: "development" }).allowed).toBe(true);
    expect(evaluateRequestOrigin(request("http://localhost:3000/api/self-entries", "http://127.0.0.1:3000"), { NODE_ENV: "development" }).allowed).toBe(true);
  });

  it("does not allow a different development port", () => {
    const result = evaluateRequestOrigin(request("http://127.0.0.1:3000/api/self-entries", "http://localhost:3999"), { NODE_ENV: "development" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("origin_mismatch");
  });

  it("accepts an exact preview-proxy origin only when forwarded to local development", () => {
    const result = evaluateRequestOrigin(request("http://127.0.0.1:3000/api/self-entries", "https://preview.example.test", {
      "X-Forwarded-Host": "preview.example.test",
      "X-Forwarded-Proto": "https",
    }), { NODE_ENV: "development" });
    expect(result.allowed).toBe(true);
    expect(result.expectedOrigins).toContain("https://preview.example.test");
  });

  it("requires an explicit production allow-list and rejects wildcards", () => {
    const productionRequest = request("http://127.0.0.1:3000/api/self-entries", "https://genesis.example.com");
    expect(evaluateRequestOrigin(productionRequest, { NODE_ENV: "production", ALLOWED_ORIGINS: "https://genesis.example.com" }).allowed).toBe(true);
    expect(evaluateRequestOrigin(productionRequest, { NODE_ENV: "production", ALLOWED_ORIGINS: "*" }).allowed).toBe(false);
  });

  it("keeps Sec-Fetch-Site cross-site requests blocked", () => {
    const result = evaluateRequestOrigin(request("http://localhost:3000/api/self-entries", "http://localhost:3000", { "Sec-Fetch-Site": "cross-site" }), { NODE_ENV: "development" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("cross_site");
  });
});
