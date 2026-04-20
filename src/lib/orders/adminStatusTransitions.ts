import { ORDER_STATUSES } from "@/lib/orders/status";
import type { OrderFulfillment } from "@/lib/orders/types";

export const ADMIN_ORDER_STATUSES = {
  PENDING_STORE: ORDER_STATUSES.PENDING_STORE,
  PREPARING: ORDER_STATUSES.PREPARING,
  READY_FOR_PICKUP: ORDER_STATUSES.READY_FOR_PICKUP,
  OUT_FOR_DELIVERY: ORDER_STATUSES.OUT_FOR_DELIVERY,
  COMPLETED: ORDER_STATUSES.COMPLETED,
  CANCELLED: ORDER_STATUSES.CANCELLED,
} as const;

export type AdminOrderStatus =
  (typeof ADMIN_ORDER_STATUSES)[keyof typeof ADMIN_ORDER_STATUSES];

const STATUS_ALIASES: Record<AdminOrderStatus, string[]> = {
  [ADMIN_ORDER_STATUSES.PENDING_STORE]: [
    ORDER_STATUSES.PENDING_STORE,
    ORDER_STATUSES.NEW,
  ],
  [ADMIN_ORDER_STATUSES.PREPARING]: [
    ORDER_STATUSES.PREPARING,
    ORDER_STATUSES.ACCEPTED,
  ],
  [ADMIN_ORDER_STATUSES.READY_FOR_PICKUP]: [
    ORDER_STATUSES.READY_FOR_PICKUP,
    ORDER_STATUSES.READY,
  ],
  [ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY]: [ORDER_STATUSES.OUT_FOR_DELIVERY],
  [ADMIN_ORDER_STATUSES.COMPLETED]: [ORDER_STATUSES.COMPLETED],
  [ADMIN_ORDER_STATUSES.CANCELLED]: [ORDER_STATUSES.CANCELLED],
};

export const ADMIN_STATUS_LABELS: Record<AdminOrderStatus, string> = {
  [ADMIN_ORDER_STATUSES.PENDING_STORE]: "Pending",
  [ADMIN_ORDER_STATUSES.PREPARING]: "Preparing",
  [ADMIN_ORDER_STATUSES.READY_FOR_PICKUP]: "Ready for pickup",
  [ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY]: "Out for delivery",
  [ADMIN_ORDER_STATUSES.COMPLETED]: "Completed",
  [ADMIN_ORDER_STATUSES.CANCELLED]: "Cancelled",
};

function normalizeValue(value?: string | null) {
  return value?.trim().toUpperCase() ?? "";
}

export function normalizeAdminOrderStatus(
  status?: string | null
): AdminOrderStatus | null {
  const normalized = normalizeValue(status);

  switch (normalized) {
    case ORDER_STATUSES.NEW:
    case ORDER_STATUSES.PENDING_STORE:
      return ADMIN_ORDER_STATUSES.PENDING_STORE;
    case ORDER_STATUSES.ACCEPTED:
    case ORDER_STATUSES.PREPARING:
      return ADMIN_ORDER_STATUSES.PREPARING;
    case ORDER_STATUSES.READY:
    case ORDER_STATUSES.READY_FOR_PICKUP:
      return ADMIN_ORDER_STATUSES.READY_FOR_PICKUP;
    case ORDER_STATUSES.OUT_FOR_DELIVERY:
      return ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY;
    case ORDER_STATUSES.COMPLETED:
      return ADMIN_ORDER_STATUSES.COMPLETED;
    case ORDER_STATUSES.CANCELLED:
      return ADMIN_ORDER_STATUSES.CANCELLED;
    default:
      return null;
  }
}

export function getAdminStatusQueryValues(status: string) {
  const normalized = normalizeAdminOrderStatus(status);
  if (!normalized) return [status];
  return STATUS_ALIASES[normalized];
}

export function getAllowedNextStatuses({
  currentStatus,
  fulfillment,
}: {
  currentStatus?: string | null;
  fulfillment?: OrderFulfillment | null;
}): AdminOrderStatus[] {
  const normalized = normalizeAdminOrderStatus(currentStatus);
  const orderFulfillment = fulfillment === "delivery" ? "delivery" : "pickup";

  switch (normalized) {
    case ADMIN_ORDER_STATUSES.PENDING_STORE:
      return [
        ADMIN_ORDER_STATUSES.PREPARING,
        ADMIN_ORDER_STATUSES.CANCELLED,
      ];
    case ADMIN_ORDER_STATUSES.PREPARING:
      return [
        orderFulfillment === "delivery"
          ? ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY
          : ADMIN_ORDER_STATUSES.READY_FOR_PICKUP,
        ADMIN_ORDER_STATUSES.CANCELLED,
      ];
    case ADMIN_ORDER_STATUSES.READY_FOR_PICKUP:
    case ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY:
      return [ADMIN_ORDER_STATUSES.COMPLETED];
    default:
      return [];
  }
}

export function canTransitionAdminOrderStatus({
  currentStatus,
  nextStatus,
  fulfillment,
}: {
  currentStatus?: string | null;
  nextStatus?: string | null;
  fulfillment?: OrderFulfillment | null;
}) {
  const normalizedNext = normalizeAdminOrderStatus(nextStatus);
  if (!normalizedNext) return false;

  return getAllowedNextStatuses({ currentStatus, fulfillment }).includes(
    normalizedNext
  );
}

export function getCanonicalNextAdminStatus(status: string) {
  return normalizeAdminOrderStatus(status);
}

export function getAdminPrimaryActionLabel({
  currentStatus,
  fulfillment,
}: {
  currentStatus?: string | null;
  fulfillment?: OrderFulfillment | null;
}) {
  const allowed = getAllowedNextStatuses({ currentStatus, fulfillment });
  const primary = allowed[0];

  switch (primary) {
    case ADMIN_ORDER_STATUSES.PREPARING:
      return "Start preparing";
    case ADMIN_ORDER_STATUSES.READY_FOR_PICKUP:
      return "Mark ready for pickup";
    case ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY:
      return "Mark out for delivery";
    case ADMIN_ORDER_STATUSES.COMPLETED:
      return "Mark completed";
    default:
      return null;
  }
}

export function isFinalAdminOrderStatus(status?: string | null) {
  const normalized = normalizeAdminOrderStatus(status);
  return (
    normalized === ADMIN_ORDER_STATUSES.COMPLETED ||
    normalized === ADMIN_ORDER_STATUSES.CANCELLED
  );
}
