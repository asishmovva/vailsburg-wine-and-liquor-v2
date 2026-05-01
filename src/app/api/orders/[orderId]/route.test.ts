import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.fn();
const adminDbMock = vi.fn();
const rateLimitMock = vi.fn();
const formatOrderRecordForClientMock = vi.fn();

vi.mock("@/lib/server/requireAuth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: adminDbMock,
}));

vi.mock("@/lib/server/rateLimit", () => ({
  rateLimit: rateLimitMock,
}));

vi.mock("@/lib/orders/formatOrderForClient", () => ({
  formatOrderRecordForClient: formatOrderRecordForClientMock,
}));

const orderGetMock = vi.fn();

const dbInstance = {
  collection: vi.fn((name: string) => {
    if (name !== "orders") {
      throw new Error(`Unexpected collection: ${name}`);
    }
    return {
      doc: vi.fn((orderId: string) => ({
        id: orderId,
        get: orderGetMock,
      })),
    };
  }),
};

function makeRequest() {
  return new Request("http://localhost/api/orders/order-1", {
    method: "GET",
  });
}

describe("GET /api/orders/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({
      auth: { uid: "user-1", email: "user@example.com", name: null },
      error: null,
    });
    adminDbMock.mockReturnValue(dbInstance);
    rateLimitMock.mockReturnValue(null);
    formatOrderRecordForClientMock.mockImplementation((order: unknown) => order);
    orderGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        id: "order-1",
        userId: "user-1",
        status: "NEW",
      }),
    });
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockReturnValue(new Response("Too many requests", { status: 429 }));
    const { GET } = await import("@/app/api/orders/[orderId]/route");

    const response = await GET(makeRequest() as never, {
      params: Promise.resolve({ orderId: "order-1" }),
    });

    expect(response.status).toBe(429);
    expect(orderGetMock).not.toHaveBeenCalled();
  });

  it("returns formatted order payload when authorized", async () => {
    const { GET } = await import("@/app/api/orders/[orderId]/route");

    const response = await GET(makeRequest() as never, {
      params: Promise.resolve({ orderId: "order-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      order: expect.objectContaining({
        id: "order-1",
        orderId: "order-1",
      }),
    });
    expect(rateLimitMock).toHaveBeenCalledWith("orders-detail:user-1", expect.anything(), {
      limit: 90,
      windowMs: 60_000,
    });
  });
});
