import { NextResponse, type NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/ops/logError";
import { logEvent } from "@/lib/ops/logEvent";
import { sendOrderNotification } from "@/lib/notifications/sendOrderNotification";
import {
  ADMIN_ORDER_STATUSES,
  canTransitionAdminOrderStatus,
  getCanonicalNextAdminStatus,
} from "@/lib/orders/adminStatusTransitions";
import type {
  OrderAdminHistoryEntry,
  OrderNotifications,
  OrderRefundStatus,
} from "@/lib/orders/types";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_REFUND_STATUSES = new Set<OrderRefundStatus>([
  "not_requested",
  "requested",
  "manual_pending",
  "refunded",
]);

class MutationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

type OrderData = {
  userId?: string | null;
  total?: number;
  fulfillment?: "delivery" | "pickup";
  createdAt?: unknown;
  updatedAt?: unknown;
  paidAt?: unknown;
  paid?: boolean;
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
  notifications?: OrderNotifications | null;
  adminHistory?: OrderAdminHistoryEntry[] | null;
  refundStatus?: OrderRefundStatus | null;
  refundNote?: string | null;
  fulfillmentStatus?: string | null;
  cancellationReason?: string | null;
};

function isPaidOrder(order: OrderData) {
  return Boolean(order.paidAt || order.paid);
}

function normalizeOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  const { orderId } = await context.params;
  if (!orderId) {
    await logEvent({
      source: "api/admin/orders/status",
      eventType: "ADMIN_ORDER_MUTATION_FAIL",
      severity: "warning",
      message: "Missing orderId for admin status mutation.",
      userId: admin.uid,
      persist: true,
    });
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  let nextStatusInput: string | undefined;
  let reason: string | undefined;
  let refundStatus: OrderRefundStatus | undefined;
  let refundNote: string | undefined;

  try {
    const body = (await req.json()) as {
      status?: string;
      reason?: string;
      refundStatus?: OrderRefundStatus;
      refundNote?: string;
    };
    nextStatusInput = body.status;
    reason = normalizeOptionalText(body.reason);
    refundStatus = body.refundStatus;
    refundNote = normalizeOptionalText(body.refundNote);
  } catch {
    nextStatusInput = undefined;
  }

  const nextStatus = nextStatusInput
    ? getCanonicalNextAdminStatus(nextStatusInput)
    : null;

  if (!nextStatus && !refundStatus) {
    return NextResponse.json(
      { error: "Status or refund update required." },
      { status: 400 }
    );
  }

  if (refundStatus && !ALLOWED_REFUND_STATUSES.has(refundStatus)) {
    return NextResponse.json({ error: "Invalid refund status." }, { status: 400 });
  }

  const db = adminDb();
  const orderRef = db.collection("orders").doc(orderId);

  let updatedOrder: OrderData | null = null;

  try {
    await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new MutationError("Order not found.", 404);
      }

      const orderData = orderSnap.data() as OrderData;
      const currentStatus = orderData.status;
      const fulfillment = orderData.fulfillment ?? "pickup";
      const existingHistory = Array.isArray(orderData.adminHistory)
        ? orderData.adminHistory
        : [];
      const historyEntries: OrderAdminHistoryEntry[] = [];
      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (nextStatus) {
        if (
          !canTransitionAdminOrderStatus({
            currentStatus,
            nextStatus,
            fulfillment,
          })
        ) {
          throw new MutationError(
            `Cannot change order from ${currentStatus ?? "unknown"} to ${nextStatus}.`,
            400
          );
        }

        if (nextStatus === ADMIN_ORDER_STATUSES.CANCELLED && !reason) {
          throw new MutationError("Cancellation reason required.", 400);
        }

        updates.status = nextStatus;
        updates.fulfillmentStatus = nextStatus;
        updates.statusUpdatedAt = Timestamp.now();

        if (nextStatus === ADMIN_ORDER_STATUSES.CANCELLED) {
          updates.cancellationReason = reason ?? null;
          updates.cancelReason = reason ?? null;
          updates.cancelledAt = Timestamp.now();
          updates.cancelledBy = admin.uid;
        }

        historyEntries.push({
          at: Timestamp.now(),
          actorUid: admin.uid,
          actorEmail: admin.email,
          action: nextStatus === ADMIN_ORDER_STATUSES.CANCELLED ? "cancel" : "status_change",
          from: currentStatus ?? null,
          to: nextStatus,
          reason: nextStatus === ADMIN_ORDER_STATUSES.CANCELLED ? reason ?? null : null,
        });
      }

      if (refundStatus) {
        if (!isPaidOrder(orderData)) {
          throw new MutationError(
            "Refund markers are only allowed for paid orders.",
            400
          );
        }

        if (nextStatus !== ADMIN_ORDER_STATUSES.CANCELLED && currentStatus !== ADMIN_ORDER_STATUSES.CANCELLED) {
          throw new MutationError(
            "Refund markers are only allowed for cancelled orders.",
            400
          );
        }

        updates.refundStatus = refundStatus;
        updates.refundNote = refundNote ?? null;
        if (refundStatus === "refunded") {
          updates.refundedAt = Timestamp.now();
        }

        historyEntries.push({
          at: Timestamp.now(),
          actorUid: admin.uid,
          actorEmail: admin.email,
          action: "refund_marked",
          from: orderData.refundStatus ?? null,
          to: refundStatus,
          reason: refundNote ?? null,
        });
      }

      updates.adminHistory = [...existingHistory, ...historyEntries];
      transaction.update(orderRef, updates);

      updatedOrder = {
        ...orderData,
        status: (updates.status as string | undefined) ?? orderData.status,
        fulfillmentStatus:
          (updates.fulfillmentStatus as string | undefined) ??
          orderData.fulfillmentStatus,
        cancellationReason:
          (updates.cancellationReason as string | null | undefined) ??
          orderData.cancellationReason,
        refundStatus:
          (updates.refundStatus as OrderRefundStatus | undefined) ??
          orderData.refundStatus,
        refundNote:
          (updates.refundNote as string | null | undefined) ?? orderData.refundNote,
        adminHistory: [...existingHistory, ...historyEntries],
      };
    });
  } catch (error) {
    if (error instanceof MutationError) {
      await logEvent({
        source: "api/admin/orders/status",
        eventType: "ADMIN_ORDER_MUTATION_FAIL",
        severity: "warning",
        message: error.message,
        orderId,
        userId: admin.uid,
        details: {
          statusCode: error.statusCode,
          nextStatus: nextStatus ?? null,
          refundStatus: refundStatus ?? null,
        },
        persist: true,
      });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    await logError({
      source: "api/admin/orders/status",
      eventType: "ADMIN_ORDER_MUTATION_FAIL",
      severity: "error",
      message: "Unhandled admin order status mutation failure.",
      error,
      orderId,
      userId: admin.uid,
      details: {
        nextStatus: nextStatus ?? null,
        refundStatus: refundStatus ?? null,
      },
      persist: true,
    });
    return NextResponse.json({ error: "Order update failed." }, { status: 500 });
  }

  if (!updatedOrder) {
    await logEvent({
      source: "api/admin/orders/status",
      eventType: "ADMIN_ORDER_MUTATION_FAIL",
      severity: "error",
      message: "Order update returned no updated payload.",
      orderId,
      userId: admin.uid,
      persist: true,
    });
    return NextResponse.json({ error: "Order update failed." }, { status: 500 });
  }

  const orderAfterUpdate = updatedOrder as OrderData & {
    status?: string;
    refundStatus?: OrderRefundStatus | null;
    cancellationReason?: string | null;
    fulfillmentStatus?: string | null;
  };

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
          items: orderAfterUpdate.items ?? [],
          createdAt: orderAfterUpdate.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  const notificationTasks: Promise<unknown>[] = [];

  if (nextStatus === ADMIN_ORDER_STATUSES.READY_FOR_PICKUP) {
    notificationTasks.push(
      sendOrderNotification({
        orderId,
        order: {
          ...orderAfterUpdate,
          id: orderId,
          status: nextStatus,
        },
        orderRef,
        eventKey: "READY_FOR_PICKUP",
      })
    );
  }

  if (nextStatus === ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY) {
    notificationTasks.push(
      sendOrderNotification({
        orderId,
        order: {
          ...orderAfterUpdate,
          id: orderId,
          status: nextStatus,
        },
        orderRef,
        eventKey: "OUT_FOR_DELIVERY",
      })
    );
  }

  if (nextStatus === ADMIN_ORDER_STATUSES.CANCELLED) {
    notificationTasks.push(
      sendOrderNotification({
        orderId,
        order: {
          ...orderAfterUpdate,
          id: orderId,
          status: nextStatus,
          cancellationReason: reason ?? orderAfterUpdate.cancellationReason ?? null,
        },
        orderRef,
        eventKey: "ORDER_CANCELLED",
      })
    );
  }

  if (nextStatus === ADMIN_ORDER_STATUSES.COMPLETED) {
    notificationTasks.push(
      sendOrderNotification({
        orderId,
        order: {
          ...orderAfterUpdate,
          id: orderId,
          status: nextStatus,
        },
        orderRef,
        eventKey: "ORDER_COMPLETED",
      })
    );
  }

  if (refundStatus === "refunded") {
    notificationTasks.push(
      sendOrderNotification({
        orderId,
        order: {
          ...orderAfterUpdate,
          id: orderId,
          refundStatus,
        },
        orderRef,
        eventKey: "REFUND_MARKED",
      })
    );
  }

  if (notificationTasks.length > 0) {
    const notificationResults = await Promise.allSettled(notificationTasks);
    const failedNotifications = notificationResults.filter(
      (result) => result.status === "rejected"
    );
    if (failedNotifications.length > 0) {
      await logEvent({
        source: "api/admin/orders/status",
        eventType: "NOTIFICATION_SEND_FAILURE",
        severity: "error",
        message: "One or more status-triggered notifications failed.",
        orderId,
        userId: admin.uid,
        details: {
          failedCount: failedNotifications.length,
          nextStatus: nextStatus ?? null,
          refundStatus: refundStatus ?? null,
        },
        persist: true,
      });
    }
  }

  await logEvent({
    source: "api/admin/orders/status",
    eventType: "ADMIN_ORDER_MUTATION_SUCCESS",
    severity: "info",
    message: "Admin order status mutation applied.",
    orderId,
    userId: admin.uid,
    details: {
      status: orderAfterUpdate.status ?? null,
      refundStatus: orderAfterUpdate.refundStatus ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    status: orderAfterUpdate.status ?? null,
    refundStatus: orderAfterUpdate.refundStatus ?? null,
  });
}
