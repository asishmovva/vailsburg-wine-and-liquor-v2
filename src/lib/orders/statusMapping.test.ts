import { describe, expect, it } from "vitest";
import {
  getCustomerStatusDisplay,
  normalizeOrderStatus,
} from "@/lib/orders/statusMapping";

describe("customer status mapping", () => {
  it("normalizes legacy and internal statuses", () => {
    expect(normalizeOrderStatus("pending_store")).toBe("NEW");
    expect(normalizeOrderStatus("ready_for_pickup")).toBe("READY");
    expect(normalizeOrderStatus("fulfilled")).toBe("COMPLETED");
    expect(normalizeOrderStatus("payment_failed")).toBe("FAILED");
  });

  it("maps store-facing statuses to customer-friendly pickup labels", () => {
    const status = getCustomerStatusDisplay({
      status: "PENDING_STORE",
      fulfillment: "pickup",
    });

    expect(status.label).toBe("Order received");
    expect(status.hint).toBe("Pickup order");
  });

  it("maps delivery-ready states to delivery-specific language", () => {
    const status = getCustomerStatusDisplay({
      status: "READY",
      fulfillment: "delivery",
    });

    expect(status.label).toBe("Out for delivery");
    expect(status.hint).toBe("On the way");
  });
});
