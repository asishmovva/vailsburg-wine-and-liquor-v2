import { describe, expect, it } from "vitest";
import {
  getLatestRelevantNotificationEvent,
  getMissedNotificationCandidates,
  getNotificationEventLabel,
  hasNotificationBeenSent,
} from "@/lib/notifications/events";
import {
  getFirstMissedNotificationCandidate,
  hasNotificationAttention,
  hasNotificationFailure,
} from "@/lib/notifications/ops";

describe("notification event helpers", () => {
  it("supports dedupe checks for nested and legacy notification markers", () => {
    expect(
      hasNotificationBeenSent(
        {
          readyForPickup: {
            sentAt: "2026-05-01T12:00:00.000Z",
          },
        },
        "READY_FOR_PICKUP"
      )
    ).toBe(true);

    expect(
      hasNotificationBeenSent(
        {
          readySentAt: "2026-05-01T12:00:00.000Z",
        },
        "READY_FOR_PICKUP"
      )
    ).toBe(true);
  });

  it("returns the latest relevant event for the current order state", () => {
    expect(
      getLatestRelevantNotificationEvent({
        status: "NEW",
        fulfillment: "pickup",
      })
    ).toBe("ORDER_RECEIVED");

    expect(
      getLatestRelevantNotificationEvent({
        status: "READY",
        fulfillment: "delivery",
      })
    ).toBe("OUT_FOR_DELIVERY");

    expect(
      getLatestRelevantNotificationEvent({
        status: "CANCELLED",
        fulfillment: "pickup",
      })
    ).toBe("ORDER_CANCELLED");
  });

  it("detects missed customer notification candidates based on status", () => {
    expect(
      getMissedNotificationCandidates({
        status: "READY",
        fulfillment: "pickup",
        notifications: {},
      })
    ).toEqual(["READY_FOR_PICKUP"]);

    expect(
      getMissedNotificationCandidates({
        status: "OUT_FOR_DELIVERY",
        fulfillment: "delivery",
        notifications: {},
      })
    ).toEqual(["OUT_FOR_DELIVERY"]);

    expect(
      getMissedNotificationCandidates({
        status: "COMPLETED",
        fulfillment: "pickup",
        notifications: {
          completed: { sentAt: "2026-05-01T12:00:00.000Z" },
        },
      })
    ).toEqual([]);
  });

  it("returns admin-facing labels that adapt to fulfillment", () => {
    expect(getNotificationEventLabel("ADMIN_NEW_ORDER_ALERT", "pickup")).toBe(
      "Admin pickup alert"
    );
    expect(
      getNotificationEventLabel("ADMIN_NEW_ORDER_ALERT", "delivery")
    ).toBe("Admin delivery alert");
  });

  it("detects notification failure and attention states for ops views", () => {
    expect(
      hasNotificationFailure({
        notifications: {
          readyForPickup: { lastStatus: "failed" },
        },
      })
    ).toBe(true);
    expect(
      hasNotificationFailure({
        notifications: {
          orderReceived: { lastStatus: "sent" },
        },
      })
    ).toBe(false);

    expect(
      hasNotificationAttention({
        status: "READY",
        fulfillment: "pickup",
        notifications: {},
      })
    ).toBe(true);
    expect(
      hasNotificationAttention({
        status: "READY",
        fulfillment: "pickup",
        notifications: {
          readyForPickup: { sentAt: "2026-05-01T12:00:00.000Z" },
        },
      })
    ).toBe(false);
  });

  it("returns the first resendable missed candidate for recovery actions", () => {
    expect(
      getFirstMissedNotificationCandidate({
        status: "OUT_FOR_DELIVERY",
        fulfillment: "delivery",
        notifications: {},
      })
    ).toBe("OUT_FOR_DELIVERY");

    expect(
      getFirstMissedNotificationCandidate({
        status: "COMPLETED",
        fulfillment: "pickup",
        notifications: {
          completed: { sentAt: "2026-05-01T12:00:00.000Z" },
        },
      })
    ).toBeNull();
  });
});
