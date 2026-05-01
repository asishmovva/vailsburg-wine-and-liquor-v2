import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const adminDbMock = vi.fn();
const sendOrderNotificationMock = vi.fn();
const logEventMock = vi.fn();
const logErrorMock = vi.fn();
const getStripeMock = vi.fn();
const paymentIntentRetrieveMock = vi.fn();

vi.mock("@/lib/server/requireAdmin", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: adminDbMock,
}));

vi.mock("@/lib/notifications/sendOrderNotification", () => ({
  sendOrderNotification: sendOrderNotificationMock,
}));

vi.mock("@/lib/ops/logEvent", () => ({
  logEvent: logEventMock,
}));

vi.mock("@/lib/ops/logError", () => ({
  logError: logErrorMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

const transactionUpdateMock = vi.fn();
const userOrderSetMock = vi.fn();
const orderRef = { id: "order-1" };

let currentOrderData: Record<string, unknown>;

const dbInstance = {
  runTransaction: vi.fn(async (callback: (transaction: unknown) => Promise<void>) => {
    await callback({
      get: vi.fn(async () => ({
        exists: true,
        data: () => currentOrderData,
      })),
      update: transactionUpdateMock,
    });
  }),
  collection: vi.fn((name: string) => {
    if (name === "orders") {
      return {
        doc: vi.fn(() => orderRef),
      };
    }

    if (name === "users") {
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({
              set: userOrderSetMock,
            })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected collection: ${name}`);
  }),
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/orders/order-1/status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/orders/[orderId]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentOrderData = {
      userId: "user-1",
      total: 42,
      fulfillment: "pickup",
      status: "PENDING_STORE",
      items: [],
      adminHistory: [],
      paid: true,
    };

    requireAdminMock.mockResolvedValue({
      uid: "admin-1",
      email: "admin@example.com",
      error: null,
    });
    adminDbMock.mockReturnValue(dbInstance);
    sendOrderNotificationMock.mockResolvedValue({
      ok: true,
      status: "sent",
    });
    logEventMock.mockResolvedValue(undefined);
    logErrorMock.mockResolvedValue(undefined);
    userOrderSetMock.mockResolvedValue(undefined);
    getStripeMock.mockReturnValue({
      paymentIntents: {
        retrieve: paymentIntentRetrieveMock,
      },
    });
    paymentIntentRetrieveMock.mockResolvedValue({
      id: "pi_123",
      amount_received: 4200,
      currency: "usd",
      charges: {
        data: [
          {
            id: "ch_123",
            amount_refunded: 4200,
            amount_captured: 4200,
            currency: "usd",
            refunds: {
              data: [{ id: "re_123" }],
            },
          },
        ],
      },
    });
  });

  it("rejects invalid transitions server-side", async () => {
    const { POST } = await import("@/app/api/admin/orders/[orderId]/status/route");

    const response = await POST(makeRequest({ status: "COMPLETED" }) as never, {
      params: Promise.resolve({ orderId: "order-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot change order from PENDING_STORE to COMPLETED.",
    });
    expect(transactionUpdateMock).not.toHaveBeenCalled();
    expect(sendOrderNotificationMock).not.toHaveBeenCalled();
  });

  it("requires a cancellation reason", async () => {
    const { POST } = await import("@/app/api/admin/orders/[orderId]/status/route");

    const response = await POST(makeRequest({ status: "CANCELLED" }) as never, {
      params: Promise.resolve({ orderId: "order-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cancellation reason required.",
    });
  });

  it("writes updates and triggers ready notification for a valid pickup transition", async () => {
    currentOrderData = {
      ...currentOrderData,
      status: "ACCEPTED",
      fulfillment: "pickup",
    };

    const { POST } = await import("@/app/api/admin/orders/[orderId]/status/route");

    const response = await POST(
      makeRequest({ status: "READY_FOR_PICKUP" }) as never,
      {
        params: Promise.resolve({ orderId: "order-1" }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "READY_FOR_PICKUP",
      refundStatus: null,
    });

    expect(transactionUpdateMock).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        status: "READY_FOR_PICKUP",
        fulfillmentStatus: "READY_FOR_PICKUP",
        adminHistory: expect.arrayContaining([
          expect.objectContaining({
            actorUid: "admin-1",
            actorEmail: "admin@example.com",
            action: "status_change",
            from: "ACCEPTED",
            to: "READY_FOR_PICKUP",
          }),
        ]),
      })
    );

    expect(sendOrderNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        eventKey: "READY_FOR_PICKUP",
      })
    );
    expect(userOrderSetMock).toHaveBeenCalled();
  });

  it("blocks refund markers for unpaid orders", async () => {
    currentOrderData = {
      ...currentOrderData,
      status: "CANCELLED",
      paid: false,
      paidAt: null,
    };

    const { POST } = await import("@/app/api/admin/orders/[orderId]/status/route");

    const response = await POST(
      makeRequest({ refundStatus: "manual_pending" }) as never,
      {
        params: Promise.resolve({ orderId: "order-1" }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Refund markers are only allowed for paid orders.",
    });
  });

  it("records stripe-backed refund reconciliation when marked refunded", async () => {
    currentOrderData = {
      ...currentOrderData,
      status: "CANCELLED",
      paid: true,
      paidAt: "2026-05-01T12:00:00.000Z",
      stripe: {
        paymentIntentId: "pi_123",
      },
    };

    const { POST } = await import("@/app/api/admin/orders/[orderId]/status/route");
    const response = await POST(
      makeRequest({ refundStatus: "refunded", refundNote: "Processed in Stripe." }) as never,
      {
        params: Promise.resolve({ orderId: "order-1" }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "CANCELLED",
      refundStatus: "refunded",
    });
    expect(paymentIntentRetrieveMock).toHaveBeenCalledWith("pi_123", {
      expand: ["charges.data.refunds"],
    });
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        refundStatus: "refunded",
        refundReconciliation: expect.objectContaining({
          state: "stripe_refunded",
          stripePaymentIntentId: "pi_123",
          stripeChargeId: "ch_123",
          stripeAmountRefunded: 42,
          stripeAmountCaptured: 42,
          stripeCurrency: "usd",
          stripeRefundCount: 1,
          stripeRefundIds: ["re_123"],
        }),
      })
    );
  });

  it("marks manual-only mismatch when refund is marked without Stripe refund evidence", async () => {
    currentOrderData = {
      ...currentOrderData,
      status: "CANCELLED",
      paid: true,
      paidAt: "2026-05-01T12:00:00.000Z",
      stripe: {
        paymentIntentId: "pi_456",
      },
    };
    paymentIntentRetrieveMock.mockResolvedValue({
      id: "pi_456",
      amount_received: 4200,
      currency: "usd",
      charges: {
        data: [
          {
            id: "ch_456",
            amount_refunded: 0,
            amount_captured: 4200,
            currency: "usd",
            refunds: {
              data: [],
            },
          },
        ],
      },
    });

    const { POST } = await import("@/app/api/admin/orders/[orderId]/status/route");
    const response = await POST(
      makeRequest({ refundStatus: "refunded" }) as never,
      {
        params: Promise.resolve({ orderId: "order-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        refundReconciliation: expect.objectContaining({
          state: "manual_marked_without_stripe_refund",
          stripePaymentIntentId: "pi_456",
          stripeAmountRefunded: 0,
          stripeAmountCaptured: 42,
          stripeRefundCount: 0,
        }),
      })
    );
  });
});
