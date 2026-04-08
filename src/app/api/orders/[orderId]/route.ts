import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { formatOrderRecordForClient } from "@/lib/orders/formatOrderForClient";
import { requireAuth } from "@/lib/server/requireAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const params = await context.params;
  const orderId = params.orderId;
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  const { auth, error } = await requireAuth(request);
  if (error || !auth) {
    return error ?? NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = adminDb();
  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const data = snap.data() as { userId?: string | null; id?: string };
  if (data.userId && data.userId !== auth.uid) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({
    order: formatOrderRecordForClient({
      ...data,
      id: data.id ?? orderId,
      orderId,
    }),
  });
}
