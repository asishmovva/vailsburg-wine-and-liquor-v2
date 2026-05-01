import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.fn();
const adminDbMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock("@/lib/server/requireAuth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: adminDbMock,
}));

vi.mock("@/lib/server/rateLimit", () => ({
  rateLimit: rateLimitMock,
}));

const orderSetMock = vi.fn();

let currentOrderData: Record<string, unknown>;

const dbInstance = {
  collection: vi.fn((name: string) => {
    if (name !== "orders") {
      throw new Error(`Unexpected collection: ${name}`);
    }

    return {
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists: true,
          data: () => currentOrderData,
        })),
        set: orderSetMock,
      })),
    };
  }),
};

function makeRequest(body?: unknown) {
  return new Request("http://localhost/api/orders/order-1/payment-failure", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
}

describe("POST /api/orders/[orderId]/payment-failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentOrderData = {
      userId: "user-1",
    };
    requireAuthMock.mockResolvedValue({
      auth: {
        uid: "user-1",
        email: "user@example.com",
      },
      error: null,
    });
    adminDbMock.mockReturnValue(dbInstance);
    rateLimitMock.mockReturnValue(null);
    orderSetMock.mockResolvedValue(undefined);
  });

  it("returns 429 when payment failure route is rate limited", async () => {
    rateLimitMock.mockReturnValue(new Response("Too many requests", { status: 429 }));
    const { POST } = await import("@/app/api/orders/[orderId]/payment-failure/route");

    const response = await POST(makeRequest({ message: "Card failed." }) as never, {
      params: Promise.resolve({ orderId: "order-1" }),
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Too many payment failure reports. Please wait and try again.",
      code: "rate_limited",
    });
    expect(orderSetMock).not.toHaveBeenCalled();
  });

  it("records payment failure details for authorized user", async () => {
    const { POST } = await import("@/app/api/orders/[orderId]/payment-failure/route");

    const response = await POST(makeRequest({ message: "Card was declined." }) as never, {
      params: Promise.resolve({ orderId: "order-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(orderSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe: expect.objectContaining({
          lastPaymentFailureMessage: "Card was declined.",
        }),
      }),
      { merge: true }
    );
  });
});
