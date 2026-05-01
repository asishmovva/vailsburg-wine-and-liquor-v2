import { describe, expect, it } from "vitest";
import { getFulfillmentAvailability } from "@/lib/checkout/storeAvailability";

describe("store availability", () => {
  it("marks pickup open within the configured window", () => {
    const availability = getFulfillmentAvailability(
      "pickup",
      new Date("2026-05-01T16:30:00.000Z")
    );

    expect(availability.isOpen).toBe(true);
    expect(availability.message).toBeNull();
  });

  it("blocks delivery outside delivery hours with a clear message", () => {
    const availability = getFulfillmentAvailability(
      "delivery",
      new Date("2026-05-01T01:30:00.000Z")
    );

    expect(availability.isOpen).toBe(false);
    expect(availability.message).toContain("Delivery orders are currently unavailable");
    expect(availability.label).toContain("AM");
  });
});
