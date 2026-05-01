import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyIdTokenMock = vi.fn();
const adminAuthMock = vi.fn();
const adminDbMock = vi.fn();
const getStripeMock = vi.fn();
const resolveProductImageMock = vi.fn();
const logEventMock = vi.fn();
const logErrorMock = vi.fn();
const getFulfillmentAvailabilityMock = vi.fn();

vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: adminAuthMock,
  adminDb: adminDbMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

vi.mock("@/services/productImage", () => ({
  resolveProductImage: resolveProductImageMock,
}));

vi.mock("@/lib/ops/logEvent", () => ({
  logEvent: logEventMock,
}));

vi.mock("@/lib/ops/logError", () => ({
  logError: logErrorMock,
}));

vi.mock("@/lib/checkout/storeAvailability", () => ({
  getFulfillmentAvailability: getFulfillmentAvailabilityMock,
}));

const existingAttemptGetMock = vi.fn();
const cleanupReservationsGetMock = vi.fn();
const productGetByIdMock = vi.fn();
const runTransactionMock = vi.fn();
const transactionGetAllMock = vi.fn();
const transactionUpdateMock = vi.fn();
const transactionSetMock = vi.fn();
const paymentIntentCreateMock = vi.fn();
const paymentIntentRetrieveMock = vi.fn();
const paymentIntentCancelMock = vi.fn();

const orderRef = { id: "order-created" };
const pointerRef = { id: "user-order-pointer" };

const dbInstance = {
  runTransaction: runTransactionMock,
  collection: vi.fn((name: string) => {
    if (name === "orders") {
      return {
        where: vi.fn((field: string) => {
          if (field === "inventoryReservationActive") {
            return {
              limit: vi.fn(() => ({
                get: cleanupReservationsGetMock,
              })),
            };
          }
          if (field === "userId") {
            return {
              where: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: existingAttemptGetMock,
                })),
              })),
            };
          }
          throw new Error(`Unexpected orders.where field: ${field}`);
        }),
        doc: vi.fn(() => orderRef),
      };
    }

    if (name === "products") {
      return {
        doc: vi.fn((productId: string) => ({
          id: productId,
          get: () => productGetByIdMock(productId),
        })),
      };
    }

    if (name === "users") {
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => pointerRef),
          })),
        })),
      };
    }

    throw new Error(`Unexpected collection: ${name}`);
  }),
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/stripe/create-intent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/create-intent integration guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuthMock.mockReturnValue({
      verifyIdToken: verifyIdTokenMock,
    });
    adminDbMock.mockReturnValue(dbInstance);
    getStripeMock.mockReturnValue({
      paymentIntents: {
        create: paymentIntentCreateMock,
        retrieve: paymentIntentRetrieveMock,
        cancel: paymentIntentCancelMock,
      },
      tax: {
        calculations: {
          create: vi.fn(),
        },
      },
    });

    verifyIdTokenMock.mockResolvedValue({
      uid: "user-1",
      email: "user@example.com",
    });
    getFulfillmentAvailabilityMock.mockReturnValue({
      isOpen: true,
      message: null,
      label: "9 AM - 9 PM",
      timeZone: "America/New_York",
    });
    existingAttemptGetMock.mockResolvedValue({
      empty: true,
      docs: [],
    });
    cleanupReservationsGetMock.mockResolvedValue({
      empty: true,
      docs: [],
    });
    productGetByIdMock.mockResolvedValue({
      exists: true,
      data: () => ({
        name: "Cabernet",
        price: 10,
        stock: 2,
        reservedStock: 0,
        isSellableOnline: true,
        taxable: true,
      }),
    });
    paymentIntentCreateMock.mockResolvedValue({
      id: "pi_new",
      client_secret: "secret_new",
    });
    paymentIntentRetrieveMock.mockResolvedValue({
      id: "pi_new",
      status: "requires_payment_method",
    });
    paymentIntentCancelMock.mockResolvedValue({
      id: "pi_new",
      status: "canceled",
    });
    resolveProductImageMock.mockReturnValue(null);
    logEventMock.mockResolvedValue(undefined);
    logErrorMock.mockResolvedValue(undefined);

    runTransactionMock.mockImplementation(async (callback: (transaction: unknown) => Promise<void>) => {
      await callback({
        getAll: transactionGetAllMock,
        update: transactionUpdateMock,
        set: transactionSetMock,
      });
    });

    transactionGetAllMock.mockImplementation(async (...refs: Array<{ id: string }>) =>
      refs.map((ref) => ({
        exists: true,
        ref,
        data: () => ({
          name: "Cabernet",
          price: 10,
          stock: 2,
          reservedStock: 0,
          isSellableOnline: true,
        }),
      }))
    );
  });

  it("blocks checkout outside fulfillment hours before any payment intent work", async () => {
    getFulfillmentAvailabilityMock.mockReturnValue({
      isOpen: false,
      message: "Pickup orders are currently closed.",
      label: "10 AM - 8 PM",
      timeZone: "America/New_York",
    });

    const { POST } = await import("@/app/api/stripe/create-intent/route");

    const response = await POST(
      makeRequest({
        items: [{ productId: "sku-1", qty: 1, expectedPrice: 10 }],
        fulfillment: "pickup",
        idToken: "token-123",
        checkoutAttemptKey: "attempt-1",
        ageVerified: true,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Pickup orders are currently closed.",
      code: "fulfillment_closed",
    });
    expect(paymentIntentCreateMock).not.toHaveBeenCalled();
    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it("rechecks inventory in-transaction to prevent oversell and cancels the intent", async () => {
    productGetByIdMock.mockResolvedValue({
      exists: true,
      data: () => ({
        name: "Cabernet",
        price: 10,
        stock: 1,
        reservedStock: 0,
        isSellableOnline: true,
        taxable: true,
      }),
    });

    transactionGetAllMock.mockResolvedValue([
      {
        exists: true,
        ref: { id: "sku-1" },
        data: () => ({
          name: "Cabernet",
          price: 10,
          stock: 1,
          reservedStock: 1,
          isSellableOnline: true,
        }),
      },
    ]);

    const { POST } = await import("@/app/api/stripe/create-intent/route");

    const response = await POST(
      makeRequest({
        items: [{ productId: "sku-1", qty: 1, expectedPrice: 10 }],
        fulfillment: "pickup",
        idToken: "token-123",
        checkoutAttemptKey: "attempt-race",
        ageVerified: true,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "These items are out of stock: Cabernet",
      code: "items_out_of_stock",
    });
    expect(paymentIntentCreateMock).toHaveBeenCalledTimes(1);
    expect(paymentIntentRetrieveMock).toHaveBeenCalledWith("pi_new");
    expect(paymentIntentCancelMock).toHaveBeenCalledWith("pi_new");
  });
});
