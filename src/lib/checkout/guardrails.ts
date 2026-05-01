import type { OrderFulfillment } from "@/lib/orders/types";

export const DELIVERY_RADIUS_MILES = 8;
export const DELIVERY_FEE = 5.99;
export const MIN_DELIVERY_ORDER = 20;
export const TAX_RATE = 0.06625;

export function isWithinDeliveryRadius(
  distanceMiles: number,
  maxMiles = DELIVERY_RADIUS_MILES
) {
  return Number.isFinite(distanceMiles) && distanceMiles <= maxMiles;
}

export function meetsDeliveryMinimum(
  subtotal: number,
  minimum = MIN_DELIVERY_ORDER
) {
  return subtotal >= minimum;
}

export function hasPriceMismatch(
  expectedPrice: number | undefined,
  currentPrice: number
) {
  if (!Number.isFinite(expectedPrice) || (expectedPrice ?? 0) <= 0) {
    return false;
  }

  return (
    Math.round((expectedPrice ?? 0) * 100) !== Math.round(currentPrice * 100)
  );
}

export function computeManualTaxCents(
  taxableSubtotalCents: number,
  taxRate = TAX_RATE
) {
  return Math.round(taxableSubtotalCents * taxRate);
}

export function computeCheckoutTotalCents({
  subtotalCents,
  fulfillment,
  deliveryFee,
  tipAmount = 0,
  taxCents,
}: {
  subtotalCents: number;
  fulfillment: OrderFulfillment;
  deliveryFee: number;
  tipAmount?: number;
  taxCents: number;
}) {
  const appliedDeliveryFee = fulfillment === "delivery" ? deliveryFee : 0;
  return (
    subtotalCents +
    Math.round(appliedDeliveryFee * 100) +
    Math.round(Math.max(0, tipAmount) * 100) +
    taxCents
  );
}
