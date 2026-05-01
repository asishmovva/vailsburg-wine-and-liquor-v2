import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.fn();
const adminDbMock = vi.fn();
const formatOrderRecordForClientMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock("@/lib/server/requireAuth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: adminDbMock,
}));

vi.mock("@/lib/orders/formatOrderForClient", () => ({
  formatOrderRecordForClient: formatOrderRecordForClientMock,
}));

vi.mock("@/lib/server/rateLimit", () => ({
  rateLimit: rateLimitMock,
}));

const ordersGetMock = vi.fn();

const dbInstance = {
  collection: vi.fn((name: string) => {
    if (name !== "users") {
      throw new Error(`Unexpected collection: ${name}`);
    }
    return {
      doc: vi.fn((uid: string) => ({
        collection: vi.fn((subName: string) => {
          if (subName !== "orders") {
            throw new Error(`Unexpected subcollection: ${subName}`);
          }
          return {
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: () => ordersGetMock(uid),
              })),
            })),
          };
        }),
      })),
    };
  }),
};

function makeRequest(url = "http://localhost/api/orders?limit=10") {
  return new Request(url, { method: "GET" });
}

describe("GET /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({
      auth: { uid: "user-1", email: "user@example.com", name: "User" },
      error: null,
    });
    adminDbMock.mockReturnValue(dbInstance);
    rateLimitMock.mockReturnValue(null);
    ordersGetMock.mockResolvedValue({
      docs: [
        {
          id: "order-1",
          data: () => ({ status: "NEW", total: 12 }),
        },
      ],
    });
    formatOrderRecordForClientMock.mockImplementation((input: unknown) => input);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    rateLimitMock.mockReturnValue(new Response("Too many requests", { status: 429 }));

    const { GET } = await import("@/app/api/orders/route");
    const response = await GET(makeRequest() as never);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests. Please wait before refreshing orders.",
      code: "rate_limited",
    });
    expect(ordersGetMock).not.toHaveBeenCalled();
  });

  it("returns formatted orders for authenticated users", async () => {
    const { GET } = await import("@/app/api/orders/route");
    const response = await GET(makeRequest() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      orders: [
        expect.objectContaining({
          id: "order-1",
          orderId: "order-1",
        }),
      ],
    });
  });
});
