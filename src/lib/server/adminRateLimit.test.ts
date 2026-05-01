import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetAdminRateLimitBucketsForTests,
  adminRateLimit,
} from "@/lib/server/adminRateLimit";

function makeRequest(pathname = "/api/admin/orders", method = "GET") {
  return {
    method,
    url: `http://localhost${pathname}`,
    headers: new Headers({
      "x-forwarded-for": "127.0.0.1",
    }),
    nextUrl: { pathname },
  };
}

describe("adminRateLimit", () => {
  beforeEach(() => {
    __resetAdminRateLimitBucketsForTests();
  });

  it("uses stricter thresholds for mutation class than read class", () => {
    const request = makeRequest("/api/admin/orders/123/status", "POST");
    let response: Response | null = null;

    for (let i = 0; i < 90; i += 1) {
      response = adminRateLimit("mutate", "admin-1", request as never);
    }

    expect(response).toBeNull();
    const blocked = adminRateLimit("mutate", "admin-1", request as never);
    expect(blocked?.status).toBe(429);
  });

  it("allows higher throughput for read class", () => {
    const request = makeRequest("/api/admin/orders", "GET");
    let response: Response | null = null;

    for (let i = 0; i < 180; i += 1) {
      response = adminRateLimit("read", "admin-1", request as never);
    }

    expect(response).toBeNull();
    const blocked = adminRateLimit("read", "admin-1", request as never);
    expect(blocked?.status).toBe(429);
  });

  it("keeps heavy class most restrictive", () => {
    const request = makeRequest("/api/admin/orders/export", "GET");
    let response: Response | null = null;

    for (let i = 0; i < 24; i += 1) {
      response = adminRateLimit("heavy", "admin-1", request as never);
    }

    expect(response).toBeNull();
    const blocked = adminRateLimit("heavy", "admin-1", request as never);
    expect(blocked?.status).toBe(429);
  });
});
