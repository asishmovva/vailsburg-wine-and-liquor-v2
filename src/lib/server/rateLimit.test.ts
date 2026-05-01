import { describe, expect, it } from "vitest";
import {
  __resetRateLimitBucketsForTests,
  getClientKey,
  rateLimit,
} from "@/lib/server/rateLimit";

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "GET",
    headers,
  });
}

describe("server rate limit helper", () => {
  it("allows requests until limit then returns 429", () => {
    __resetRateLimitBucketsForTests();
    const request = makeRequest("http://localhost/api/test", {
      "x-forwarded-for": "203.0.113.7",
    });

    expect(rateLimit("unit-test", request, { limit: 2, windowMs: 60_000 })).toBeNull();
    expect(rateLimit("unit-test", request, { limit: 2, windowMs: 60_000 })).toBeNull();
    const limited = rateLimit("unit-test", request, { limit: 2, windowMs: 60_000 });
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
  });

  it("isolates counters by HTTP method and path", () => {
    __resetRateLimitBucketsForTests();
    const postRequest = new Request("http://localhost/api/test", { method: "POST" });
    const getRequest = new Request("http://localhost/api/test", { method: "GET" });
    const otherPathGetRequest = new Request("http://localhost/api/other", {
      method: "GET",
    });

    expect(rateLimit("scope", postRequest, { limit: 1, windowMs: 60_000 })).toBeNull();
    expect(rateLimit("scope", postRequest, { limit: 1, windowMs: 60_000 })?.status).toBe(
      429
    );

    expect(rateLimit("scope", getRequest, { limit: 1, windowMs: 60_000 })).toBeNull();
    expect(
      rateLimit("scope", otherPathGetRequest, { limit: 1, windowMs: 60_000 })
    ).toBeNull();
  });

  it("extracts client keys from forwarded headers with fallback", () => {
    const forwarded = makeRequest("http://localhost/api/test", {
      "x-forwarded-for": "198.51.100.12, 10.0.0.1",
    });
    expect(getClientKey(forwarded)).toBe("198.51.100.12");

    const cloudflare = makeRequest("http://localhost/api/test", {
      "cf-connecting-ip": "198.51.100.99",
    });
    expect(getClientKey(cloudflare)).toBe("198.51.100.99");

    const fallback = makeRequest("http://localhost/api/test");
    expect(getClientKey(fallback)).toBe("unknown");
  });
});
