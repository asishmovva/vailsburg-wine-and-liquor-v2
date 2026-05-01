import { describe, expect, it } from "vitest";
import { buildOrderTimeline } from "@/lib/orders/buildOrderTimeline";
import type { OrderRecord } from "@/lib/orders/types";

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    fulfillment: "pickup",
    items: [],
    subtotal: 20,
    deliveryFee: 0,
    tip: 0,
    tax: 1.33,
    total: 21.33,
    status: "NEW",
    createdAt: new Date("2026-05-01T12:00:00Z"),
    updatedAt: new Date("2026-05-01T12:05:00Z"),
    ...overrides,
  };
}

describe("buildOrderTimeline", () => {
  it("builds a preparing pickup timeline", () => {
    const timeline = buildOrderTimeline(
      makeOrder({
        status: "ACCEPTED",
        updatedAt: new Date("2026-05-01T12:10:00Z"),
      })
    );

    expect(timeline.map((step) => step.key)).toEqual([
      "placed",
      "paid",
      "preparing",
      "ready",
      "completed",
    ]);
    expect(timeline[2].current).toBe(true);
    expect(timeline[2].completed).toBe(true);
  });

  it("builds a delivery timeline that highlights out for delivery", () => {
    const timeline = buildOrderTimeline(
      makeOrder({
        fulfillment: "delivery",
        status: "OUT_FOR_DELIVERY",
        fulfillmentStatus: "OUT_FOR_DELIVERY",
      })
    );

    expect(timeline[3].key).toBe("delivering");
    expect(timeline[3].current).toBe(true);
    expect(timeline[3].label).toBe("Out for delivery");
  });

  it("builds a cancelled timeline without inventing extra milestones", () => {
    const timeline = buildOrderTimeline(
      makeOrder({
        status: "CANCELLED",
      })
    );

    expect(timeline.map((step) => step.key)).toEqual([
      "placed",
      "paid",
      "cancelled",
    ]);
    expect(timeline[2].current).toBe(true);
    expect(timeline[2].tone).toBe("destructive");
  });

  it("builds a failed payment timeline", () => {
    const timeline = buildOrderTimeline(
      makeOrder({
        status: "FAILED",
      })
    );

    expect(timeline.map((step) => step.key)).toEqual(["placed", "failed"]);
    expect(timeline[1].label).toBe("Payment failed");
    expect(timeline[1].current).toBe(true);
  });
});
