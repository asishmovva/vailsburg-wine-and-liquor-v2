import { getMissedNotificationCandidates } from "@/lib/notifications/events";
import type {
  OrderNotificationStateRecord,
  OrderNotifications,
  OrderRecord,
} from "@/lib/orders/types";

export type NotificationHealthFilter =
  | "all"
  | "needs_attention"
  | "failed"
  | "missed";

const NOTIFICATION_STATE_KEYS: Array<keyof OrderNotifications> = [
  "orderReceived",
  "paymentConfirmed",
  "readyForPickup",
  "outForDelivery",
  "completed",
  "cancelled",
  "refundMarked",
  "adminNewOrderAlert",
];

function hasFailedNotificationState(
  state?: OrderNotificationStateRecord | null
) {
  if (!state) return false;
  return state.lastStatus === "failed" || Boolean(state.lastError);
}

export function hasFailedNotificationSignals(
  order: Pick<OrderRecord, "notifications" | "alerts">
) {
  if (order.notifications?.emailLastError || order.alerts?.emailLastError) {
    return true;
  }

  return NOTIFICATION_STATE_KEYS.some((stateKey) =>
    hasFailedNotificationState(
      order.notifications?.[stateKey] as OrderNotificationStateRecord | null
    )
  );
}

export function hasMissedNotificationSignals(
  order: Pick<OrderRecord, "status" | "fulfillment" | "notifications">
) {
  return getMissedNotificationCandidates(order).length > 0;
}

export function getFirstMissedNotificationCandidate(
  order: Pick<OrderRecord, "status" | "fulfillment" | "notifications">
) {
  return getMissedNotificationCandidates(order)[0] ?? null;
}

export function hasNotificationFailure(
  order: Pick<OrderRecord, "notifications" | "alerts">
) {
  return hasFailedNotificationSignals(order);
}

export function hasNotificationAttention(
  order: Pick<OrderRecord, "status" | "fulfillment" | "notifications" | "alerts">
) {
  return (
    hasFailedNotificationSignals(order) || hasMissedNotificationSignals(order)
  );
}

export function matchesNotificationHealthFilter(
  order: Pick<
    OrderRecord,
    "status" | "fulfillment" | "notifications" | "alerts"
  >,
  filter: NotificationHealthFilter
) {
  const hasFailed = hasFailedNotificationSignals(order);
  const hasMissed = hasMissedNotificationSignals(order);

  switch (filter) {
    case "failed":
      return hasFailed;
    case "missed":
      return hasMissed;
    case "needs_attention":
      return hasFailed || hasMissed;
    case "all":
    default:
      return true;
  }
}

export function summarizeNotificationHealth(
  orders: Array<
    Pick<OrderRecord, "status" | "fulfillment" | "notifications" | "alerts">
  >
) {
  let failed = 0;
  let missed = 0;
  let needsAttention = 0;

  for (const order of orders) {
    const hasFailed = hasFailedNotificationSignals(order);
    const hasMissed = hasMissedNotificationSignals(order);
    if (hasFailed) failed += 1;
    if (hasMissed) missed += 1;
    if (hasFailed || hasMissed) needsAttention += 1;
  }

  return {
    all: orders.length,
    failed,
    missed,
    needsAttention,
  };
}
