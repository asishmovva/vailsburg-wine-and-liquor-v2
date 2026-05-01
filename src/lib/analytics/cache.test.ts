import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAnalyticsCacheForTests,
  withAnalyticsCache,
} from "@/lib/analytics/cache";

describe("withAnalyticsCache", () => {
  beforeEach(() => {
    __resetAnalyticsCacheForTests();
  });

  it("returns cacheHit=false on first compute and true on second call", async () => {
    const compute = vi.fn(async () => ({ value: 42 }));

    const first = await withAnalyticsCache({
      key: "analytics:test:hit",
      ttlMs: 60_000,
      compute,
    });
    const second = await withAnalyticsCache({
      key: "analytics:test:hit",
      ttlMs: 60_000,
      compute,
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(first.value).toEqual({ value: 42 });
    expect(second.value).toEqual({ value: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(second.expiresAtMs).toBe(first.expiresAtMs);
  });

  it("recomputes after ttl expiration", async () => {
    vi.useFakeTimers();
    try {
      let computeCount = 0;
      const compute = vi.fn(async () => ({ value: ++computeCount }));

      const first = await withAnalyticsCache({
        key: "analytics:test:expire",
        ttlMs: 500,
        compute,
      });

      vi.advanceTimersByTime(300);
      const second = await withAnalyticsCache({
        key: "analytics:test:expire",
        ttlMs: 500,
        compute,
      });

      vi.advanceTimersByTime(250);
      const third = await withAnalyticsCache({
        key: "analytics:test:expire",
        ttlMs: 500,
        compute,
      });

      expect(first.cacheHit).toBe(false);
      expect(second.cacheHit).toBe(true);
      expect(third.cacheHit).toBe(false);
      expect(first.value).toEqual({ value: 1 });
      expect(second.value).toEqual({ value: 1 });
      expect(third.value).toEqual({ value: 2 });
      expect(compute).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
