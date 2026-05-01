import { describe, expect, it } from "vitest";
import {
  ADMIN_ORDER_STATUSES,
  canTransitionAdminOrderStatus,
  getAdminPrimaryActionLabel,
  getAdminStatusQueryValues,
  getAllowedNextStatuses,
  isFinalAdminOrderStatus,
  normalizeAdminOrderStatus,
} from "@/lib/orders/adminStatusTransitions";

describe("admin order status transitions", () => {
  it("normalizes legacy aliases into canonical admin states", () => {
    expect(normalizeAdminOrderStatus("NEW")).toBe(
      ADMIN_ORDER_STATUSES.PENDING_STORE
    );
    expect(normalizeAdminOrderStatus("ACCEPTED")).toBe(
      ADMIN_ORDER_STATUSES.PREPARING
    );
    expect(normalizeAdminOrderStatus("READY")).toBe(
      ADMIN_ORDER_STATUSES.READY_FOR_PICKUP
    );
  });

  it("returns the right query aliases for admin status filters", () => {
    expect(getAdminStatusQueryValues("PENDING_STORE")).toEqual([
      "PENDING_STORE",
      "NEW",
    ]);
  });

  it("allows only the pickup flow transitions", () => {
    expect(
      getAllowedNextStatuses({
        currentStatus: "PENDING_STORE",
        fulfillment: "pickup",
      })
    ).toEqual(["PREPARING", "CANCELLED"]);

    expect(
      canTransitionAdminOrderStatus({
        currentStatus: "PREPARING",
        nextStatus: "READY_FOR_PICKUP",
        fulfillment: "pickup",
      })
    ).toBe(true);

    expect(
      canTransitionAdminOrderStatus({
        currentStatus: "PENDING_STORE",
        nextStatus: "COMPLETED",
        fulfillment: "pickup",
      })
    ).toBe(false);
  });

  it("allows only the delivery flow transitions", () => {
    expect(
      canTransitionAdminOrderStatus({
        currentStatus: "PREPARING",
        nextStatus: "OUT_FOR_DELIVERY",
        fulfillment: "delivery",
      })
    ).toBe(true);

    expect(
      canTransitionAdminOrderStatus({
        currentStatus: "READY_FOR_PICKUP",
        nextStatus: "CANCELLED",
        fulfillment: "delivery",
      })
    ).toBe(false);
  });

  it("treats completed and cancelled as terminal states", () => {
    expect(isFinalAdminOrderStatus("COMPLETED")).toBe(true);
    expect(isFinalAdminOrderStatus("CANCELLED")).toBe(true);
    expect(isFinalAdminOrderStatus("PREPARING")).toBe(false);
  });

  it("returns the right primary action labels", () => {
    expect(
      getAdminPrimaryActionLabel({
        currentStatus: "PENDING_STORE",
        fulfillment: "pickup",
      })
    ).toBe("Start preparing");

    expect(
      getAdminPrimaryActionLabel({
        currentStatus: "PREPARING",
        fulfillment: "delivery",
      })
    ).toBe("Mark out for delivery");
  });
});
