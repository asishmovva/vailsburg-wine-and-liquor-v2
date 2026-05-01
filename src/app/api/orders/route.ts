import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { formatOrderRecordForClient } from "@/lib/orders/formatOrderForClient";
import { requireAuth } from "@/lib/server/requireAuth";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { auth, error } = await requireAuth(req);
  if (error || !auth) return error ?? new Response("Unauthorized", { status: 401 });

  const limited = rateLimit(`orders-list:${auth.uid}`, req, {
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) {
    const retryAfter = limited.headers.get("Retry-After");
    return NextResponse.json(
      {
        error: "Too many requests. Please wait before refreshing orders.",
        code: "rate_limited",
      },
      {
        status: 429,
        headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
      }
    );
  }

  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 100)
    : 50;

  const snapshot = await adminDb()
    .collection("users")
    .doc(auth.uid)
    .collection("orders")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const orders = snapshot.docs.map((doc) =>
    formatOrderRecordForClient({
      orderId: doc.id,
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    })
  );

  return NextResponse.json({ orders });
}

