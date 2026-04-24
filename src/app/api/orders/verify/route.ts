import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/ops/logError";
import { logEvent } from "@/lib/ops/logEvent";
import type { OrderNotifications } from "@/lib/orders/types";
import { sendOrderNotification } from "@/lib/notifications/sendOrderNotification";
import { getStripe } from "@/lib/stripe";
import { FINAL_ORDER_STATUSES, ORDER_STATUSES } from "@/lib/orders/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderData = {
  status?: string;
  userId?: string | null;
  items?: Array<{
    productId: string;
    qty: number;
    name?: string;
    price?: number;
    image?: string | null;
    category?: string;
  }>;
  total?: number;
  fulfillment?: "delivery" | "pickup";
  createdAt?: unknown;
  updatedAt?: unknown;
  paidAt?: unknown;
  email?: string | null;
  phone?: string | null;
  customer?: { name?: string | null; phone?: string | null; email?: string | null };
  delivery?: { address?: string; miles?: number; eligible?: boolean } | null;
  subtotal?: number;
  tax?: number;
  tip?: number;
  notifications?: OrderNotifications | null;
  stripe?: {
    paymentIntentId?: string;
    checkoutSessionId?: string;
  };
};

function normalizeStatus(status?: string) {
  if (!status) return ORDER_STATUSES.PENDING_PAYMENT;
  switch (status) {
    case "payment_pending":
      return ORDER_STATUSES.PENDING_PAYMENT;
    case "paid":
      return ORDER_STATUSES.NEW;
    case "fulfilled":
      return ORDER_STATUSES.COMPLETED;
    case "cancelled":
      return ORDER_STATUSES.CANCELLED;
    case "failed":
      return ORDER_STATUSES.FAILED;
    default:
      return status;
  }
}

function isFinalStatus(status?: string) {
  const normalized = normalizeStatus(status);
  return FINAL_ORDER_STATUSES.includes(normalized as (typeof FINAL_ORDER_STATUSES)[number]);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId") ?? "";

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let userId: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    userId = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = adminDb();
  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const order = snap.data() as OrderData;
  if (order.userId && order.userId !== userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await logEvent({
    source: "api/orders/verify",
    eventType: "PAYMENT_VERIFICATION_FALLBACK_TRIGGERED",
    severity: "warning",
    message: "Order verification fallback route triggered.",
    orderId,
    userId,
    details: {
      currentStatus: order.status ?? null,
      hasCheckoutSession: Boolean(order.stripe?.checkoutSessionId),
      hasPaymentIntent: Boolean(order.stripe?.paymentIntentId),
    },
    persist: true,
  });

  const normalizedStatus = normalizeStatus(order.status);
  if (isFinalStatus(normalizedStatus)) {
    return NextResponse.json({ status: normalizedStatus, updated: false });
  }

  const stripe = getStripe();
  let isPaid = false;
  let paymentIntentId = order.stripe?.paymentIntentId;
  const checkoutSessionId = order.stripe?.checkoutSessionId;

  try {
    if (checkoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
      isPaid = session.payment_status === "paid";
      paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : paymentIntentId;
    } else if (paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      isPaid = intent.status === "succeeded";
    }
  } catch (error) {
    await logError({
      source: "api/orders/verify",
      eventType: "PAYMENT_VERIFICATION_PROVIDER_FAIL",
      severity: "error",
      message: "Stripe verification failed during fallback check.",
      error,
      orderId,
      userId,
      persist: true,
    });
    return NextResponse.json({ status: normalizedStatus, updated: false }, { status: 200 });
  }

  if (!isPaid) {
    return NextResponse.json({ status: normalizedStatus, updated: false });
  }

  const items = order.items ?? [];
  let inventoryWarning = false;

  await db.runTransaction(async (transaction) => {
    const productRefs = items.map((item) =>
      db.collection("products").doc(item.productId)
    );
    const productSnaps = productRefs.length
      ? await transaction.getAll(...productRefs)
      : [];

    productSnaps.forEach((productSnap, index) => {
      if (!productSnap.exists) return;
      const item = items[index];
      const data = productSnap.data() as { stock?: number };
      const currentStock = Number(data.stock ?? 0);
      const updatedStock = Math.max(currentStock - item.qty, 0);
      if (currentStock - item.qty < 0) inventoryWarning = true;

      transaction.update(productSnap.ref, {
        stock: updatedStock,
        inStock: updatedStock > 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    transaction.update(orderRef, {
      status: ORDER_STATUSES.NEW,
      paid: true,
      inventoryWarning,
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      stripe: {
        paymentIntentId: paymentIntentId ?? order.stripe?.paymentIntentId ?? null,
        checkoutSessionId: checkoutSessionId ?? order.stripe?.checkoutSessionId ?? null,
      },
    });

    if (order.userId) {
      const pointerRef = db
        .collection("users")
        .doc(order.userId)
        .collection("orders")
        .doc(orderId);
      transaction.set(
        pointerRef,
        {
          orderId,
          status: ORDER_STATUSES.NEW,
          total: order.total ?? 0,
          fulfillment: order.fulfillment ?? "pickup",
          items: order.items ?? [],
          createdAt: order.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  await sendOrderNotification({
    orderId,
    order: {
      ...order,
      id: orderId,
      status: ORDER_STATUSES.NEW,
    },
    orderRef,
    eventKey: "ORDER_RECEIVED",
  });

  await logEvent({
    source: "api/orders/verify",
    eventType: "PAYMENT_VERIFICATION_FALLBACK_COMPLETED",
    severity: "info",
    message: "Fallback verification marked order paid.",
    orderId,
    userId,
    details: {
      status: ORDER_STATUSES.NEW,
      paymentIntentId: paymentIntentId ?? null,
      checkoutSessionId: checkoutSessionId ?? null,
    },
  });

  return NextResponse.json({ status: ORDER_STATUSES.NEW, updated: true });
}
