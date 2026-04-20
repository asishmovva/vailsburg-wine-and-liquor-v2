import { ORDER_STATUSES } from "@/lib/orders/status";
import { normalizeOrderStatus } from "@/lib/orders/statusMapping";
import type {
  OrderFulfillment,
  OrderNotifications,
  OrderNotificationStateRecord,
  OrderRecord,
} from "@/lib/orders/types";

export type NotificationEventKey =
  | "ORDER_RECEIVED"
  | "PAYMENT_CONFIRMED"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "ORDER_COMPLETED"
  | "ORDER_CANCELLED"
  | "REFUND_MARKED"
  | "ADMIN_NEW_ORDER_ALERT";

export type NotificationStateKey =
  | "orderReceived"
  | "paymentConfirmed"
  | "readyForPickup"
  | "outForDelivery"
  | "completed"
  | "cancelled"
  | "refundMarked"
  | "adminNewOrderAlert";

type NotificationEventConfig = {
  key: NotificationEventKey;
  stateKey: NotificationStateKey;
  dedupeFieldName: string;
  customerFacing: boolean;
  adminFacing: boolean;
  subjectPattern: string;
};

export const ORDER_NOTIFICATION_EVENT_CONFIG: Record<
  NotificationEventKey,
  NotificationEventConfig
> = {
  ORDER_RECEIVED: {
    key: "ORDER_RECEIVED",
    stateKey: "orderReceived",
    dedupeFieldName: "orderReceived",
    customerFacing: true,
    adminFacing: false,
    subjectPattern: "Order received - #{orderNumber}",
  },
  PAYMENT_CONFIRMED: {
    key: "PAYMENT_CONFIRMED",
    stateKey: "paymentConfirmed",
    dedupeFieldName: "paymentConfirmed",
    customerFacing: true,
    adminFacing: false,
    subjectPattern: "Payment confirmed - #{orderNumber}",
  },
  READY_FOR_PICKUP: {
    key: "READY_FOR_PICKUP",
    stateKey: "readyForPickup",
    dedupeFieldName: "readyForPickup",
    customerFacing: true,
    adminFacing: false,
    subjectPattern: "Ready for pickup - #{orderNumber}",
  },
  OUT_FOR_DELIVERY: {
    key: "OUT_FOR_DELIVERY",
    stateKey: "outForDelivery",
    dedupeFieldName: "outForDelivery",
    customerFacing: true,
    adminFacing: false,
    subjectPattern: "Out for delivery - #{orderNumber}",
  },
  ORDER_COMPLETED: {
    key: "ORDER_COMPLETED",
    stateKey: "completed",
    dedupeFieldName: "completed",
    customerFacing: true,
    adminFacing: false,
    subjectPattern: "Order completed - #{orderNumber}",
  },
  ORDER_CANCELLED: {
    key: "ORDER_CANCELLED",
    stateKey: "cancelled",
    dedupeFieldName: "cancelled",
    customerFacing: true,
    adminFacing: false,
    subjectPattern: "Order cancelled - #{orderNumber}",
  },
  REFUND_MARKED: {
    key: "REFUND_MARKED",
    stateKey: "refundMarked",
    dedupeFieldName: "refundMarked",
    customerFacing: true,
    adminFacing: false,
    subjectPattern: "Refund update - #{orderNumber}",
  },
  ADMIN_NEW_ORDER_ALERT: {
    key: "ADMIN_NEW_ORDER_ALERT",
    stateKey: "adminNewOrderAlert",
    dedupeFieldName: "adminNewOrderAlert",
    customerFacing: false,
    adminFacing: true,
    subjectPattern: "New order alert - #{orderNumber}",
  },
};

const LEGACY_SENT_AT_FIELDS: Partial<
  Record<NotificationEventKey, keyof OrderNotifications>
> = {
  ORDER_RECEIVED: "orderReceivedSentAt",
  READY_FOR_PICKUP: "readySentAt",
  OUT_FOR_DELIVERY: "outForDeliverySentAt",
  ORDER_CANCELLED: "cancelledSentAt",
};

export function getNotificationEventConfig(eventKey: NotificationEventKey) {
  return ORDER_NOTIFICATION_EVENT_CONFIG[eventKey];
}

export function getNotificationStateKey(eventKey: NotificationEventKey) {
  return ORDER_NOTIFICATION_EVENT_CONFIG[eventKey].stateKey;
}

export function getLegacyNotificationSentAtField(eventKey: NotificationEventKey) {
  return LEGACY_SENT_AT_FIELDS[eventKey] ?? null;
}

export function getNotificationState(
  notifications: OrderNotifications | null | undefined,
  eventKey: NotificationEventKey
): OrderNotificationStateRecord | null {
  const stateKey = getNotificationStateKey(eventKey);
  return notifications?.[stateKey] ?? null;
}

export function getNotificationSentAt(
  notifications: OrderNotifications | null | undefined,
  eventKey: NotificationEventKey
) {
  const nestedSentAt = getNotificationState(notifications, eventKey)?.sentAt;
  if (nestedSentAt) return nestedSentAt;

  const legacyField = getLegacyNotificationSentAtField(eventKey);
  return legacyField ? notifications?.[legacyField] ?? null : null;
}

export function hasNotificationBeenSent(
  notifications: OrderNotifications | null | undefined,
  eventKey: NotificationEventKey
) {
  if (eventKey === "ADMIN_NEW_ORDER_ALERT") {
    return Boolean(
      getNotificationSentAt(notifications, eventKey)
    );
  }

  return Boolean(getNotificationSentAt(notifications, eventKey));
}

export function getNotificationEventLabel(
  eventKey: NotificationEventKey,
  fulfillment: OrderFulfillment = "pickup"
) {
  switch (eventKey) {
    case "ORDER_RECEIVED":
      return "Order received";
    case "PAYMENT_CONFIRMED":
      return "Payment confirmed";
    case "READY_FOR_PICKUP":
      return "Ready for pickup";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "ORDER_COMPLETED":
      return "Order completed";
    case "ORDER_CANCELLED":
      return "Order cancelled";
    case "REFUND_MARKED":
      return "Refund update";
    case "ADMIN_NEW_ORDER_ALERT":
      return fulfillment === "delivery"
        ? "Admin delivery alert"
        : "Admin pickup alert";
    default:
      return eventKey;
  }
}

export function getRelevantNotificationEvents(order: Pick<OrderRecord, "fulfillment">) {
  const events: NotificationEventKey[] = [
    "ORDER_RECEIVED",
    order.fulfillment === "delivery" ? "OUT_FOR_DELIVERY" : "READY_FOR_PICKUP",
    "ORDER_COMPLETED",
    "ORDER_CANCELLED",
  ];

  return events;
}

export function getLatestRelevantNotificationEvent(
  order: Pick<OrderRecord, "status" | "fulfillment">
): NotificationEventKey | null {
  const normalizedStatus = normalizeOrderStatus(order.status);
  const fulfillment = order.fulfillment ?? "pickup";

  switch (normalizedStatus) {
    case ORDER_STATUSES.READY_FOR_PICKUP:
    case ORDER_STATUSES.READY:
      return fulfillment === "delivery"
        ? "OUT_FOR_DELIVERY"
        : "READY_FOR_PICKUP";
    case ORDER_STATUSES.OUT_FOR_DELIVERY:
      return "OUT_FOR_DELIVERY";
    case ORDER_STATUSES.COMPLETED:
      return "ORDER_COMPLETED";
    case ORDER_STATUSES.CANCELLED:
      return "ORDER_CANCELLED";
    case ORDER_STATUSES.NEW:
    case ORDER_STATUSES.PENDING_STORE:
    case ORDER_STATUSES.PREPARING:
    case ORDER_STATUSES.ACCEPTED:
      return "ORDER_RECEIVED";
    default:
      return null;
  }
}

export function getMissedNotificationCandidates(
  order: Pick<OrderRecord, "status" | "fulfillment" | "notifications">
) {
  const normalizedStatus = normalizeOrderStatus(order.status);
  const candidates: NotificationEventKey[] = [];

  if (
    (normalizedStatus === ORDER_STATUSES.READY ||
      normalizedStatus === ORDER_STATUSES.READY_FOR_PICKUP) &&
    order.fulfillment !== "delivery" &&
    !hasNotificationBeenSent(order.notifications, "READY_FOR_PICKUP")
  ) {
    candidates.push("READY_FOR_PICKUP");
  }

  if (
    normalizedStatus === ORDER_STATUSES.OUT_FOR_DELIVERY &&
    !hasNotificationBeenSent(order.notifications, "OUT_FOR_DELIVERY")
  ) {
    candidates.push("OUT_FOR_DELIVERY");
  }

  if (
    normalizedStatus === ORDER_STATUSES.COMPLETED &&
    !hasNotificationBeenSent(order.notifications, "ORDER_COMPLETED")
  ) {
    candidates.push("ORDER_COMPLETED");
  }

  if (
    normalizedStatus === ORDER_STATUSES.CANCELLED &&
    !hasNotificationBeenSent(order.notifications, "ORDER_CANCELLED")
  ) {
    candidates.push("ORDER_CANCELLED");
  }

  return candidates;
}
