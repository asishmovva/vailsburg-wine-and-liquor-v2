import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const adminDbMock = vi.fn();
const sendOrderNotificationMock = vi.fn();
const logEventMock = vi.fn();
const logErrorMock = vi.fn();

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

const transactionUpdateMock = vi.fn();
const userOrderSetMock = vi.fn();

let currentOrderData: Record<string, unknown>;
let replacementProductData: Record<string, unknown>;

const orderRef = { __collection: "orders", id: "order-1" };
const replacementRef = { __collection: "products", id: "replacement-1" };

const dbInstance = {
  runTransaction: vi.fn(async (callback: (transaction: unknown) => Promise<void>) => {
    await callback({
      get: vi.fn(async (ref: { __collection?: string; id?: string }) => {
        if (ref.__collection === "orders") {
          return {
            exists: true,
            data: () => currentOrderData,
          };
        }

        if (ref.__collection === "products") {
          return {
            exists: true,
            data: () => replacementProductData,
          };
        }

        throw new Error(`Unexpected transaction.get ref: ${String(ref?.id)}`);
      }),
      update: transactionUpdateMock,
    });
  }),
  collection: vi.fn((name: string) => {
    if (name === "orders") {
      return {
        doc: vi.fn(() => orderRef),
      };
    }

    if (name === "products") {
      return {
        doc: vi.fn(() => replacementRef),
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
  return new Request(
    "http://localhost/api/admin/orders/order-1/items/line-0-product-1/exception",
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH /api/admin/orders/[orderId]/items/[itemId]/exception", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentOrderData = {
      userId: "user-1",
      status: "PENDING_STORE",
      fulfillment: "delivery",
      total: 42,
      subtotal: 35,
      tax: 3,
      tip: 4,
      deliveryFee: 0,
      items: [
        {
          lineItemId: "line-0-product-1",
          productId: "product-1",
          name: "Original item",
          price: 12.99,
          qty: 1,
          image: null,
          category: "Beer",
        },
      ],
      adminHistory: [],
      notifications: {},
      paid: true,
    };

    replacementProductData = {
      name: "Replacement item",
      category: "Beer",
      size: "12 OZ",
      pack: "Single",
      price: 10.99,
      stock: 5,
      reservedStock: 0,
      inStock: true,
      isSellableOnline: true,
      image: "https://example.com/replacement.png",
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
  });

  it("marks an item unavailable and records an inventory exception", async () => {
    const { PATCH } = await import(
      "@/app/api/admin/orders/[orderId]/items/[itemId]/exception/route"
    );

    const response = await PATCH(
      makeRequest({
        action: "mark_unavailable",
        reason: "Out of stock",
      }) as never,
      {
        params: Promise.resolve({
          orderId: "order-1",
          itemId: "line-0-product-1",
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        action: "mark_unavailable",
        itemStatus: "unavailable",
      })
    );

    expect(transactionUpdateMock).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        inventoryException: expect.objectContaining({
          hasException: true,
          status: "open",
          summary: "1 item unavailable",
        }),
        adminHistory: expect.arrayContaining([
          expect.objectContaining({
            action: "item_marked_unavailable",
            reason: "Out of stock",
          }),
        ]),
      })
    );
    expect(sendOrderNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        eventKey: "ORDER_UPDATED",
        forceResend: true,
      })
    );
  });

  it("stores a validated replacement snapshot", async () => {
    const { PATCH } = await import(
      "@/app/api/admin/orders/[orderId]/items/[itemId]/exception/route"
    );

    const response = await PATCH(
      makeRequest({
        action: "replace_item",
        replacementProductId: "replacement-1",
        replacementQty: 1,
        note: "Customer approved replacement by phone",
      }) as never,
      {
        params: Promise.resolve({
          orderId: "order-1",
          itemId: "line-0-product-1",
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        action: "replace_item",
        itemStatus: "replaced",
      })
    );

    expect(transactionUpdateMock).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            fulfillmentStatus: "replaced",
            replacement: expect.objectContaining({
              productId: "replacement-1",
              name: "Replacement item",
              price: 10.99,
            }),
          }),
        ]),
        inventoryException: expect.objectContaining({
          hasException: true,
          status: "resolved",
        }),
      })
    );
  });

  it("tracks manual refund pending and then completed without Stripe automation", async () => {
    const { PATCH } = await import(
      "@/app/api/admin/orders/[orderId]/items/[itemId]/exception/route"
    );

    const pendingResponse = await PATCH(
      makeRequest({
        action: "mark_refund_pending",
        amount: 12.99,
        note: "Item unavailable",
      }) as never,
      {
        params: Promise.resolve({
          orderId: "order-1",
          itemId: "line-0-product-1",
        }),
      }
    );

    expect(pendingResponse.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            fulfillmentStatus: "refund_pending",
            refund: expect.objectContaining({
              amount: 12.99,
              status: "pending",
            }),
          }),
        ]),
      })
    );

    currentOrderData = {
      ...currentOrderData,
      items: [
        {
          lineItemId: "line-0-product-1",
          productId: "product-1",
          name: "Original item",
          price: 12.99,
          qty: 1,
          image: null,
          category: "Beer",
          fulfillmentStatus: "refund_pending",
          refund: {
            amount: 12.99,
            status: "pending",
            note: "Item unavailable",
          },
        },
      ],
    };
    transactionUpdateMock.mockClear();

    const completedResponse = await PATCH(
      makeRequest({
        action: "mark_refund_completed",
        note: "Refund processed manually in Stripe dashboard",
      }) as never,
      {
        params: Promise.resolve({
          orderId: "order-1",
          itemId: "line-0-product-1",
        }),
      }
    );

    expect(completedResponse.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      orderRef,
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            fulfillmentStatus: "refunded",
            refund: expect.objectContaining({
              amount: 12.99,
              status: "completed",
              note: "Refund processed manually in Stripe dashboard",
            }),
          }),
        ]),
      })
    );
  });

  it("rejects refund amounts above the original item total", async () => {
    const { PATCH } = await import(
      "@/app/api/admin/orders/[orderId]/items/[itemId]/exception/route"
    );

    const response = await PATCH(
      makeRequest({
        action: "mark_refund_pending",
        amount: 25,
        note: "Too much",
      }) as never,
      {
        params: Promise.resolve({
          orderId: "order-1",
          itemId: "line-0-product-1",
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Refund amount cannot exceed the original item total.",
    });
    expect(transactionUpdateMock).not.toHaveBeenCalled();
  });
});
