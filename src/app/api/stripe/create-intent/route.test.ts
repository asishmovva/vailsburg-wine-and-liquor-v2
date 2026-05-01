import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyIdTokenMock = vi.fn();
const adminAuthMock = vi.fn();
const adminDbMock = vi.fn();
const getStripeMock = vi.fn();
const resolveProductImageMock = vi.fn();
const logEventMock = vi.fn();
const logErrorMock = vi.fn();

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

const existingAttemptGetMock = vi.fn();
const paymentIntentRetrieveMock = vi.fn();

const dbInstance = {
  collection: vi.fn((name: string) => {
    if (name !== "orders") {
      throw new Error(`Unexpected collection: ${name}`);
    }

    return {
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: existingAttemptGetMock,
          })),
        })),
      })),
    };
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

describe("POST /api/stripe/create-intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuthMock.mockReturnValue({
      verifyIdToken: verifyIdTokenMock,
    });
    adminDbMock.mockReturnValue(dbInstance);
    getStripeMock.mockReturnValue({
      paymentIntents: {
        retrieve: paymentIntentRetrieveMock,
      },
    });
    resolveProductImageMock.mockReturnValue(null);
    verifyIdTokenMock.mockResolvedValue({
      uid: "user-1",
      email: "user@example.com",
    });
    existingAttemptGetMock.mockResolvedValue({
      empty: true,
      docs: [],
    });
    paymentIntentRetrieveMock.mockResolvedValue({
      id: "pi_123",
      status: "requires_payment_method",
      client_secret: "secret_123",
    });
    logEventMock.mockResolvedValue(undefined);
    logErrorMock.mockResolvedValue(undefined);
  });

  it("rejects an empty cart before any auth or Stripe work", async () => {
    const { POST } = await import("@/app/api/stripe/create-intent/route");

    const response = await POST(
      makeRequest({
        items: [],
        fulfillment: "pickup",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Your cart is empty.",
      code: "empty_cart",
    });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it("requires authentication before starting checkout", async () => {
    const { POST } = await import("@/app/api/stripe/create-intent/route");

    const response = await POST(
      makeRequest({
        items: [{ productId: "sku-1", qty: 1 }],
        fulfillment: "pickup",
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized.",
    });
  });

  it("requires a checkout attempt key after auth succeeds", async () => {
    const { POST } = await import("@/app/api/stripe/create-intent/route");

    const response = await POST(
      makeRequest({
        items: [{ productId: "sku-1", qty: 1 }],
        fulfillment: "pickup",
        idToken: "token-123",
        ageVerified: true,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Checkout session expired. Please try again.",
      code: "missing_checkout_attempt_key",
    });
  });

  it("requires age verification before payment", async () => {
    const { POST } = await import("@/app/api/stripe/create-intent/route");

    const response = await POST(
      makeRequest({
        items: [{ productId: "sku-1", qty: 1 }],
        fulfillment: "pickup",
        idToken: "token-123",
        checkoutAttemptKey: "attempt-1",
        ageVerified: false,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "You must confirm you are 21+ and will present a valid ID.",
      code: "age_verification_required",
    });
  });

  it("reuses an existing pending checkout attempt instead of creating another payment intent", async () => {
    existingAttemptGetMock.mockResolvedValue({
      empty: false,
      docs: [
        {
          ref: { id: "order-123" },
          data: () => ({
            id: "order-123",
            status: "PENDING_PAYMENT",
            stripe: {
              paymentIntentId: "pi_123",
            },
          }),
        },
      ],
    });

    const { POST } = await import("@/app/api/stripe/create-intent/route");

    const response = await POST(
      makeRequest({
        items: [{ productId: "sku-1", qty: 1 }],
        fulfillment: "pickup",
        idToken: "token-123",
        checkoutAttemptKey: "attempt-1",
        ageVerified: true,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      clientSecret: "secret_123",
      orderId: "order-123",
    });
    expect(paymentIntentRetrieveMock).toHaveBeenCalledWith("pi_123");
  });
});
