import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set<string>([
  ORDER_STATUSES.ACCEPTED,
  ORDER_STATUSES.READY,
  ORDER_STATUSES.COMPLETED,
  ORDER_STATUSES.CANCELLED,
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { orderId } = await context.params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  let nextStatus: string | undefined;
  try {
    const body = (await req.json()) as { status?: string };
    nextStatus = body.status;
  } catch {
    nextStatus = undefined;
  }

  if (!nextStatus || !ALLOWED_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const db = adminDb();
  const orderRef = db.collection("orders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const orderData = orderSnap.data() as {
    userId?: string | null;
    total?: number;
    fulfillment?: "delivery" | "pickup";
    createdAt?: unknown;
  };

  await orderRef.update({
    status: nextStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (orderData.userId) {
    await db
      .collection("users")
      .doc(orderData.userId)
      .collection("orders")
      .doc(orderId)
      .set(
        {
          orderId,
          status: nextStatus,
          total: orderData.total ?? 0,
          fulfillment: orderData.fulfillment ?? "pickup",
          createdAt: orderData.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
