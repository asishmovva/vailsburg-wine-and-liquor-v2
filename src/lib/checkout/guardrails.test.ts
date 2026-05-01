import { describe, expect, it } from "vitest";
import {
  computeCheckoutTotalCents,
  computeManualTaxCents,
  DELIVERY_FEE,
  DELIVERY_RADIUS_MILES,
  hasPriceMismatch,
  isWithinDeliveryRadius,
  meetsDeliveryMinimum,
  MIN_DELIVERY_ORDER,
} from "@/lib/checkout/guardrails";

describe("checkout guardrails", () => {
  it("accepts only addresses within the delivery radius", () => {
    expect(isWithinDeliveryRadius(DELIVERY_RADIUS_MILES)).toBe(true);
    expect(isWithinDeliveryRadius(7.99)).toBe(true);
    expect(isWithinDeliveryRadius(8.01)).toBe(false);
  });

  it("enforces the delivery minimum", () => {
    expect(meetsDeliveryMinimum(MIN_DELIVERY_ORDER)).toBe(true);
    expect(meetsDeliveryMinimum(24.5)).toBe(true);
    expect(meetsDeliveryMinimum(19.99)).toBe(false);
  });

  it("detects client/server price mismatches by cents", () => {
    expect(hasPriceMismatch(10, 10)).toBe(false);
    expect(hasPriceMismatch(undefined, 10)).toBe(false);
    expect(hasPriceMismatch(9.99, 10)).toBe(true);
  });

  it("computes manual tax in cents with normal rounding", () => {
    expect(computeManualTaxCents(2_000)).toBe(133);
    expect(computeManualTaxCents(1_999)).toBe(132);
  });

  it("computes the final checkout total in cents", () => {
    expect(
      computeCheckoutTotalCents({
        subtotalCents: 2_500,
        fulfillment: "delivery",
        deliveryFee: DELIVERY_FEE,
        tipAmount: 4,
        taxCents: 133,
      })
    ).toBe(3_632);

    expect(
      computeCheckoutTotalCents({
        subtotalCents: 2_500,
        fulfillment: "pickup",
        deliveryFee: DELIVERY_FEE,
        tipAmount: 0,
        taxCents: 133,
      })
    ).toBe(2_633);
  });
});
