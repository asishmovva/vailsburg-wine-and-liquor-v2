import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  buildReservationReleaseStock,
  getReservedStock,
} from "@/lib/checkout/inventoryReservations";
import { logError } from "@/lib/ops/logError";
import { logEvent } from "@/lib/ops/logEvent";
import type { OrderNotifications } from "@/lib/orders/types";
import { sendOrderNotification } from "@/lib/notifications/sendOrderNotification";
import { getStripe } from "@/lib/stripe";
import { ORDER_STATUSES } from "@/lib/orders/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderData = {
  status?: string;
  userId?: string | null;
  items?: Array<{
    productId: string;
    name?: string;
    price?: number;
    qty: number;
    image?: string | null;
    category?: string;
  }>;
  total?: number;
  subtotal?: number;
  tax?: number;
  tip?: number;
  fulfillment?: "delivery" | "pickup";
  delivery?: { address?: string; miles?: number; eligible?: boolean } | null;
  email?: string | null;
  phone?: string | null;
  customer?: { name?: string | null; phone?: string | null; email?: string | null };
  alerts?: { emailSentAt?: unknown; emailLastError?: string | null };
  notifications?: OrderNotifications | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  paidAt?: unknown;
  stripe?: { paymentIntentId?: string; checkoutSessionId?: string };
  inventoryReservationActive?: boolean | null;
  reservationExpiresAt?: unknown;
};

function buildPointer(orderId: string, order: OrderData) {
  return {
    orderId,
    status: ORDER_STATUSES.NEW,
    total: order.total ?? 0,
    fulfillment: order.fulfillment ?? "pickup",
    createdAt: order.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    items: order.items ?? [],
  };
}

function buildCommittedInventoryUpdate(currentStock: number, currentReserved: number, qty: number) {
  const updatedStock = Math.max(currentStock - qty, 0);
  const updatedReserved = buildReservationReleaseStock(currentReserved, qty);
  return {
    stock: updatedStock,
    reservedStock: updatedReserved,
    inStock: updatedStock > 0,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function buildReleasedInventoryUpdate(currentStock: number, currentReserved: number, qty: number) {
  const updatedReserved = buildReservationReleaseStock(currentReserved, qty);
  return {
    reservedStock: updatedReserved,
    inStock: currentStock > 0,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    await logEvent({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_SECRET_MISSING",
      severity: "critical",
      message: "STRIPE_WEBHOOK_SECRET is missing.",
      persist: true,
    });
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    await logEvent({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_SIGNATURE_MISSING",
      severity: "warning",
      message: "Stripe webhook signature header missing.",
      persist: true,
    });
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const payload = await request.text();
  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    await logError({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_SIGNATURE_VERIFICATION_FAIL",
      severity: "error",
      message: "Stripe webhook signature verification failed.",
      error,
      persist: true,
    });
    return NextResponse.json(
      { error: `Webhook Error: ${(error as Error).message}` },
      { status: 400 }
    );
  }

  const db = adminDb();
  const eventId = event.id as string;
  const eventType = event.type as string;

  let orderIdFromEvent: string | undefined;
  let paymentIntentId: string | undefined;
  let checkoutSessionId: string | undefined;

  if (eventType.startsWith("payment_intent.")) {
    const intent = event.data.object as { id: string; metadata?: Record<string, string> };
    paymentIntentId = intent.id;
    orderIdFromEvent = intent.metadata?.orderId;
  }

  if (eventType === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      payment_intent?: string | null;
      metadata?: Record<string, string>;
    };
    checkoutSessionId = session.id;
    paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : paymentIntentId;
    orderIdFromEvent = session.metadata?.orderId;
  }

  await logEvent({
    source: "api/stripe/webhook",
    eventType: "WEBHOOK_VERIFIED",
    severity: "info",
    message: "Stripe webhook verified.",
    orderId: orderIdFromEvent ?? null,
    details: {
      eventId,
      eventType,
      paymentIntentId: paymentIntentId ?? null,
      checkoutSessionId: checkoutSessionId ?? null,
    },
  });

  const eventRef = db.collection("stripeEvents").doc(eventId);
  try {
    await eventRef.create({
      eventId,
      type: eventType,
      orderId: orderIdFromEvent ?? null,
      paymentIntentId: paymentIntentId ?? null,
      checkoutSessionId: checkoutSessionId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const code = (error as { code?: string | number }).code;
    if (code === 6 || code === "already-exists") {
      await logEvent({
        source: "api/stripe/webhook",
        eventType: "WEBHOOK_DUPLICATE_EVENT_SKIP",
        severity: "info",
        message: "Duplicate webhook event skipped.",
        orderId: orderIdFromEvent ?? null,
        details: {
          eventId,
          eventType,
        },
      });
      return NextResponse.json({ received: true, duplicate: true });
    }
    await logError({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_IDEMPOTENCY_WRITE_FAIL",
      severity: "critical",
      message: "Failed to persist Stripe webhook idempotency marker.",
      error,
      orderId: orderIdFromEvent ?? null,
      details: {
        eventId,
        eventType,
        code: code ?? null,
      },
      persist: true,
    });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  try {

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      payment_status?: string;
      payment_intent?: string | null;
      metadata?: Record<string, string>;
    };
    const orderId = session.metadata?.orderId;
    if (!orderId) {
      return NextResponse.json({ received: true });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ received: true });
    }

    const orderData = orderSnap.data() as OrderData;
    if (
      orderData.status === ORDER_STATUSES.NEW ||
      orderData.status === ORDER_STATUSES.ACCEPTED ||
      orderData.status === ORDER_STATUSES.READY ||
      orderData.status === ORDER_STATUSES.COMPLETED
    ) {
      if (orderData.userId) {
        await db
          .collection("users")
          .doc(orderData.userId)
          .collection("orders")
          .doc(orderId)
          .set(buildPointer(orderId, orderData), { merge: true });
      }
      await logEvent({
        source: "api/stripe/webhook",
        eventType: "WEBHOOK_ORDER_EXISTS_SKIP",
        severity: "info",
        message: "Order already transitioned; webhook mutation skipped.",
        orderId,
        details: {
          eventType,
        },
      });
      return NextResponse.json({ received: true });
    }

    const items = orderData.items ?? [];
    let inventoryWarning = false;
    const intentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : orderData.stripe?.paymentIntentId;

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
        const data = productSnap.data() as { stock?: number; reservedStock?: number };
        const currentStock = Number(data.stock ?? 0);
        const currentReserved = getReservedStock(data);
        if (
          (orderData.inventoryReservationActive === true && currentReserved < item.qty) ||
          (orderData.inventoryReservationActive !== true && currentStock - item.qty < 0)
        ) {
          inventoryWarning = true;
        }

        transaction.update(
          productSnap.ref,
          buildCommittedInventoryUpdate(currentStock, currentReserved, item.qty)
        );
      });

      transaction.update(orderRef, {
        status: ORDER_STATUSES.NEW,
        paid: true,
        inventoryWarning,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        inventoryReservationActive: false,
        reservationReleasedAt: FieldValue.serverTimestamp(),
        reservationReleaseReason: "payment_confirmed",
        reservationExpiresAt: null,
        stripe: {
          paymentIntentId: intentId ?? null,
          checkoutSessionId: session.id,
        },
      });

      if (orderData.userId) {
        const pointerRef = db
          .collection("users")
          .doc(orderData.userId)
          .collection("orders")
          .doc(orderId);
        transaction.set(pointerRef, buildPointer(orderId, orderData), {
          merge: true,
        });
      }
    });

    const refreshedOrderData: OrderData & { id: string } = {
      id: orderId,
      ...orderData,
      status: ORDER_STATUSES.NEW,
      paidAt: orderData.paidAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      stripe: {
        paymentIntentId: intentId ?? undefined,
        checkoutSessionId: session.id,
      },
    };

    await Promise.allSettled([
      sendOrderNotification({
        orderId,
        order: refreshedOrderData,
        orderRef,
        eventKey: "ADMIN_NEW_ORDER_ALERT",
      }),
      sendOrderNotification({
        orderId,
        order: refreshedOrderData,
        orderRef,
        eventKey: "ORDER_RECEIVED",
      }),
    ]);

    await logEvent({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_ORDER_CREATED",
      severity: "info",
      message: "Order marked paid from checkout.session.completed.",
      orderId,
      details: {
        eventType,
      },
    });

    return NextResponse.json({ received: true });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as {
      id: string;
      metadata?: Record<string, string>;
      charges?: { data?: Array<{ receipt_url?: string | null }> };
    };
    const orderId = intent.metadata?.orderId;
    if (!orderId) {
      return NextResponse.json({ received: true });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ received: true });
    }

    const orderData = orderSnap.data() as OrderData;
    if (
      orderData.stripe?.paymentIntentId &&
      orderData.stripe.paymentIntentId !== intent.id
    ) {
      return NextResponse.json({ received: true });
    }

    if (
      orderData.status === ORDER_STATUSES.NEW ||
      orderData.status === ORDER_STATUSES.ACCEPTED ||
      orderData.status === ORDER_STATUSES.READY ||
      orderData.status === ORDER_STATUSES.COMPLETED
    ) {
      if (orderData.userId) {
        await db
          .collection("users")
          .doc(orderData.userId)
          .collection("orders")
          .doc(orderId)
          .set(buildPointer(orderId, orderData), { merge: true });
      }
      await logEvent({
        source: "api/stripe/webhook",
        eventType: "WEBHOOK_ORDER_EXISTS_SKIP",
        severity: "info",
        message: "Order already transitioned; webhook mutation skipped.",
        orderId,
        details: {
          eventType,
        },
      });
      return NextResponse.json({ received: true });
    }

    const items = orderData.items ?? [];
    let inventoryWarning = false;
    const receiptUrl = intent.charges?.data?.[0]?.receipt_url ?? null;

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
        const data = productSnap.data() as { stock?: number; reservedStock?: number };
        const currentStock = Number(data.stock ?? 0);
        const currentReserved = getReservedStock(data);
        if (
          (orderData.inventoryReservationActive === true && currentReserved < item.qty) ||
          (orderData.inventoryReservationActive !== true && currentStock - item.qty < 0)
        ) {
          inventoryWarning = true;
        }

        transaction.update(
          productSnap.ref,
          buildCommittedInventoryUpdate(currentStock, currentReserved, item.qty)
        );
      });

      transaction.update(orderRef, {
        status: ORDER_STATUSES.NEW,
        paid: true,
        inventoryWarning,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        inventoryReservationActive: false,
        reservationReleasedAt: FieldValue.serverTimestamp(),
        reservationReleaseReason: "payment_confirmed",
        reservationExpiresAt: null,
        stripe: {
          paymentIntentId: intent.id,
          receiptUrl,
        },
      });

      if (orderData.userId) {
        const pointerRef = db
          .collection("users")
          .doc(orderData.userId)
          .collection("orders")
          .doc(orderId);
        transaction.set(pointerRef, buildPointer(orderId, orderData), {
          merge: true,
        });
      }
    });

    const refreshedOrderData: OrderData & { id: string } = {
      id: orderId,
      ...orderData,
      status: ORDER_STATUSES.NEW,
      paidAt: orderData.paidAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      stripe: {
        paymentIntentId: intent.id,
      },
    };

    await Promise.allSettled([
      sendOrderNotification({
        orderId,
        order: refreshedOrderData,
        orderRef,
        eventKey: "ADMIN_NEW_ORDER_ALERT",
      }),
      sendOrderNotification({
        orderId,
        order: refreshedOrderData,
        orderRef,
        eventKey: "ORDER_RECEIVED",
      }),
    ]);

    await logEvent({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_ORDER_CREATED",
      severity: "info",
      message: "Order marked paid from payment_intent.succeeded.",
      orderId,
      details: {
        eventType,
      },
    });

    return NextResponse.json({ received: true });
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as { metadata?: Record<string, string> };
    const orderId = intent.metadata?.orderId;
    if (orderId) {
      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists) {
        const orderData = orderSnap.data() as OrderData;
        if (
          orderData.status !== ORDER_STATUSES.NEW &&
          orderData.status !== ORDER_STATUSES.ACCEPTED &&
          orderData.status !== ORDER_STATUSES.READY &&
          orderData.status !== ORDER_STATUSES.COMPLETED
        ) {
          const items = orderData.items ?? [];
          await db.runTransaction(async (transaction) => {
            const productRefs = items.map((item) =>
              db.collection("products").doc(item.productId)
            );
            const productSnaps = productRefs.length
              ? await transaction.getAll(...productRefs)
              : [];

            productSnaps.forEach((productSnap, index) => {
              if (!productSnap.exists || orderData.inventoryReservationActive !== true) return;
              const item = items[index];
              const data = productSnap.data() as { stock?: number; reservedStock?: number };
              const currentStock = Number(data.stock ?? 0);
              const currentReserved = getReservedStock(data);
              transaction.update(
                productSnap.ref,
                buildReleasedInventoryUpdate(currentStock, currentReserved, item.qty)
              );
            });

            transaction.update(orderRef, {
              status: ORDER_STATUSES.FAILED,
              updatedAt: FieldValue.serverTimestamp(),
              inventoryReservationActive: false,
              reservationReleasedAt: FieldValue.serverTimestamp(),
              reservationReleaseReason: "payment_failed",
              reservationExpiresAt: null,
            });
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
                  status: ORDER_STATUSES.FAILED,
                  total: orderData.total ?? 0,
                  fulfillment: orderData.fulfillment ?? "pickup",
                  items: orderData.items ?? [],
                  createdAt: orderData.createdAt ?? FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
          }
        }
      }
    }
    await logEvent({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_PAYMENT_FAILED_EVENT",
      severity: "warning",
      message: "Processed payment_intent.payment_failed webhook.",
      orderId: orderId ?? null,
      details: {
        eventType,
      },
      persist: true,
    });
    return NextResponse.json({ received: true });
  }

  if (event.type === "payment_intent.canceled") {
    const intent = event.data.object as { metadata?: Record<string, string> };
    const orderId = intent.metadata?.orderId;
    if (orderId) {
      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists) {
        const orderData = orderSnap.data() as OrderData;
        if (
          orderData.status !== ORDER_STATUSES.NEW &&
          orderData.status !== ORDER_STATUSES.ACCEPTED &&
          orderData.status !== ORDER_STATUSES.READY &&
          orderData.status !== ORDER_STATUSES.COMPLETED
        ) {
          const items = orderData.items ?? [];
          await db.runTransaction(async (transaction) => {
            const productRefs = items.map((item) =>
              db.collection("products").doc(item.productId)
            );
            const productSnaps = productRefs.length
              ? await transaction.getAll(...productRefs)
              : [];

            productSnaps.forEach((productSnap, index) => {
              if (!productSnap.exists || orderData.inventoryReservationActive !== true) return;
              const item = items[index];
              const data = productSnap.data() as { stock?: number; reservedStock?: number };
              const currentStock = Number(data.stock ?? 0);
              const currentReserved = getReservedStock(data);
              transaction.update(
                productSnap.ref,
                buildReleasedInventoryUpdate(currentStock, currentReserved, item.qty)
              );
            });

            transaction.update(orderRef, {
              status: ORDER_STATUSES.CANCELLED,
              updatedAt: FieldValue.serverTimestamp(),
              inventoryReservationActive: false,
              reservationReleasedAt: FieldValue.serverTimestamp(),
              reservationReleaseReason: "payment_canceled",
              reservationExpiresAt: null,
            });
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
                  status: ORDER_STATUSES.CANCELLED,
                  total: orderData.total ?? 0,
                  fulfillment: orderData.fulfillment ?? "pickup",
                  items: orderData.items ?? [],
                  createdAt: orderData.createdAt ?? FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
          }
        }
      }
    }
    await logEvent({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_PAYMENT_CANCELED_EVENT",
      severity: "warning",
      message: "Processed payment_intent.canceled webhook.",
      orderId: orderId ?? null,
      details: {
        eventType,
      },
      persist: true,
    });
    return NextResponse.json({ received: true });
  }

  await logEvent({
    source: "api/stripe/webhook",
    eventType: "WEBHOOK_EVENT_IGNORED",
    severity: "info",
    message: "Unsupported Stripe webhook event ignored.",
    orderId: orderIdFromEvent ?? null,
    details: {
      eventType,
      eventId,
    },
  });

  return NextResponse.json({ received: true });
  } catch (error) {
    await logError({
      source: "api/stripe/webhook",
      eventType: "WEBHOOK_PROCESSING_FAIL",
      severity: "critical",
      message: "Unhandled Stripe webhook processing failure.",
      error,
      orderId: orderIdFromEvent ?? null,
      userId: undefined,
      details: {
        eventId,
        eventType,
      },
      persist: true,
    });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
