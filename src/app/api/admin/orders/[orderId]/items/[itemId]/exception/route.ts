import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  buildInventoryExceptionState,
  buildOrderAdjustmentSummary,
  ensureOrderItemsHaveLineItemIds,
  getOrderItemFulfillmentStatus,
  ORDER_ITEM_FULFILLMENT_STATUSES,
} from "@/lib/orders/inventoryExceptions";
import type {
  OrderAdminHistoryEntry,
  OrderItem,
  OrderNotifications,
} from "@/lib/orders/types";
import { sendOrderNotification } from "@/lib/notifications/sendOrderNotification";
import { logError } from "@/lib/ops/logError";
import { logEvent } from "@/lib/ops/logEvent";
import { adminRateLimit } from "@/lib/server/adminRateLimit";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { resolveProductImage } from "@/services/productImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemExceptionAction =
  | "mark_unavailable"
  | "replace_item"
  | "mark_refund_pending"
  | "mark_refund_completed";

type ExceptionPayload = {
  action?: ItemExceptionAction;
  reason?: string;
  replacementProductId?: string;
  replacementQty?: number;
  note?: string;
  amount?: number;
};

type ReplacementSnapshot = NonNullable<OrderItem["replacement"]>;

type OrderData = {
  userId?: string | null;
  status?: string | null;
  fulfillment?: "delivery" | "pickup";
  total?: number;
  subtotal?: number;
  tax?: number;
  tip?: number;
  deliveryFee?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  paidAt?: unknown;
  paid?: boolean;
  ageVerified?: boolean;
  email?: string | null;
  phone?: string | null;
  customer?: { name?: string | null; phone?: string | null; email?: string | null };
  delivery?: {
    address?: string;
    miles?: number;
    eligible?: boolean;
    instructions?: string | null;
  } | null;
  deliveryInstructions?: string | null;
  items?: OrderItem[];
  notifications?: OrderNotifications | null;
  inventoryException?: {
    hasException: boolean;
    status: "open" | "resolved";
    summary?: string | null;
    updatedAt?: unknown;
    updatedBy?: string | null;
  } | null;
  adjustments?: {
    refundPendingTotal?: number;
    refundCompletedTotal?: number;
    replacementDifference?: number;
  } | null;
  adminHistory?: OrderAdminHistoryEntry[] | null;
};

type ReplacementProductData = {
  name?: string;
  category?: string;
  size?: string;
  pack?: string;
  price?: number;
  stock?: number;
  reservedStock?: number;
  inStock?: boolean;
  isSellableOnline?: boolean;
  image?: string;
  primaryImageUrl?: string;
};

class MutationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQty(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getAvailableStock(product: ReplacementProductData) {
  const stock = Number(product.stock ?? 0);
  const reservedStock = Number(product.reservedStock ?? 0);
  return Math.max(0, stock - reservedStock);
}

function validateRefundAmount(item: OrderItem, amount: number) {
  if (amount <= 0) {
    throw new MutationError("Refund amount must be greater than 0.", 400);
  }

  const itemTotal = Number(item.price ?? 0) * Number(item.qty ?? 0);
  if (amount > itemTotal) {
    throw new MutationError("Refund amount cannot exceed the original item total.", 400);
  }
}

function buildReplacementSnapshot(
  replacementProductId: string,
  replacementQty: number,
  data: ReplacementProductData
): ReplacementSnapshot {
  return {
    productId: replacementProductId,
    name: data.name ?? replacementProductId,
    price: Number(data.price ?? 0),
    size: data.size ?? undefined,
    pack: data.pack ?? undefined,
    qty: replacementQty,
    image: resolveProductImage(data) || null,
    category: data.category ?? "Other",
  };
}

function buildActionErrorPrefix(action: ItemExceptionAction) {
  switch (action) {
    case "mark_unavailable":
      return "Unable to mark item unavailable";
    case "replace_item":
      return "Unable to replace item";
    case "mark_refund_pending":
      return "Unable to mark refund pending";
    case "mark_refund_completed":
      return "Unable to mark refund completed";
    default:
      return "Order item update failed";
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ orderId: string; itemId: string }> }
) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;
  const limited = adminRateLimit("mutate", admin.uid, req);
  if (limited) return limited;

  const { orderId, itemId } = await context.params;
  if (!orderId || !itemId) {
    return NextResponse.json(
      { error: "Missing order item reference." },
      { status: 400 }
    );
  }

  let payload: ExceptionPayload;
  try {
    payload = (await req.json()) as ExceptionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = payload.action;
  if (!action) {
    return NextResponse.json({ error: "Action is required." }, { status: 400 });
  }

  const db = adminDb();
  const orderRef = db.collection("orders").doc(orderId);

  type UpdatedOrderRecord = OrderData & {
    id: string;
    items: OrderItem[];
  };

  let updatedOrder: UpdatedOrderRecord | null = null;

  try {
    await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new MutationError("Order not found.", 404);
      }

      const orderData = orderSnap.data() as OrderData;
      const now = Timestamp.now();
      const existingHistory = Array.isArray(orderData.adminHistory)
        ? orderData.adminHistory
        : [];
      const items = ensureOrderItemsHaveLineItemIds(orderData.items ?? []);
      const itemIndex = items.findIndex((item) => item.lineItemId === itemId);

      if (itemIndex < 0) {
        throw new MutationError("Order item not found.", 404);
      }

      const currentItem = items[itemIndex];
      const currentStatus = getOrderItemFulfillmentStatus(currentItem);
      let nextItem: OrderItem = {
        ...currentItem,
      };
      let historyEntry: OrderAdminHistoryEntry | null = null;
      const actionNote = normalizeText(payload.note) ?? normalizeText(payload.reason) ?? null;

      if (action === "mark_unavailable") {
        const reason = normalizeText(payload.reason);
        if (!reason) {
          throw new MutationError("Exception reason is required.", 400);
        }
        if (currentStatus === ORDER_ITEM_FULFILLMENT_STATUSES.UNAVAILABLE) {
          throw new MutationError("This item is already marked unavailable.", 400);
        }
        if (currentStatus === ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED) {
          throw new MutationError("Refunded items cannot be marked unavailable again.", 400);
        }

        nextItem = {
          ...nextItem,
          fulfillmentStatus: ORDER_ITEM_FULFILLMENT_STATUSES.UNAVAILABLE,
          exceptionReason: reason,
          replacement: null,
        };
        historyEntry = {
          at: now,
          actorUid: admin.uid,
          actorEmail: admin.email,
          action: "item_marked_unavailable",
          itemName: currentItem.name,
          productId: currentItem.productId,
          lineItemId: currentItem.lineItemId ?? null,
          reason,
        };
      }

      if (action === "replace_item") {
        const replacementProductId = normalizeText(payload.replacementProductId);
        if (!replacementProductId) {
          throw new MutationError("Replacement product is required.", 400);
        }
        if (currentStatus === ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED) {
          throw new MutationError("Refunded items cannot be replaced.", 400);
        }

        const replacementRef = db.collection("products").doc(replacementProductId);
        const replacementSnap = await transaction.get(replacementRef);
        if (!replacementSnap.exists) {
          throw new MutationError("Replacement product not found.", 404);
        }

        const replacementData = replacementSnap.data() as ReplacementProductData;
        if (replacementData.isSellableOnline !== true) {
          throw new MutationError("Replacement product is not sellable online.", 400);
        }

        const replacementQty = parseQty(payload.replacementQty, currentItem.qty);
        const availableStock = getAvailableStock(replacementData);
        const inStock =
          typeof replacementData.inStock === "boolean"
            ? replacementData.inStock
            : availableStock > 0;

        if (!inStock || availableStock < replacementQty) {
          throw new MutationError("Replacement product is out of stock.", 400);
        }

        const replacement = buildReplacementSnapshot(
          replacementProductId,
          replacementQty,
          replacementData
        );
        nextItem = {
          ...nextItem,
          fulfillmentStatus: ORDER_ITEM_FULFILLMENT_STATUSES.REPLACED,
          exceptionReason:
            actionNote ?? currentItem.exceptionReason ?? "Replacement selected",
          replacement,
        };
        historyEntry = {
          at: now,
          actorUid: admin.uid,
          actorEmail: admin.email,
          action: "item_replaced",
          itemName: currentItem.name,
          productId: currentItem.productId,
          lineItemId: currentItem.lineItemId ?? null,
          replacementProductId: replacement.productId,
          replacementName: replacement.name,
          reason: actionNote,
        };
      }

      if (action === "mark_refund_pending") {
        const amount = Number(parseAmount(payload.amount).toFixed(2));
        validateRefundAmount(currentItem, amount);
        if (currentStatus === ORDER_ITEM_FULFILLMENT_STATUSES.REFUND_PENDING) {
          throw new MutationError("Refund is already pending for this item.", 400);
        }
        if (currentStatus === ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED) {
          throw new MutationError("Refund is already completed for this item.", 400);
        }

        nextItem = {
          ...nextItem,
          fulfillmentStatus: ORDER_ITEM_FULFILLMENT_STATUSES.REFUND_PENDING,
          refund: {
            amount,
            status: "pending",
            note: actionNote ?? currentItem.refund?.note ?? null,
            markedAt: now,
            markedBy: admin.email ?? admin.uid,
          },
        };
        historyEntry = {
          at: now,
          actorUid: admin.uid,
          actorEmail: admin.email,
          action: "partial_refund_marked_pending",
          itemName: currentItem.name,
          productId: currentItem.productId,
          lineItemId: currentItem.lineItemId ?? null,
          amount,
          reason: actionNote,
        };
      }

      if (action === "mark_refund_completed") {
        const existingRefund = currentItem.refund;
        if (!existingRefund?.amount) {
          throw new MutationError("Refund amount must be marked pending first.", 400);
        }
        if (existingRefund.status === "completed") {
          throw new MutationError("Refund is already completed for this item.", 400);
        }

        nextItem = {
          ...nextItem,
          fulfillmentStatus: ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED,
          refund: {
            ...existingRefund,
            status: "completed",
            note: actionNote ?? existingRefund.note ?? null,
            markedAt: now,
            markedBy: admin.email ?? admin.uid,
          },
        };
        historyEntry = {
          at: now,
          actorUid: admin.uid,
          actorEmail: admin.email,
          action: "partial_refund_marked_completed",
          itemName: currentItem.name,
          productId: currentItem.productId,
          lineItemId: currentItem.lineItemId ?? null,
          amount: Number(existingRefund.amount ?? 0),
          reason: actionNote,
        };
      }

      if (!historyEntry) {
        throw new MutationError("No inventory exception action was applied.", 400);
      }

      const updatedItems = items.map((item, index) =>
        index === itemIndex ? nextItem : item
      );

      const inventoryException = buildInventoryExceptionState({
        items: updatedItems,
        updatedBy: admin.email ?? admin.uid,
        updatedAt: now,
      });
      const adjustments = buildOrderAdjustmentSummary(updatedItems);

      transaction.update(orderRef, {
        items: updatedItems,
        inventoryException,
        adjustments,
        adminHistory: [...existingHistory, historyEntry],
        updatedAt: FieldValue.serverTimestamp(),
      });

      updatedOrder = {
        ...orderData,
        id: orderId,
        items: updatedItems,
        inventoryException,
        adjustments,
        adminHistory: [...existingHistory, historyEntry],
      };
    });
  } catch (error) {
    if (error instanceof MutationError) {
      await logEvent({
        source: "api/admin/orders/item-exception",
        eventType: "ADMIN_ITEM_EXCEPTION_FAIL",
        severity: "warning",
        message: error.message,
        orderId,
        userId: admin.uid,
        details: {
          itemId,
          action,
        },
        persist: true,
      });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    await logError({
      source: "api/admin/orders/item-exception",
      eventType: "ADMIN_ITEM_EXCEPTION_FAIL",
      severity: "error",
      message: `${buildActionErrorPrefix(action)}.`,
      error,
      orderId,
      userId: admin.uid,
      details: {
        itemId,
        action,
      },
      persist: true,
    });
    return NextResponse.json(
      { error: `${buildActionErrorPrefix(action)}. Please try again.` },
      { status: 500 }
    );
  }

  if (!updatedOrder) {
    return NextResponse.json(
      { error: "Order item update failed." },
      { status: 500 }
    );
  }

  const orderAfterUpdate = updatedOrder as UpdatedOrderRecord;

  if (orderAfterUpdate.userId) {
    await db
      .collection("users")
      .doc(orderAfterUpdate.userId)
      .collection("orders")
      .doc(orderId)
      .set(
        {
          orderId,
          status: orderAfterUpdate.status ?? null,
          total: orderAfterUpdate.total ?? 0,
          fulfillment: orderAfterUpdate.fulfillment ?? "pickup",
          items: orderAfterUpdate.items,
          inventoryException: orderAfterUpdate.inventoryException ?? null,
          adjustments: orderAfterUpdate.adjustments ?? null,
          createdAt: orderAfterUpdate.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  const itemAfterUpdate = orderAfterUpdate.items.find(
    (item) => item.lineItemId === itemId
  );
  const itemStatus = getOrderItemFulfillmentStatus(itemAfterUpdate);

  const notificationResult = await Promise.allSettled([
    sendOrderNotification({
      orderId,
      eventKey: "ORDER_UPDATED",
      order: {
        ...orderAfterUpdate,
        id: orderId,
        status: orderAfterUpdate.status ?? undefined,
      },
      orderRef,
      forceResend: true,
    }),
  ]);

  if (notificationResult.some((result) => result.status === "rejected")) {
    await logEvent({
      source: "api/admin/orders/item-exception",
      eventType: "NOTIFICATION_SEND_FAILURE",
      severity: "error",
      message: "Item exception notification failed.",
      orderId,
      userId: admin.uid,
      details: {
        itemId,
        action,
      },
      persist: true,
    });
  }

  await logEvent({
    source: "api/admin/orders/item-exception",
    eventType: "ADMIN_ITEM_EXCEPTION_SUCCESS",
    severity: "info",
    message: "Admin item exception update applied.",
    orderId,
    userId: admin.uid,
    details: {
      itemId,
      action,
      itemStatus,
    },
  });

  return NextResponse.json({
    ok: true,
    action,
    itemId,
    itemStatus,
    inventoryException: orderAfterUpdate.inventoryException ?? null,
    adjustments: orderAfterUpdate.adjustments ?? null,
  });
}
