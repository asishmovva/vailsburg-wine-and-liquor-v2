import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_STATUSES } from "@/lib/orders/status";

const adminDbMock = vi.fn();
const getStripeMock = vi.fn();
const logEventMock = vi.fn();
const logErrorMock = vi.fn();
const sendOrderNotificationMock = vi.fn();

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: adminDbMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

vi.mock("@/lib/ops/logEvent", () => ({
  logEvent: logEventMock,
}));

vi.mock("@/lib/ops/logError", () => ({
  logError: logErrorMock,
}));

vi.mock("@/lib/notifications/sendOrderNotification", () => ({
  sendOrderNotification: sendOrderNotificationMock,
}));

const constructEventMock = vi.fn();
const stripeEventCreateMock = vi.fn();
const runTransactionMock = vi.fn();
const transactionGetAllMock = vi.fn();
const transactionUpdateMock = vi.fn();
const transactionSetMock = vi.fn();
const userOrderSetMock = vi.fn();

let orderDataById: Record<string, Record<string, unknown>>;
const orderRefsById = new Map<string, { id: string; get: () => Promise<unknown> }>();
const productRefsById = new Map<string, { id: string }>();

function getOrderRef(orderId: string) {
  const existing = orderRefsById.get(orderId);
  if (existing) {
    return existing;
  }

  const ref = {
    id: orderId,
    get: async () => {
      const data = orderDataById[orderId];
      if (!data) {
        return {
          exists: false,
          data: () => undefined,
        };
      }
      return {
        exists: true,
        data: () => data,
      };
    },
  };

  orderRefsById.set(orderId, ref);
  return ref;
}

function getProductRef(productId: string) {
  const existing = productRefsById.get(productId);
  if (existing) {
    return existing;
  }
  const ref = { id: productId };
  productRefsById.set(productId, ref);
  return ref;
}

const dbInstance = {
  runTransaction: runTransactionMock,
  collection: vi.fn((name: string) => {
    if (name === "stripeEvents") {
      return {
        doc: vi.fn((eventId: string) => ({
          id: eventId,
          create: stripeEventCreateMock,
        })),
      };
    }

    if (name === "orders") {
      return {
        doc: vi.fn((orderId: string) => getOrderRef(orderId)),
      };
    }

    if (name === "products") {
      return {
        doc: vi.fn((productId: string) => getProductRef(productId)),
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

function makeWebhookRequest(payload = "{}", signature = "sig_valid") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
}

describe("POST /api/stripe/webhook integration paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderRefsById.clear();
    productRefsById.clear();
    orderDataById = {};

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    adminDbMock.mockReturnValue(dbInstance);
    getStripeMock.mockReturnValue({
      webhooks: {
        constructEvent: constructEventMock,
      },
    });

    logEventMock.mockResolvedValue(undefined);
    logErrorMock.mockResolvedValue(undefined);
    sendOrderNotificationMock.mockResolvedValue({
      ok: true,
      status: "sent",
    });
    userOrderSetMock.mockResolvedValue(undefined);

    runTransactionMock.mockImplementation(
      async (callback: (transaction: unknown) => Promise<void>) => {
        await callback({
          getAll: transactionGetAllMock,
          update: transactionUpdateMock,
          set: transactionSetMock,
        });
      }
    );

    transactionGetAllMock.mockImplementation(async (...refs: Array<{ id: string }>) =>
      refs.map((ref) => ({
        exists: true,
        ref,
        data: () => ({
          stock: 5,
          reservedStock: 1,
        }),
      }))
    );
  });

  it("returns duplicate=true and skips processing for idempotent duplicate events", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_duplicate",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_duplicate",
          metadata: { orderId: "order-1" },
        },
      },
    });
    stripeEventCreateMock.mockRejectedValue({ code: 6 });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(makeWebhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(runTransactionMock).not.toHaveBeenCalled();
    expect(sendOrderNotificationMock).not.toHaveBeenCalled();
  });

  it("marks a payment_intent.succeeded order as paid and updates inventory once", async () => {
    orderDataById["order-paid"] = {
      status: ORDER_STATUSES.PENDING_PAYMENT,
      userId: "user-1",
      items: [{ productId: "sku-1", qty: 1 }],
      total: 20,
      fulfillment: "pickup",
      inventoryReservationActive: true,
      stripe: { paymentIntentId: "pi_paid" },
    };
    constructEventMock.mockReturnValue({
      id: "evt_paid",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_paid",
          metadata: { orderId: "order-paid" },
          charges: { data: [{ receipt_url: "https://receipt.example/1" }] },
        },
      },
    });
    stripeEventCreateMock.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(makeWebhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(runTransactionMock).toHaveBeenCalledTimes(1);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sku-1" }),
      expect.objectContaining({
        stock: 4,
        reservedStock: 0,
        inStock: true,
      })
    );
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-paid" }),
      expect.objectContaining({
        status: ORDER_STATUSES.NEW,
        paid: true,
        inventoryReservationActive: false,
      })
    );
    expect(transactionSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: "order-paid",
        status: ORDER_STATUSES.NEW,
      }),
      { merge: true }
    );
    expect(sendOrderNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendOrderNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-paid",
        eventKey: "ADMIN_NEW_ORDER_ALERT",
      })
    );
    expect(sendOrderNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-paid",
        eventKey: "ORDER_RECEIVED",
      })
    );
  });

  it("releases reserved inventory on payment_intent.payment_failed", async () => {
    orderDataById["order-failed"] = {
      status: ORDER_STATUSES.PENDING_PAYMENT,
      userId: "user-2",
      items: [{ productId: "sku-2", qty: 1 }],
      total: 16,
      fulfillment: "delivery",
      inventoryReservationActive: true,
    };
    constructEventMock.mockReturnValue({
      id: "evt_failed",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_failed",
          metadata: { orderId: "order-failed" },
        },
      },
    });
    stripeEventCreateMock.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(makeWebhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(runTransactionMock).toHaveBeenCalledTimes(1);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sku-2" }),
      expect.objectContaining({
        reservedStock: 0,
        inStock: true,
      })
    );
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-failed" }),
      expect.objectContaining({
        status: ORDER_STATUSES.FAILED,
        inventoryReservationActive: false,
        reservationReleaseReason: "payment_failed",
      })
    );
    expect(userOrderSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-failed",
        status: ORDER_STATUSES.FAILED,
      }),
      { merge: true }
    );
  });
});
