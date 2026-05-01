import type {
  OrderRefundReconciliation,
  OrderRefundStatus,
  RefundReconciliationState,
} from "@/lib/orders/types";

type StripeChargeLike = {
  id: string;
  amount_refunded?: number | null;
  amount_captured?: number | null;
  currency?: string | null;
  refunds?: {
    data?: Array<{ id?: string | null }>;
  } | null;
};

export type StripePaymentIntentLike = {
  id: string;
  amount_received?: number | null;
  currency?: string | null;
  latest_charge?: StripeChargeLike | null;
};

type BuildRefundReconciliationInput = {
  manualStatus: OrderRefundStatus | null | undefined;
  manualMarkedRefundedAt?: unknown;
  manualMarkedByUid?: string | null;
  manualMarkedByEmail?: string | null;
  stripePaymentIntentId?: string | null;
  paymentIntent?: StripePaymentIntentLike | null;
  stripeCheckFailedMessage?: string | null;
  now: unknown;
};

const LABELS: Record<RefundReconciliationState, string> = {
  not_checked: "Refund reconciliation not checked",
  not_marked_refunded: "Not marked refunded",
  stripe_refunded: "Stripe refund confirmed",
  manual_marked_without_stripe_refund: "Manual marked refunded (Stripe not refunded)",
  manual_marked_without_payment_intent: "Manual marked refunded (no Stripe payment intent)",
  stripe_check_failed: "Stripe refund check failed",
};

function centsToDollars(value?: number | null) {
  if (typeof value !== "number") return null;
  return Math.round(value) / 100;
}

export function normalizeStripeChargeCurrency(value?: string | null) {
  const normalized = value?.toString().trim().toLowerCase();
  return normalized || null;
}

export function formatRefundReconciliationLabel(state: RefundReconciliationState) {
  return LABELS[state];
}

export function buildRefundReconciliation({
  manualStatus,
  manualMarkedRefundedAt,
  manualMarkedByUid,
  manualMarkedByEmail,
  stripePaymentIntentId,
  paymentIntent,
  stripeCheckFailedMessage,
  now,
}: BuildRefundReconciliationInput): OrderRefundReconciliation {
  const charge = paymentIntent?.latest_charge ?? null;
  const refundIds = (charge?.refunds?.data ?? [])
    .map((refund) => refund.id?.toString().trim())
    .filter((id): id is string => Boolean(id));
  const amountCapturedCents =
    charge?.amount_captured ?? paymentIntent?.amount_received ?? null;
  const amountRefundedCents = charge?.amount_refunded ?? null;
  const normalizedCurrency =
    normalizeStripeChargeCurrency(charge?.currency) ??
    normalizeStripeChargeCurrency(paymentIntent?.currency) ??
    null;

  const base: OrderRefundReconciliation = {
    state: "not_checked",
    manualStatus: manualStatus ?? null,
    manualMarkedRefundedAt: manualMarkedRefundedAt ?? null,
    manualMarkedByUid: manualMarkedByUid ?? null,
    manualMarkedByEmail: manualMarkedByEmail ?? null,
    stripePaymentIntentId: stripePaymentIntentId ?? null,
    stripeChargeId: charge?.id ?? null,
    stripeAmountRefunded: centsToDollars(amountRefundedCents),
    stripeAmountCaptured: centsToDollars(amountCapturedCents),
    stripeCurrency: normalizedCurrency,
    stripeRefundCount: refundIds.length,
    stripeRefundIds: refundIds,
    stripeLastCheckedAt: now,
    stripeLastError: stripeCheckFailedMessage ?? null,
  };

  if (manualStatus !== "refunded") {
    return {
      ...base,
      state: "not_marked_refunded",
    };
  }

  if (!stripePaymentIntentId) {
    return {
      ...base,
      state: "manual_marked_without_payment_intent",
    };
  }

  if (stripeCheckFailedMessage) {
    return {
      ...base,
      state: "stripe_check_failed",
    };
  }

  if ((amountRefundedCents ?? 0) > 0) {
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
