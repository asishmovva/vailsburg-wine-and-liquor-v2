import type {
  OrderRefundReconciliation,
  OrderRefundStatus,
} from "@/lib/orders/types";

export type StripeRefundSnapshot = {
  chargeId: string | null;
  amountRefunded: number | null;
  amountCaptured: number | null;
  currency: string | null;
  refundCount: number | null;
  refundIds: string[];
};

type ResolveRefundReconciliationInput = {
  manualStatus: OrderRefundStatus | null | undefined;
  paymentIntentId?: string | null;
  manualMarkedRefundedAt?: unknown;
  manualMarkedByUid?: string | null;
  manualMarkedByEmail?: string | null;
  checkedAt: unknown;
  stripeSnapshot?: StripeRefundSnapshot | null;
  stripeError?: string | null;
};

export function resolveRefundReconciliation({
  manualStatus,
  paymentIntentId,
  manualMarkedRefundedAt,
  manualMarkedByUid,
  manualMarkedByEmail,
  checkedAt,
  stripeSnapshot,
  stripeError,
}: ResolveRefundReconciliationInput): OrderRefundReconciliation {
  const base: OrderRefundReconciliation = {
    state: "not_checked",
    manualStatus: manualStatus ?? null,
    manualMarkedRefundedAt: manualMarkedRefundedAt ?? null,
    manualMarkedByUid: manualMarkedByUid ?? null,
    manualMarkedByEmail: manualMarkedByEmail ?? null,
    stripePaymentIntentId: paymentIntentId ?? null,
    stripeChargeId: stripeSnapshot?.chargeId ?? null,
    stripeAmountRefunded: stripeSnapshot?.amountRefunded ?? null,
    stripeAmountCaptured: stripeSnapshot?.amountCaptured ?? null,
    stripeCurrency: stripeSnapshot?.currency ?? null,
    stripeRefundCount: stripeSnapshot?.refundCount ?? null,
    stripeRefundIds: stripeSnapshot?.refundIds ?? [],
    stripeLastCheckedAt: checkedAt,
    stripeLastError: stripeError ?? null,
  };

  if (manualStatus !== "refunded") {
    return {
      ...base,
      state: "not_marked_refunded",
    };
  }

  if (!paymentIntentId) {
    return {
      ...base,
      state: "manual_marked_without_payment_intent",
    };
  }

  if (stripeError) {
    return {
      ...base,
      state: "stripe_check_failed",
    };
  }

  if ((stripeSnapshot?.amountRefunded ?? 0) > 0) {
    return {
      ...base,
      state: "stripe_refunded",
    };
  }

  return {
    ...base,
    state: "manual_marked_without_stripe_refund",
  };
}
