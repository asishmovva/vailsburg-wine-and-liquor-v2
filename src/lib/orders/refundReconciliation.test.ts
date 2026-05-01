import { describe, expect, it } from "vitest";
import {
  buildRefundReconciliation,
  formatRefundReconciliationLabel,
} from "@/lib/orders/refundReconciliation";

describe("refund reconciliation helpers", () => {
  it("returns not_marked_refunded when manual status is not refunded", () => {
    const result = buildRefundReconciliation({
      manualStatus: "manual_pending",
      manualMarkedRefundedAt: "2026-05-01T12:00:00.000Z",
      manualMarkedByUid: "admin-1",
      manualMarkedByEmail: "admin@example.com",
      stripePaymentIntentId: "pi_123",
      paymentIntent: null,
      stripeCheckFailedMessage: null,
      now: "2026-05-01T12:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: "not_marked_refunded",
        manualStatus: "manual_pending",
      })
    );
  });

  it("returns stripe_refunded when Stripe shows refunded amount", () => {
    const result = buildRefundReconciliation({
      manualStatus: "refunded",
      manualMarkedRefundedAt: "2026-05-01T12:00:00.000Z",
      manualMarkedByUid: "admin-1",
      manualMarkedByEmail: "admin@example.com",
      stripePaymentIntentId: "pi_123",
      paymentIntent: {
        id: "pi_123",
        amount_received: 4200,
        currency: "usd",
        latest_charge: {
          id: "ch_123",
          amount_refunded: 4200,
          amount_captured: 4200,
          currency: "usd",
          refunds: {
            data: [{ id: "re_123" }],
          },
        },
      },
      stripeCheckFailedMessage: null,
      now: "2026-05-01T12:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: "stripe_refunded",
        stripePaymentIntentId: "pi_123",
        stripeChargeId: "ch_123",
        stripeAmountRefunded: 42,
        stripeAmountCaptured: 42,
        stripeCurrency: "usd",
        stripeRefundCount: 1,
        stripeRefundIds: ["re_123"],
      })
    );
  });

  it("returns mismatch when manual refund is marked but Stripe has no refund", () => {
    const result = buildRefundReconciliation({
      manualStatus: "refunded",
      manualMarkedRefundedAt: "2026-05-01T12:00:00.000Z",
      manualMarkedByUid: "admin-1",
      manualMarkedByEmail: "admin@example.com",
      stripePaymentIntentId: "pi_456",
      paymentIntent: {
        id: "pi_456",
        amount_received: 4200,
        currency: "usd",
        latest_charge: {
          id: "ch_456",
          amount_refunded: 0,
          amount_captured: 4200,
          currency: "usd",
          refunds: {
            data: [],
          },
        },
      },
      stripeCheckFailedMessage: null,
      now: "2026-05-01T12:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: "manual_marked_without_stripe_refund",
        stripeAmountRefunded: 0,
        stripeAmountCaptured: 42,
        stripeRefundCount: 0,
      })
    );
  });

  it("returns payment-intent-missing mismatch when manually marked without Stripe intent", () => {
    const result = buildRefundReconciliation({
      manualStatus: "refunded",
      manualMarkedRefundedAt: "2026-05-01T12:00:00.000Z",
      manualMarkedByUid: "admin-1",
      manualMarkedByEmail: "admin@example.com",
      stripePaymentIntentId: null,
      paymentIntent: null,
      stripeCheckFailedMessage: null,
      now: "2026-05-01T12:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: "manual_marked_without_payment_intent",
      })
    );
  });

  it("returns stripe_check_failed when Stripe lookup fails", () => {
    const result = buildRefundReconciliation({
      manualStatus: "refunded",
      manualMarkedRefundedAt: "2026-05-01T12:00:00.000Z",
      manualMarkedByUid: "admin-1",
      manualMarkedByEmail: "admin@example.com",
      stripePaymentIntentId: "pi_789",
      paymentIntent: null,
      stripeCheckFailedMessage: "Stripe timeout",
      now: "2026-05-01T12:00:00.000Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: "stripe_check_failed",
        stripeLastError: "Stripe timeout",
      })
    );
  });

  it("formats concise labels for admin UI", () => {
    expect(formatRefundReconciliationLabel("stripe_refunded")).toBe(
      "Stripe refund confirmed"
    );
    expect(
      formatRefundReconciliationLabel("manual_marked_without_stripe_refund")
    ).toBe("Manual marked refunded (Stripe not refunded)");
  });
});
