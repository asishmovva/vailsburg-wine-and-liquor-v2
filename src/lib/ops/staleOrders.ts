import {
  ADMIN_ORDER_STATUSES,
  normalizeAdminOrderStatus,
} from "@/lib/orders/adminStatusTransitions";

export const STALE_ORDER_THRESHOLDS_MS = {
  [ADMIN_ORDER_STATUSES.PENDING_STORE]: 30 * 60 * 1000,
  [ADMIN_ORDER_STATUSES.PREPARING]: 2 * 60 * 60 * 1000,
  [ADMIN_ORDER_STATUSES.READY_FOR_PICKUP]: 24 * 60 * 60 * 1000,
} as const;

type StaleThresholdKey = keyof typeof STALE_ORDER_THRESHOLDS_MS;

type TimestampLike = {
  _seconds?: number;
  seconds?: number;
  toDate?: () => Date;
};

type StaleOrderCandidate = {
  status?: string | null;
  statusUpdatedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
};

function parseDate(value?: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const withToDate = value as TimestampLike;
  if (typeof withToDate.toDate === "function") {
    const parsed = withToDate.toDate();
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed;
  }

  const seconds = withToDate._seconds ?? withToDate.seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000);
  }

  return null;
}

function getReferenceDate(order: StaleOrderCandidate) {
  return (
    parseDate(order.statusUpdatedAt) ??
    parseDate(order.updatedAt) ??
    parseDate(order.createdAt)
  );
}

function getThresholdKey(orderStatus?: string | null): StaleThresholdKey | null {
  const normalized = normalizeAdminOrderStatus(orderStatus);
  if (!normalized) return null;
  if (normalized === ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY) return null;
  if (normalized === ADMIN_ORDER_STATUSES.COMPLETED) return null;
  if (normalized === ADMIN_ORDER_STATUSES.CANCELLED) return null;
  return normalized as StaleThresholdKey;
}

export function getStaleThresholdMs(orderStatus?: string | null) {
  const thresholdKey = getThresholdKey(orderStatus);
  if (!thresholdKey) return null;
  return STALE_ORDER_THRESHOLDS_MS[thresholdKey];
}

export function getOrderStaleState(order: StaleOrderCandidate) {
  const thresholdMs = getStaleThresholdMs(order.status);
  const referenceDate = getReferenceDate(order);

  if (!thresholdMs || !referenceDate) {
    return {
      isStale: false,
      thresholdMs: thresholdMs ?? null,
      ageMs: null,
    };
  }

  const ageMs = Date.now() - referenceDate.getTime();
  return {
    isStale: ageMs > thresholdMs,
    thresholdMs,
    ageMs,
  };
}
