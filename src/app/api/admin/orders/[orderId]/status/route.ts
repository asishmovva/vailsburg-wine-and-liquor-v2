import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { maybeSendCustomerOrderEmail } from "@/lib/email/orderNotifications";
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
  let reason: string | undefined;
  try {
    const body = (await req.json()) as { status?: string; reason?: string };
    nextStatus = body.status;
    reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
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
    status?: string;
    email?: string | null;
    phone?: string | null;
    customer?: { name?: string | null; phone?: string | null; email?: string | null };
    delivery?: { address?: string; miles?: number; eligible?: boolean } | null;
    subtotal?: number;
    tax?: number;
    tip?: number;
    items?: Array<{
      productId: string;
      name?: string;
      price?: number;
      qty: number;
      image?: string | null;
      category?: string;
    }>;
    notifications?: Record<string, unknown> | null;
  };

  if (nextStatus === ORDER_STATUSES.CANCELLED && !reason) {
    return NextResponse.json(
      { error: "Cancellation reason required." },
      { status: 400 }
    );
  }

  await orderRef.update({
    status: nextStatus,
    cancellationReason:
      nextStatus === ORDER_STATUSES.CANCELLED ? reason ?? null : FieldValue.delete(),
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
          items: orderData.items ?? [],
          createdAt: orderData.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  if (nextStatus === ORDER_STATUSES.READY) {
    await maybeSendCustomerOrderEmail({
      orderId,
      order: {
        ...orderData,
        id: orderId,
        status: nextStatus,
        cancellationReason: null,
      },
      orderRef,
      milestone:
        orderData.fulfillment === "delivery" ? "outForDelivery" : "ready",
    });
  }

  if (nextStatus === ORDER_STATUSES.CANCELLED) {
    await maybeSendCustomerOrderEmail({
      orderId,
      order: {
        ...orderData,
        id: orderId,
        status: nextStatus,
        cancellationReason: reason ?? null,
      },
      orderRef,
      milestone: "cancelled",
    });
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
