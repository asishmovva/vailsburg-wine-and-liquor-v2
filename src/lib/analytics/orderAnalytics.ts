import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  normalizeAdminOrderStatus,
  isFinalAdminOrderStatus,
} from "@/lib/orders/adminStatusTransitions";
import { normalizeOrderStatus } from "@/lib/orders/statusMapping";
import { ORDER_STATUSES } from "@/lib/orders/status";
import type {
  AdminAnalyticsResponse,
  AnalyticsCategoryBreakdown,
  AnalyticsDateRange,
  AnalyticsRangeKey,
  AnalyticsTopProduct,
  AnalyticsTrendPoint,
} from "@/lib/analytics/types";
import type { OrderNotifications } from "@/lib/orders/types";
import { withAnalyticsCache } from "@/lib/analytics/cache";

const ANALYTICS_TIME_ZONE = "America/New_York";
const STALE_OPEN_MINUTES = 60;
const PENDING_ATTENTION_MINUTES = 30;
const TOP_PRODUCTS_LIMIT = 10;
const TOP_CATEGORIES_LIMIT = 8;
const ANALYTICS_CACHE_TTL_MS = 90_000;
const ANALYTICS_CACHE_KEY_VERSION = "v1";

type AnalyticsOrder = {
  status?: string | null;
  fulfillment?: "delivery" | "pickup" | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  cancelledAt?: unknown;
  paidAt?: unknown;
  paid?: boolean;
  total?: number;
  subtotal?: number;
  tax?: number;
  tip?: number;
  deliveryFee?: number;
  notifications?: OrderNotifications | null;
  alerts?: { emailLastError?: string | null } | null;
  items?: Array<{
    productId?: string;
    name?: string;
    price?: number;
    qty?: number;
    category?: string;
  }>;
};

type AnalyticsOrderRecord = AnalyticsOrder & {
  id: string;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function parseFirestoreDate(value?: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const seconds =
    (value as { _seconds?: number; seconds?: number } | undefined)?._seconds ??
    (value as { seconds?: number } | undefined)?.seconds;

  if (typeof seconds === "number") {
    return new Date(seconds * 1000);
  }

  return null;
}

function formatCurrency(value: number) {
  return Number(value.toFixed(2));
}

function parseOffsetLabel(label: string) {
  const normalized = label.replace("UTC", "GMT");
  const match = normalized.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const label =
    formatter.formatToParts(date).find((part) => part.type === "timeZoneName")
      ?.value ?? "GMT+0";
  return parseOffsetLabel(label);
}

function getTimeZoneDateParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
  };
}

function createDateInTimeZone(
  parts: DateParts,
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
  timeZone: string
) {
  const utcGuess = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      hours,
      minutes,
      seconds,
      milliseconds
    )
  );
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000);
}

function shiftDateParts(parts: DateParts, deltaDays: number, timeZone: string) {
  const anchor = createDateInTimeZone(parts, 12, 0, 0, 0, timeZone);
  const shifted = new Date(anchor.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);
  return getTimeZoneDateParts(shifted, timeZone);
}

function formatIsoDate(parts: DateParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function formatTrendLabel(parts: DateParts) {
  return `${String(parts.month).padStart(2, "0")}/${String(parts.day).padStart(
    2,
    "0"
  )}`;
}

function parseInputDate(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function normalizeRangeKey(value?: string | null): AnalyticsRangeKey {
  switch (value) {
    case "today":
      return "today";
    case "30d":
      return "30d";
    case "custom":
      return "custom";
    case "7d":
    default:
      return "7d";
  }
}

function getAnalyticsDateRange({
  rangeKey,
  start,
  end,
  now = new Date(),
}: {
  rangeKey?: string | null;
  start?: string | null;
  end?: string | null;
  now?: Date;
}): AnalyticsDateRange & {
  startDate: Date;
  endDate: Date;
  keys: string[];
  labels: string[];
} {
  const normalizedRange = normalizeRangeKey(rangeKey);
  const todayParts = getTimeZoneDateParts(now, ANALYTICS_TIME_ZONE);

  let startParts = todayParts;
  let endParts = todayParts;
  let label = "Last 7 days";

  if (normalizedRange === "today") {
    label = "Today";
  } else if (normalizedRange === "30d") {
    startParts = shiftDateParts(todayParts, -29, ANALYTICS_TIME_ZONE);
    label = "Last 30 days";
  } else if (normalizedRange === "custom") {
    const parsedStart = parseInputDate(start);
    const parsedEnd = parseInputDate(end);
    if (!parsedStart || !parsedEnd) {
      startParts = shiftDateParts(todayParts, -6, ANALYTICS_TIME_ZONE);
      label = "Last 7 days";
    } else {
      startParts = parsedStart;
      endParts = parsedEnd;
      if (
        createDateInTimeZone(parsedStart, 0, 0, 0, 0, ANALYTICS_TIME_ZONE) >
        createDateInTimeZone(parsedEnd, 0, 0, 0, 0, ANALYTICS_TIME_ZONE)
      ) {
        startParts = parsedEnd;
        endParts = parsedStart;
      }
      label = `${formatIsoDate(startParts)} to ${formatIsoDate(endParts)}`;
    }
  } else {
    startParts = shiftDateParts(todayParts, -6, ANALYTICS_TIME_ZONE);
    label = "Last 7 days";
  }

  const startDate = createDateInTimeZone(
    startParts,
    0,
    0,
    0,
    0,
    ANALYTICS_TIME_ZONE
  );
  const endDate = createDateInTimeZone(
    endParts,
    23,
    59,
    59,
    999,
    ANALYTICS_TIME_ZONE
  );

  const keys: string[] = [];
  const labels: string[] = [];
  let cursor = startParts;
  while (
    createDateInTimeZone(cursor, 0, 0, 0, 0, ANALYTICS_TIME_ZONE) <= endDate
  ) {
    keys.push(formatIsoDate(cursor));
    labels.push(formatTrendLabel(cursor));
    cursor = shiftDateParts(cursor, 1, ANALYTICS_TIME_ZONE);
    if (keys.length > 370) break;
  }

  return {
    key: normalizedRange,
    label,
    start: formatIsoDate(startParts),
    end: formatIsoDate(endParts),
    timeZone: ANALYTICS_TIME_ZONE,
    isCustom: normalizedRange === "custom",
    startDate,
    endDate,
    keys,
    labels,
  };
}

function getRangeKeyForDate(date: Date) {
  return formatIsoDate(getTimeZoneDateParts(date, ANALYTICS_TIME_ZONE));
}

function getNumericValue(value?: number | null) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function isPaidOrder(order: AnalyticsOrder) {
  const normalizedStatus = normalizeOrderStatus(order.status);
  if (
    normalizedStatus === ORDER_STATUSES.CANCELLED ||
    normalizedStatus === ORDER_STATUSES.FAILED ||
    normalizedStatus === ORDER_STATUSES.PENDING_PAYMENT
  ) {
    return false;
  }

  return Boolean(order.paid || order.paidAt);
}

function hasNotificationFailure(order: AnalyticsOrder) {
  if (order.notifications?.emailLastError || order.alerts?.emailLastError) {
    return true;
  }

  const values = order.notifications
    ? Object.values(order.notifications).filter((value) => typeof value === "object" && value)
    : [];

  return values.some(
    (value) =>
      (value as { lastStatus?: string | null }).lastStatus === "failed" ||
      Boolean((value as { lastError?: string | null }).lastError)
  );
}

function isStaleOpenOrder(order: AnalyticsOrder, now: Date) {
  const normalizedAdminStatus = normalizeAdminOrderStatus(order.status);
  if (!normalizedAdminStatus || isFinalAdminOrderStatus(order.status)) {
    return false;
  }

  const createdAt = parseFirestoreDate(order.createdAt);
  if (!createdAt) return false;
  return now.getTime() - createdAt.getTime() > STALE_OPEN_MINUTES * 60_000;
}

function isPendingOverThreshold(order: AnalyticsOrder, now: Date) {
  const normalizedAdminStatus = normalizeAdminOrderStatus(order.status);
  if (normalizedAdminStatus !== ORDER_STATUSES.PENDING_STORE) {
    return false;
  }

  const createdAt = parseFirestoreDate(order.createdAt);
  if (!createdAt) return false;
  return now.getTime() - createdAt.getTime() > PENDING_ATTENTION_MINUTES * 60_000;
}

function sortCategoryBreakdown(
  rows: AnalyticsCategoryBreakdown[],
  sortBy: "quantity" | "revenue"
) {
  return [...rows]
    .sort((a, b) =>
      sortBy === "quantity"
        ? b.quantitySold - a.quantitySold || b.revenue - a.revenue
        : b.revenue - a.revenue || b.quantitySold - a.quantitySold
    )
    .slice(0, TOP_CATEGORIES_LIMIT);
}

export async function getAdminAnalytics({
  range,
  start,
  end,
}: {
  range?: string | null;
  start?: string | null;
  end?: string | null;
}): Promise<AdminAnalyticsResponse> {
  const now = new Date();
  const cacheKey = JSON.stringify({
    version: ANALYTICS_CACHE_KEY_VERSION,
    range: normalizeRangeKey(range),
    start: start ?? null,
    end: end ?? null,
  });

  const computeAnalytics = async () => {
    const dateRange = getAnalyticsDateRange({
      rangeKey: range,
      start,
      end,
      now,
    });

    const db = adminDb();
    const ordersSnapshot = await db
      .collection("orders")
      .where("createdAt", ">=", Timestamp.fromDate(dateRange.startDate))
      .where("createdAt", "<=", Timestamp.fromDate(dateRange.endDate))
      .orderBy("createdAt", "asc")
      .get();

    const cancelledTodayStart = createDateInTimeZone(
      getTimeZoneDateParts(now, ANALYTICS_TIME_ZONE),
      0,
      0,
      0,
      0,
      ANALYTICS_TIME_ZONE
    );
    const cancelledTodayEnd = createDateInTimeZone(
      getTimeZoneDateParts(now, ANALYTICS_TIME_ZONE),
      23,
      59,
      59,
      999,
      ANALYTICS_TIME_ZONE
    );

    const cancelledTodaySnapshot = await db
      .collection("orders")
      .where("cancelledAt", ">=", Timestamp.fromDate(cancelledTodayStart))
      .where("cancelledAt", "<=", Timestamp.fromDate(cancelledTodayEnd))
      .orderBy("cancelledAt", "asc")
      .get();

    const trendMap = new Map<string, AnalyticsTrendPoint>();
    dateRange.keys.forEach((key, index) => {
      trendMap.set(key, {
        key,
        label: dateRange.labels[index] ?? key,
        orders: 0,
        paidOrders: 0,
        revenue: 0,
        cancelledOrders: 0,
      });
    });
    const topProductsMap = new Map<string, AnalyticsTopProduct>();
    const categoryMap = new Map<string, AnalyticsCategoryBreakdown>();

    let totalOrders = 0;
    let paidOrders = 0;
    let paidRevenue = 0;
    let cancelledOrders = 0;
    let paymentFailures = 0;
    let pickupOrders = 0;
    let deliveryOrders = 0;
    let deliveryFeeTotal = 0;
    let tipTotal = 0;
    let cancelledPickup = 0;
    let cancelledDelivery = 0;
    let openOrders = 0;
    let staleOpenOrders = 0;
    let pendingOver30Minutes = 0;
    let notificationFailures = 0;
    let completedOrders = 0;

    for (const doc of ordersSnapshot.docs) {
      const order: AnalyticsOrderRecord = {
        ...(doc.data() as AnalyticsOrder),
        id: doc.id,
      };
      totalOrders += 1;

      const orderDate = parseFirestoreDate(order.createdAt);
      const key = orderDate ? getRangeKeyForDate(orderDate) : null;
      const trend = key ? trendMap.get(key) : null;
      if (trend) {
        trend.orders += 1;
      }

      const normalizedStatus = normalizeOrderStatus(order.status);
      const normalizedAdminStatus = normalizeAdminOrderStatus(order.status);
      const fulfillment = order.fulfillment === "delivery" ? "delivery" : "pickup";

      if (normalizedStatus === ORDER_STATUSES.COMPLETED) {
        completedOrders += 1;
      }

      if (fulfillment === "delivery") {
        deliveryOrders += 1;
      } else {
        pickupOrders += 1;
      }

      if (normalizedStatus === ORDER_STATUSES.CANCELLED) {
        cancelledOrders += 1;
        if (trend) trend.cancelledOrders += 1;
        if (fulfillment === "delivery") {
          cancelledDelivery += 1;
        } else {
          cancelledPickup += 1;
        }
      }

      if (normalizedStatus === ORDER_STATUSES.FAILED) {
        paymentFailures += 1;
      }

      if (normalizedAdminStatus && !isFinalAdminOrderStatus(order.status)) {
        openOrders += 1;
        if (isStaleOpenOrder(order, now)) {
          staleOpenOrders += 1;
        }
        if (isPendingOverThreshold(order, now)) {
          pendingOver30Minutes += 1;
        }
      }

      if (hasNotificationFailure(order)) {
        notificationFailures += 1;
      }

      if (!isPaidOrder(order)) {
        continue;
      }

      paidOrders += 1;
      const orderRevenue = getNumericValue(order.total);
      paidRevenue += orderRevenue;
      deliveryFeeTotal += getNumericValue(order.deliveryFee);
      tipTotal += getNumericValue(order.tip);
      if (trend) {
        trend.paidOrders += 1;
        trend.revenue += orderRevenue;
      }

      for (const item of order.items ?? []) {
        const quantity = getNumericValue(item.qty);
        if (quantity <= 0) continue;

        const revenue = getNumericValue(item.price) * quantity;
        const productId = item.productId ?? `${item.name ?? "unknown"}:${item.category ?? "Other"}`;
        const category = item.category?.trim() || "Other";

        const existingProduct = topProductsMap.get(productId) ?? {
          productId,
          name: item.name?.trim() || "Unknown item",
          category,
          quantitySold: 0,
          revenue: 0,
        };
        existingProduct.quantitySold += quantity;
        existingProduct.revenue += revenue;
        topProductsMap.set(productId, existingProduct);

        const existingCategory = categoryMap.get(category) ?? {
          category,
          quantitySold: 0,
          revenue: 0,
        };
        existingCategory.quantitySold += quantity;
        existingCategory.revenue += revenue;
        categoryMap.set(category, existingCategory);
      }
    }

    const topProducts = [...topProductsMap.values()]
      .sort(
        (a, b) =>
          b.quantitySold - a.quantitySold || b.revenue - a.revenue
      )
      .slice(0, TOP_PRODUCTS_LIMIT)
      .map((row) => ({
        ...row,
        revenue: formatCurrency(row.revenue),
      }));

    const categoryRows = [...categoryMap.values()].map((row) => ({
      ...row,
      revenue: formatCurrency(row.revenue),
    }));

    const topCategoriesByUnits = sortCategoryBreakdown(categoryRows, "quantity");
    const topCategoriesByRevenue = sortCategoryBreakdown(categoryRows, "revenue");

    const trends = [...trendMap.values()].map((point) => ({
      ...point,
      revenue: formatCurrency(point.revenue),
    }));

    const ordersNeedingAttention = new Set<string>();
    ordersSnapshot.docs.forEach((doc) => {
      const order: AnalyticsOrderRecord = {
        ...(doc.data() as AnalyticsOrder),
        id: doc.id,
      };
      if (isStaleOpenOrder(order, now) || hasNotificationFailure(order)) {
        ordersNeedingAttention.add(order.id);
      }
    });

    const cancelledToday = cancelledTodaySnapshot.docs.length;
    const fulfillmentTotal = pickupOrders + deliveryOrders;

    const generatedAt = new Date().toISOString();
    return {
      range: {
        key: dateRange.key,
        label: dateRange.label,
        start: dateRange.start,
        end: dateRange.end,
        timeZone: dateRange.timeZone,
        isCustom: dateRange.isCustom,
      },
      summary: {
        totalOrders,
        paidOrders,
        paidRevenue: formatCurrency(paidRevenue),
        averageOrderValue:
          paidOrders > 0 ? formatCurrency(paidRevenue / paidOrders) : 0,
        cancelledOrders,
        paymentFailures,
      },
      fulfillment: {
        pickupOrders,
        deliveryOrders,
        pickupPercent:
          fulfillmentTotal > 0 ? Math.round((pickupOrders / fulfillmentTotal) * 100) : 0,
        deliveryPercent:
          fulfillmentTotal > 0 ? Math.round((deliveryOrders / fulfillmentTotal) * 100) : 0,
        deliveryFeeTotal: formatCurrency(deliveryFeeTotal),
        tipTotal: formatCurrency(tipTotal),
        cancelledPickup,
        cancelledDelivery,
      },
      trends,
      topProducts,
      topCategoriesByUnits,
      topCategoriesByRevenue,
      operational: {
        ordersNeedingAttention: ordersNeedingAttention.size,
        staleOpenOrders,
        pendingOver30Minutes,
        notificationFailures,
        openOrders,
        completedOrders,
        cancelledToday,
      },
      definitions: {
        revenue:
          "Paid revenue excludes cancelled, failed, and unpaid pending orders. Product and category metrics use paid orders only.",
        topProducts:
          "Top products and categories are aggregated from paid order items in the selected date range.",
        aggregation:
          "Analytics are computed from server-side, date-bounded Firestore queries at request time and cached briefly for admin dashboard refreshes.",
      },
      meta: {
        generatedAt,
        servedFromCache: false,
        cacheKey,
        cacheExpiresAt: null,
      },
    };
  };

  const cachedResult = await withAnalyticsCache({
    key: cacheKey,
    ttlMs: ANALYTICS_CACHE_TTL_MS,
    compute: computeAnalytics,
  });

  return {
    ...cachedResult.value,
    meta: {
      ...cachedResult.value.meta,
      servedFromCache: cachedResult.cacheHit,
      cacheSource: cachedResult.cacheHit ? "memory" : "live",
      cacheExpiresAt: new Date(cachedResult.expiresAtMs).toISOString(),
    },
  };
}
