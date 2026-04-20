import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
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

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const payload = await request.text();
  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe:webhook] webhook_error", {
      message: (error as Error).message,
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

  console.log("[stripe:webhook] webhook_verified", {
    eventId,
    eventType,
    orderId: orderIdFromEvent ?? null,
    paymentIntentId: paymentIntentId ?? null,
    checkoutSessionId: checkoutSessionId ?? null,
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
      console.log("[stripe:webhook] order_exists_skip", {
        eventId,
        eventType,
        orderId: orderIdFromEvent ?? null,
      });
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe:webhook] webhook_error", { eventId, eventType, code });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

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
      console.log("[stripe:webhook] order_exists_skip", {
        orderId,
        eventType,
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

    console.log("[stripe:webhook] order_created", {
      orderId,
      eventType,
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
      console.log("[stripe:webhook] order_exists_skip", {
        orderId,
        eventType,
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

    console.log("[stripe:webhook] order_created", {
      orderId,
      eventType,
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
          await orderRef.update({
            status: ORDER_STATUSES.FAILED,
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
          await orderRef.update({
            status: ORDER_STATUSES.CANCELLED,
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
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
