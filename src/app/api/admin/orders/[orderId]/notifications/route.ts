import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  getLatestRelevantNotificationEvent,
  type NotificationEventKey,
} from "@/lib/notifications/events";
import { sendOrderNotification } from "@/lib/notifications/sendOrderNotification";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminRateLimit } from "@/lib/server/adminRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_RESEND_EVENTS = new Set<NotificationEventKey>([
  "ORDER_RECEIVED",
  "ORDER_UPDATED",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "ORDER_COMPLETED",
  "ORDER_CANCELLED",
  "REFUND_MARKED",
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const resendRateLimited = adminRateLimit("mutate", admin.uid, request);
  if (resendRateLimited) return resendRateLimited;

  const { orderId } = await context.params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  let requestedEventKey: NotificationEventKey | undefined;
  try {
    const body = (await request.json()) as { eventKey?: NotificationEventKey };
    requestedEventKey = body.eventKey;
  } catch {
    requestedEventKey = undefined;
  }

  const orderRef = adminDb().collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const orderData = snap.data() as {
    status?: string;
    fulfillment?: "delivery" | "pickup";
  } & Record<string, unknown>;
  const order = {
    id: orderId,
    ...orderData,
  };

  const eventKey =
    requestedEventKey ??
    getLatestRelevantNotificationEvent({
      status: typeof orderData.status === "string" ? orderData.status : undefined,
      fulfillment:
        orderData.fulfillment === "delivery" ? "delivery" : "pickup",
    });

  if (!eventKey || !ALLOWED_RESEND_EVENTS.has(eventKey)) {
    return NextResponse.json(
      { error: "No resendable notification is available for this order." },
      { status: 400 }
    );
  }

  const result = await sendOrderNotification({
    orderId,
    orderRef,
    order,
    eventKey,
    forceResend: true,
    manual: true,
    actorUid: admin.uid,
    actorEmail: admin.email,
  });

  if (result.status === "cooldown_blocked") {
    return NextResponse.json(
      { error: result.error ?? "Please wait before resending again." },
      { status: 429 }
    );
  }

  if (!result.ok && result.status !== "skipped_duplicate") {
    return NextResponse.json(
      { error: "Notification resend failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    eventKey,
    status: result.status,
    provider: result.provider ?? null,
  });
}
