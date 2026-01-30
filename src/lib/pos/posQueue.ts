import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { mapOrderToSypramPayload } from "@/lib/sypram/orderMapper";
import { pushSypramOrder } from "@/lib/sypram/ordersClient";

const MAX_ATTEMPTS = 5;

type PosState = {
  pushStatus?: "not_pushed" | "queued" | "pushing" | "pushed" | "failed";
  pushedAt?: FirebaseFirestore.Timestamp | null;
  lastAttemptAt?: FirebaseFirestore.Timestamp | null;
  attempts?: number;
  error?: string | null;
  posOrderId?: string | null;
  posReceiptNo?: string | null;
};

type OrderRecord = {
  id?: string;
  orderId?: string;
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  fulfillment?: "delivery" | "pickup";
  delivery?: { address?: string | null } | null;
  subtotal?: number;
  taxableSubtotal?: number;
  tax?: number;
  total?: number;
  deliveryFee?: number;
  tip?: number;
  items?: Array<{
    productId: string;
    name: string;
    price: number;
    qty: number;
    sku?: string | null;
    upc?: string | null;
  }>;
  status?: string;
  fulfillmentStatus?: string;
  pos?: PosState;
  updatedAt?: FirebaseFirestore.Timestamp;
};

function isPosPushEnabled() {
  return process.env.POS_PUSH_ENABLED === "true";
}

function normalizePosState(pos?: PosState) {
  return {
    pushStatus: pos?.pushStatus ?? "not_pushed",
    attempts: typeof pos?.attempts === "number" ? pos.attempts : 0,
    posOrderId: pos?.posOrderId ?? null,
    posReceiptNo: pos?.posReceiptNo ?? null,
  };
}

function buildMissingSkuError(items: OrderRecord["items"]) {
  const missing = (items ?? []).filter((item) => !item.sku && !item.upc);
  if (!missing.length) return null;
  const names = missing.map((item) => item.name ?? item.productId).slice(0, 3);
  return `Missing SKU/UPC for items: ${names.join(", ")}`;
}

async function claimOrderForPush(
  orderRef: FirebaseFirestore.DocumentReference
): Promise<{ orderData: OrderRecord | null; skippedReason: string | null }> {
  let orderData: OrderRecord | null = null;
  let skippedReason: string | null = null;

  await adminDb().runTransaction(async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists) {
      skippedReason = "not_found";
      return;
    }

    const data = snap.data() as OrderRecord;
    const pos = normalizePosState(data.pos);

    if (data.status !== "paid") {
      skippedReason = "not_paid";
      return;
    }

    if (pos.pushStatus === "pushed" || pos.posOrderId) {
      skippedReason = "already_pushed";
      return;
    }

    if (pos.pushStatus === "pushing") {
      skippedReason = "in_progress";
      return;
    }

    if (pos.attempts >= MAX_ATTEMPTS) {
      skippedReason = "max_attempts";
      return;
    }

    orderData = { ...data, id: data.id ?? snap.id, pos };

    transaction.update(orderRef, {
      "pos.pushStatus": "pushing",
      "pos.attempts": pos.attempts + 1,
      "pos.lastAttemptAt": FieldValue.serverTimestamp(),
    });
  });

  return { orderData, skippedReason };
}

async function updateOrderPointer(orderId: string, order: OrderRecord, updates: Record<string, unknown>) {
  if (!order.userId) return;
  const pointerRef = adminDb()
    .collection("users")
    .doc(order.userId)
    .collection("orders")
    .doc(orderId);
  await pointerRef.set(
    {
      orderId,
      fulfillment: order.fulfillment ?? "pickup",
      total: order.total ?? 0,
      updatedAt: FieldValue.serverTimestamp(),
      ...updates,
    },
    { merge: true }
  );
}

export async function pushOrderToPOS(orderId: string) {
  if (!isPosPushEnabled()) {
    return { ok: false, skipped: true, reason: "disabled" } as const;
  }

  const db = adminDb();
  const orderRef = db.collection("orders").doc(orderId);
  const { orderData, skippedReason } = await claimOrderForPush(orderRef);

  if (!orderData) {
    return { ok: false, skipped: true, reason: skippedReason ?? "unknown" } as const;
  }

  const missingSkuError = buildMissingSkuError(orderData.items);
  if (missingSkuError) {
    await orderRef.update({
      "pos.pushStatus": "failed",
      "pos.error": missingSkuError,
      "pos.lastAttemptAt": FieldValue.serverTimestamp(),
    });
    await updateOrderPointer(orderId, orderData, { posPushStatus: "failed" });
    console.log("[pos:push]", {
      orderId,
      attempts: orderData.pos?.attempts ?? 0,
      error: missingSkuError,
    });
    return { ok: false, skipped: false, error: missingSkuError } as const;
  }

  try {
    const payload = mapOrderToSypramPayload({
      id: orderData.id ?? orderId,
      orderId,
      email: orderData.email ?? null,
      userId: orderData.userId ?? null,
      phone: orderData.phone ?? null,
      fulfillment: orderData.fulfillment ?? "pickup",
      delivery: orderData.delivery ?? null,
      subtotal: orderData.subtotal ?? 0,
      taxableSubtotal: orderData.taxableSubtotal ?? orderData.subtotal ?? 0,
      tax: orderData.tax ?? 0,
      total: orderData.total ?? 0,
      deliveryFee: orderData.deliveryFee ?? 0,
      tip: orderData.tip ?? 0,
      items: orderData.items ?? [],
    });

    const result = await pushSypramOrder(payload);

    const nextFulfillment =
      orderData.fulfillmentStatus && orderData.fulfillmentStatus !== "processing"
        ? orderData.fulfillmentStatus
        : "accepted";

    await orderRef.update({
      "pos.pushStatus": "pushed",
      "pos.error": null,
      "pos.pushedAt": FieldValue.serverTimestamp(),
      "pos.posOrderId": result.posOrderId ?? null,
      "pos.posReceiptNo": result.posReceiptNo ?? null,
      fulfillmentStatus: nextFulfillment,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await updateOrderPointer(orderId, orderData, {
      fulfillmentStatus: nextFulfillment,
      posPushStatus: "pushed",
      status: orderData.status ?? "paid",
    });

    console.log("[pos:push]", {
      orderId,
      result: "pushed",
      posOrderId: result.posOrderId ?? null,
    });

    return { ok: true } as const;
  } catch (error) {
    const message = (error as Error).message ?? "POS push failed.";
    await orderRef.update({
      "pos.pushStatus": "failed",
      "pos.error": message,
      "pos.lastAttemptAt": FieldValue.serverTimestamp(),
    });
    await updateOrderPointer(orderId, orderData, { posPushStatus: "failed" });
    console.log("[pos:push]", {
      orderId,
      attempts: orderData.pos?.attempts ?? 0,
      error: message,
    });
    return { ok: false, skipped: false, error: message } as const;
  }
}

export async function fetchPosQueueSummary() {
  const db = adminDb();
  const ordersRef = db.collection("orders");

  const queuedSnap = await ordersRef
    .where("pos.pushStatus", "==", "queued")
    .limit(50)
    .get();
  const failedSnap = await ordersRef
    .where("pos.pushStatus", "==", "failed")
    .limit(50)
    .get();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pushedTodaySnap = await ordersRef
    .where("pos.pushStatus", "==", "pushed")
    .where("pos.pushedAt", ">=", today)
    .limit(50)
    .get();

  const recentSnap = await ordersRef
    .orderBy("updatedAt", "desc")
    .limit(20)
    .get();

  const recent = recentSnap.docs.map((doc) => {
    const data = doc.data() as OrderRecord;
    return {
      orderId: doc.id,
      status: data.status ?? "unknown",
      fulfillmentStatus: data.fulfillmentStatus ?? "processing",
      total: data.total ?? 0,
      pos: {
        pushStatus: data.pos?.pushStatus ?? "not_pushed",
        attempts: data.pos?.attempts ?? 0,
        lastAttemptAt: data.pos?.lastAttemptAt?.toDate?.()?.toISOString() ?? null,
        error: data.pos?.error ?? null,
      },
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  return {
    counts: {
      queued: queuedSnap.size,
      failed: failedSnap.size,
      pushedToday: pushedTodaySnap.size,
    },
    recent,
  };
}

export async function processPosQueue(orderId?: string) {
  if (!isPosPushEnabled()) {
    return { ok: false, error: "POS push disabled." } as const;
  }

  const db = adminDb();
  const orderIds: string[] = [];

  if (orderId) {
    orderIds.push(orderId);
  } else {
    const queuedSnap = await db
      .collection("orders")
      .where("pos.pushStatus", "==", "queued")
      .limit(10)
      .get();
    queuedSnap.docs.forEach((doc) => orderIds.push(doc.id));

    if (orderIds.length < 10) {
      const failedSnap = await db
        .collection("orders")
        .where("pos.pushStatus", "==", "failed")
        .limit(10 - orderIds.length)
        .get();
      failedSnap.docs.forEach((doc) => orderIds.push(doc.id));
    }
  }

  const results = [];
  for (const id of orderIds) {
    const result = await pushOrderToPOS(id);
    results.push({ orderId: id, ...result });
  }

  return { ok: true, results } as const;
}
