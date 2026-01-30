import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderData = {
  status?: string;
  userId?: string | null;
  items?: Array<{ productId: string; qty: number }>;
  total?: number;
  fulfillment?: "delivery" | "pickup";
  fulfillmentStatus?: string;
  pos?: {
    pushStatus?: string;
    attempts?: number;
    posOrderId?: string | null;
  };
  createdAt?: unknown;
  stripe?: {
    paymentIntentId?: string;
    checkoutSessionId?: string;
  };
};

function buildPosQueueUpdate(order: OrderData) {
  const existing = order.pos ?? {};
  if (existing.pushStatus === "pushed" || existing.posOrderId) {
    return existing;
  }
  return {
    pushStatus: "queued",
    attempts: typeof existing.attempts === "number" ? existing.attempts : 0,
    posOrderId: existing.posOrderId ?? null,
  };
}

function isFinalStatus(status?: string) {
  return status === "paid" || status === "failed" || status === "cancelled" || status === "fulfilled";
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

  if (isFinalStatus(order.status)) {
    return NextResponse.json({ status: order.status, updated: false });
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
  } catch {
    return NextResponse.json(
      { status: order.status ?? "payment_pending", updated: false },
      { status: 200 }
    );
  }

  if (!isPaid) {
    return NextResponse.json({ status: order.status ?? "payment_pending", updated: false });
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
      status: "paid",
      inventoryWarning,
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      fulfillmentStatus: order.fulfillmentStatus ?? "processing",
      pos: buildPosQueueUpdate(order),
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
          status: "paid",
          total: order.total ?? 0,
          fulfillment: order.fulfillment ?? "pickup",
          fulfillmentStatus: order.fulfillmentStatus ?? "processing",
          posPushStatus: order.pos?.pushStatus ?? "queued",
          createdAt: order.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  console.log("[orders:verify]", {
    orderId,
    status: "paid",
    paymentIntentId: paymentIntentId ?? null,
    checkoutSessionId: checkoutSessionId ?? null,
  });

  return NextResponse.json({ status: "paid", updated: true });
}
