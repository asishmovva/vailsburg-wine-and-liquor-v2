import { describe, expect, it } from "vitest";
import { buildSystemHealthAlerts } from "@/lib/ops/healthAlerts";

describe("buildSystemHealthAlerts", () => {
  it("returns ok status with no alerts for healthy metrics", () => {
    const result = buildSystemHealthAlerts({
      nowMs: Date.parse("2026-05-01T12:00:00.000Z"),
      counts: {
        failedNotificationsRecent: 0,
        failedSyncRecent: 0,
        staleOrders: 0,
        recentErrorEvents24h: 0,
        recentCriticalEvents24h: 0,
      },
      staleByStatus: {
        pendingStore: 0,
        preparing: 0,
        readyForPickup: 0,
      },
      lastWebhookEventAtMs: Date.parse("2026-05-01T11:55:00.000Z"),
      lastSypramSyncAtMs: Date.parse("2026-05-01T11:00:00.000Z"),
      lastSypramSyncStatus: "success",
    });

    expect(result.overallStatus).toBe("ok");
    expect(result.alerts).toEqual([]);
  });

  it("escalates stale order backlog and stale webhook recency", () => {
    const result = buildSystemHealthAlerts({
      nowMs: Date.parse("2026-05-01T12:00:00.000Z"),
      counts: {
        failedNotificationsRecent: 0,
        failedSyncRecent: 0,
        staleOrders: 14,
        recentErrorEvents24h: 0,
        recentCriticalEvents24h: 0,
      },
      staleByStatus: {
        pendingStore: 5,
        preparing: 6,
        readyForPickup: 3,
      },
      lastWebhookEventAtMs: Date.parse("2026-05-01T05:00:00.000Z"),
      lastSypramSyncAtMs: Date.parse("2026-05-01T11:00:00.000Z"),
      lastSypramSyncStatus: "success",
    });

    expect(result.overallStatus).toBe("critical");
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "stale-orders-critical",
          severity: "critical",
        }),
        expect.objectContaining({
          id: "webhook-delayed-critical",
          severity: "critical",
        }),
      ])
    );
  });

  it("flags elevated error volumes and failed sync signals", () => {
    const result = buildSystemHealthAlerts({
      nowMs: Date.parse("2026-05-01T12:00:00.000Z"),
      counts: {
        failedNotificationsRecent: 5,
        failedSyncRecent: 2,
        staleOrders: 1,
        recentErrorEvents24h: 28,
        recentCriticalEvents24h: 0,
      },
      staleByStatus: {
        pendingStore: 1,
        preparing: 0,
        readyForPickup: 0,
      },
      lastWebhookEventAtMs: Date.parse("2026-05-01T11:30:00.000Z"),
      lastSypramSyncAtMs: Date.parse("2026-04-29T11:00:00.000Z"),
      lastSypramSyncStatus: "failed",
    });

    expect(result.overallStatus).toBe("critical");
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "error-events-24h",
          severity: "warning",
        }),
        expect.objectContaining({
          id: "failed-notifications",
          severity: "warning",
        }),
        expect.objectContaining({
          id: "failed-sync-events",
          severity: "warning",
        }),
        expect.objectContaining({
          id: "sypram-sync-stale-critical",
          severity: "critical",
        }),
        expect.objectContaining({
          id: "sypram-last-status-failed",
          severity: "warning",
        }),
      ])
    );
  });
});
