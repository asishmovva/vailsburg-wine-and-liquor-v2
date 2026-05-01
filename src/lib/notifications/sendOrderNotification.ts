import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendEmailWithFallback } from "@/lib/email";
import { logError } from "@/lib/ops/logError";
import { logEvent } from "@/lib/ops/logEvent";
import {
  buildCustomerOrderEmail,
  buildNewOrderEmail,
  type CustomerOrderEmailMilestone,
  type OrderEmailData,
} from "@/lib/email/orders";
import {
  getNotificationState,
  getNotificationStateKey,
  hasNotificationBeenSent,
  type NotificationEventKey,
} from "@/lib/notifications/events";
import type {
  OrderItem,
  OrderNotifications,
  OrderNotificationSendStatus,
  OrderRefundStatus,
} from "@/lib/orders/types";

const MANUAL_RESEND_COOLDOWN_MS = 60_000;

type OrderNotificationOrder = Omit<OrderEmailData, "items"> & {
  userId?: string | null;
  items?: Array<Pick<
    OrderItem,
    "lineItemId" | "fulfillmentStatus" | "exceptionReason" | "replacement" | "refund"
  > & {
    name?: string;
    qty: number;
    price?: number;
  }>;
  notifications?: OrderNotifications | null;
  alerts?: {
    emailSentAt?: unknown;
    emailLastError?: string | null;
  } | null;
  refundStatus?: OrderRefundStatus | null;
};

type NotificationResponse = {
  ok: boolean;
  status: OrderNotificationSendStatus | "cooldown_blocked";
  provider?: string;
  messageId?: string;
  error?: string;
};

function getSenderAddress() {
  return (
    process.env.STORE_ORDERS_EMAIL_FROM ??
    process.env.SMTP_USER ??
    process.env.SMTP_FALLBACK_USER ??
    ""
  );
}

function getRecipient(
  eventKey: NotificationEventKey,
  order: OrderNotificationOrder
) {
  if (eventKey === "ADMIN_NEW_ORDER_ALERT") {
    return process.env.STORE_ORDERS_EMAIL_TO ?? "";
  }

  return order.customer?.email ?? order.email ?? "";
}

function parseDate(value?: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const seconds =
    (value as { _seconds?: number; seconds?: number })._seconds ??
    (value as { seconds?: number }).seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000);
  }

  return null;
}

function isWithinCooldown(value: unknown, durationMs: number) {
  const date = parseDate(value);
  if (!date) return false;
  return Date.now() - date.getTime() < durationMs;
}

function getCustomerMilestone(
  eventKey: NotificationEventKey
): CustomerOrderEmailMilestone | null {
  switch (eventKey) {
    case "ORDER_RECEIVED":
      return "orderReceived";
    case "PAYMENT_CONFIRMED":
      return "paymentConfirmed";
    case "READY_FOR_PICKUP":
      return "ready";
    case "ORDER_UPDATED":
      return "orderUpdated";
    case "OUT_FOR_DELIVERY":
      return "outForDelivery";
    case "ORDER_COMPLETED":
      return "completed";
    case "ORDER_CANCELLED":
      return "cancelled";
    case "REFUND_MARKED":
      return "refundMarked";
    default:
      return null;
  }
}

function buildEmailPayload(
  eventKey: NotificationEventKey,
  order: OrderNotificationOrder
) {
  if (eventKey === "ADMIN_NEW_ORDER_ALERT") {
    return buildNewOrderEmail({
      ...order,
      items: (order.items ?? []).map((item) => ({
        lineItemId: item.lineItemId,
        name: item.name ?? "Item",
        qty: item.qty,
        price: item.price,
        fulfillmentStatus: item.fulfillmentStatus,
        exceptionReason: item.exceptionReason ?? null,
        replacement: item.replacement
          ? {
              name: item.replacement.name,
              price: item.replacement.price,
              qty: item.replacement.qty,
            }
          : null,
        refund: item.refund
          ? {
              amount: item.refund.amount,
              status: item.refund.status,
              note: item.refund.note ?? null,
            }
          : null,
      })),
    });
  }

  const milestone = getCustomerMilestone(eventKey);
  if (!milestone) {
    throw new Error(`Unsupported notification event: ${eventKey}`);
  }

  return buildCustomerOrderEmail(
    {
      ...order,
      items: (order.items ?? []).map((item) => ({
        lineItemId: item.lineItemId,
        name: item.name ?? "Item",
        qty: item.qty,
        price: item.price,
        fulfillmentStatus: item.fulfillmentStatus,
        exceptionReason: item.exceptionReason ?? null,
        replacement: item.replacement
          ? {
              name: item.replacement.name,
              price: item.replacement.price,
              qty: item.replacement.qty,
            }
          : null,
        refund: item.refund
          ? {
              amount: item.refund.amount,
              status: item.refund.status,
              note: item.refund.note ?? null,
            }
          : null,
      })),
    },
    milestone
  );
}

async function writeNotificationLog({
  orderId,
  eventKey,
  recipient,
  status,
  provider,
  messageId,
  error,
  manual,
  actorUid,
  actorEmail,
}: {
  orderId: string;
  eventKey: NotificationEventKey;
  recipient: string;
  status: OrderNotificationSendStatus;
  provider?: string;
  messageId?: string;
  error?: string;
  manual?: boolean;
  actorUid?: string | null;
  actorEmail?: string | null;
}) {
  try {
    await adminDb()
      .collection("notificationLogs")
      .add({
        orderId,
        eventKey,
        recipient,
        status,
        provider: provider ?? null,
        messageId: messageId ?? null,
        error: error ?? null,
        manual: Boolean(manual),
        actorUid: actorUid ?? null,
        actorEmail: actorEmail ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (logWriteError) {
    await logError({
      source: "notifications/sendOrderNotification",
      eventType: "NOTIFICATION_LOG_WRITE_FAIL",
      severity: "warning",
      message: "Failed to write notification log document.",
      error: logWriteError,
      orderId,
      details: {
        eventKey,
      },
      persist: true,
    });
  }
}

export async function sendOrderNotification({
  orderId,
  eventKey,
  order,
  orderRef,
  forceResend = false,
  manual = false,
  actorUid,
  actorEmail,
}: {
  orderId: string;
  eventKey: NotificationEventKey;
  order?: OrderNotificationOrder;
  orderRef?: FirebaseFirestore.DocumentReference;
  forceResend?: boolean;
  manual?: boolean;
  actorUid?: string | null;
  actorEmail?: string | null;
}): Promise<NotificationResponse> {
  const resolvedOrderRef =
    orderRef ?? adminDb().collection("orders").doc(orderId);

  let orderData = order;
  if (!orderData) {
    const snap = await resolvedOrderRef.get();
    if (!snap.exists) {
      return {
        ok: false,
        status: "failed",
        error: "order_not_found",
      };
    }

    orderData = {
      ...(snap.data() as OrderNotificationOrder),
      id: orderId,
    };
  }

  const notifications = orderData.notifications;
  const stateKey = getNotificationStateKey(eventKey);
  const currentState = getNotificationState(notifications, eventKey);
  const alreadySent =
    eventKey === "ADMIN_NEW_ORDER_ALERT"
      ? Boolean(currentState?.sentAt || orderData.alerts?.emailSentAt)
      : hasNotificationBeenSent(notifications, eventKey);

  const recipient = getRecipient(eventKey, orderData);
  const from = getSenderAddress();

  if (!forceResend && alreadySent) {
    await resolvedOrderRef.update({
      [`notifications.${stateKey}.lastStatus`]: "skipped_duplicate",
      [`notifications.${stateKey}.lastAttemptAt`]: FieldValue.serverTimestamp(),
    });
    await writeNotificationLog({
      orderId,
      eventKey,
      recipient,
      status: "skipped_duplicate",
      provider: currentState?.provider ?? undefined,
      messageId: currentState?.messageId ?? undefined,
      manual,
      actorUid,
      actorEmail,
    });
    await logEvent({
      source: "notifications/sendOrderNotification",
      eventType: "NOTIFICATION_DUPLICATE_SKIP",
      severity: "info",
      message: "Notification skipped because it was already sent.",
      orderId,
      userId: orderData.userId ?? null,
      details: {
        eventKey,
      },
    });
    return {
      ok: true,
      status: "skipped_duplicate",
      provider: currentState?.provider ?? undefined,
      messageId: currentState?.messageId ?? undefined,
    };
  }

  if (
    manual &&
    isWithinCooldown(
      currentState?.lastManualResendAt ?? currentState?.lastAttemptAt,
      MANUAL_RESEND_COOLDOWN_MS
    )
  ) {
    await writeNotificationLog({
      orderId,
      eventKey,
      recipient,
      status: "failed",
      error: "manual_resend_cooldown",
      manual: true,
      actorUid,
      actorEmail,
    });
    await logEvent({
      source: "notifications/sendOrderNotification",
      eventType: "NOTIFICATION_SEND_FAILURE",
      severity: "warning",
      message: "Manual notification resend blocked by cooldown.",
      orderId,
      userId: orderData.userId ?? null,
      details: {
        eventKey,
        reason: "manual_resend_cooldown",
      },
      persist: true,
    });
    return {
      ok: false,
      status: "cooldown_blocked",
      error: "Please wait 60 seconds before resending.",
    };
  }

  if (!recipient || !from) {
    const error =
      !recipient && !from
        ? "missing_sender_and_recipient"
        : !recipient
          ? "missing_recipient"
          : "missing_sender";

    await resolvedOrderRef.update({
      [`notifications.${stateKey}.lastStatus`]: "failed",
      [`notifications.${stateKey}.lastError`]: error,
      [`notifications.${stateKey}.lastAttemptAt`]: FieldValue.serverTimestamp(),
      "notifications.emailLastError": error,
      ...(eventKey === "ADMIN_NEW_ORDER_ALERT"
        ? { "alerts.emailLastError": error }
        : {}),
    });
    await writeNotificationLog({
      orderId,
      eventKey,
      recipient,
      status: "failed",
      error,
      manual,
      actorUid,
      actorEmail,
    });
    await logEvent({
      source: "notifications/sendOrderNotification",
      eventType: "NOTIFICATION_SEND_FAILURE",
      severity: "error",
      message: "Notification sender or recipient is missing.",
      orderId,
      userId: orderData.userId ?? null,
      details: {
        eventKey,
        error,
      },
      persist: true,
    });
    return { ok: false, status: "failed", error };
  }

  const payload = buildEmailPayload(eventKey, orderData);
  const result = await sendEmailWithFallback({
    to: recipient,
    from,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  if (result.ok) {
    const updates: Record<string, unknown> = {
      [`notifications.${stateKey}.lastStatus`]: "sent",
      [`notifications.${stateKey}.lastAttemptAt`]: FieldValue.serverTimestamp(),
      [`notifications.${stateKey}.lastError`]: FieldValue.delete(),
      "notifications.emailLastError": FieldValue.delete(),
    };

    if (!alreadySent) {
      updates[`notifications.${stateKey}.sentAt`] = FieldValue.serverTimestamp();
      updates[`notifications.${stateKey}.provider`] = result.provider ?? null;
      updates[`notifications.${stateKey}.messageId`] = result.messageId ?? null;
    }

    if (manual) {
      updates[`notifications.${stateKey}.lastManualResendAt`] =
        FieldValue.serverTimestamp();
      updates[`notifications.${stateKey}.lastManualProvider`] =
        result.provider ?? null;
      updates[`notifications.${stateKey}.lastManualMessageId`] =
        result.messageId ?? null;
      updates[`notifications.${stateKey}.resendCount`] = FieldValue.increment(1);
    }

    if (eventKey === "ADMIN_NEW_ORDER_ALERT") {
      updates["alerts.emailSentAt"] = FieldValue.serverTimestamp();
      updates["alerts.emailLastError"] = FieldValue.delete();
    }

    await resolvedOrderRef.update(updates);
    await writeNotificationLog({
      orderId,
      eventKey,
      recipient,
      status: "sent",
      provider: result.provider,
      messageId: result.messageId,
      manual,
      actorUid,
      actorEmail,
    });
    await logEvent({
      source: "notifications/sendOrderNotification",
      eventType: "NOTIFICATION_SENT",
      severity: "info",
      message: "Order notification sent.",
      orderId,
      userId: orderData.userId ?? null,
      details: {
        eventKey,
        provider: result.provider ?? null,
      },
    });

    return {
      ok: true,
      status: "sent",
      provider: result.provider,
      messageId: result.messageId,
    };
  }

  const error = result.error ?? "email_send_failed";
  await resolvedOrderRef.update({
    [`notifications.${stateKey}.lastStatus`]: "failed",
    [`notifications.${stateKey}.lastError`]: error,
    [`notifications.${stateKey}.lastAttemptAt`]: FieldValue.serverTimestamp(),
    "notifications.emailLastError": error,
    ...(eventKey === "ADMIN_NEW_ORDER_ALERT"
      ? { "alerts.emailLastError": error }
      : {}),
  });
  await writeNotificationLog({
    orderId,
    eventKey,
    recipient,
    status: "failed",
    provider: result.provider,
    messageId: result.messageId,
    error,
    manual,
    actorUid,
    actorEmail,
  });
  const allAttemptsFailed =
    Array.isArray(result.attempts) && result.attempts.length > 0
      ? result.attempts.every((attempt) => !attempt.ok)
      : true;
  await logEvent({
    source: "notifications/sendOrderNotification",
    eventType: "NOTIFICATION_SEND_FAILURE",
    severity: "error",
    message: "Order notification failed to send.",
    orderId,
    userId: orderData.userId ?? null,
    details: {
      eventKey,
      provider: result.provider ?? null,
      error,
      attempts: result.attempts ?? null,
      allAttemptsFailed,
    },
    persist: true,
  });

  return {
    ok: false,
    status: "failed",
    provider: result.provider,
    messageId: result.messageId,
    error,
  };
}
