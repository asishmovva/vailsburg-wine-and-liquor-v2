import { ORDER_STATUSES } from "@/lib/orders/status";
import {
  getCustomerStatusDisplay,
  normalizeOrderStatus,
} from "@/lib/orders/statusDisplay";
import type { OrderRecord } from "@/lib/orders/types";

export type TimelineStep = {
  key: string;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: Date | null;
  tone?: "default" | "success" | "destructive";
};

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

function buildStandardSteps(order: OrderRecord) {
  const isDelivery = order.fulfillment === "delivery";
  const steps: TimelineStep[] = [
    {
      key: "placed",
      label: "Order placed",
      completed: true,
      current: false,
      timestamp: parseDate(order.createdAt),
    },
    {
      key: "paid",
      label: "Payment confirmed",
      completed: false,
      current: false,
      timestamp: parseDate(order.paidAt),
    },
    {
      key: "preparing",
      label: "Preparing order",
      completed: false,
      current: false,
      timestamp: null,
    },
    {
      key: isDelivery ? "delivering" : "ready",
      label: isDelivery ? "Out for delivery" : "Ready for pickup",
      completed: false,
      current: false,
      timestamp: null,
    },
    {
      key: "completed",
      label: "Completed",
      completed: false,
      current: false,
      timestamp: null,
    },
  ];

  return steps;
}

export function buildOrderTimeline(order: OrderRecord): TimelineStep[] {
  const normalizedStatus = normalizeOrderStatus(order.status);
  const normalizedFulfillmentStatus = normalizeOrderStatus(
    order.fulfillmentStatus
  );
  const updatedAt = parseDate(order.updatedAt);
  const display = getCustomerStatusDisplay({
    status: order.status,
    fulfillment: order.fulfillment,
    fulfillmentStatus: order.fulfillmentStatus,
  });

  if (normalizedStatus === ORDER_STATUSES.FAILED) {
    return [
      {
        key: "placed",
        label: "Order placed",
        completed: true,
        current: false,
        timestamp: parseDate(order.createdAt),
      },
      {
        key: "failed",
        label: "Payment failed",
        completed: true,
        current: true,
        timestamp: updatedAt,
        tone: "destructive",
      },
    ];
  }

  if (normalizedStatus === ORDER_STATUSES.CANCELLED) {
    const paidTimestamp = parseDate(order.paidAt);
    return [
      {
        key: "placed",
        label: "Order placed",
        completed: true,
        current: false,
        timestamp: parseDate(order.createdAt),
      },
      {
        key: "paid",
        label: "Payment confirmed",
        completed: Boolean(paidTimestamp),
        current: false,
        timestamp: paidTimestamp,
      },
      {
        key: "cancelled",
        label: "Cancelled",
        completed: true,
        current: true,
        timestamp: updatedAt,
        tone: "destructive",
      },
    ];
  }

  const steps = buildStandardSteps(order);

  const paidReached =
    normalizedStatus !== ORDER_STATUSES.PENDING_PAYMENT &&
    normalizedStatus !== "created";
  if (paidReached) {
    steps[1].completed = true;
  }

  const preparingReached =
    normalizedStatus === ORDER_STATUSES.ACCEPTED ||
    normalizedStatus === ORDER_STATUSES.READY ||
    normalizedStatus === ORDER_STATUSES.COMPLETED ||
    normalizedFulfillmentStatus === ORDER_STATUSES.ACCEPTED ||
    normalizedFulfillmentStatus === ORDER_STATUSES.READY ||
    normalizedFulfillmentStatus === ORDER_STATUSES.COMPLETED ||
    normalizedFulfillmentStatus === "out_for_delivery";
  if (preparingReached) {
    steps[2].completed = true;
  }

  const readyReached =
    normalizedStatus === ORDER_STATUSES.READY ||
    normalizedStatus === ORDER_STATUSES.COMPLETED ||
    normalizedFulfillmentStatus === ORDER_STATUSES.READY ||
    normalizedFulfillmentStatus === ORDER_STATUSES.COMPLETED ||
    normalizedFulfillmentStatus === "out_for_delivery";
  if (readyReached) {
    steps[3].completed = true;
  }

  if (
    normalizedStatus === ORDER_STATUSES.COMPLETED ||
    normalizedFulfillmentStatus === ORDER_STATUSES.COMPLETED
  ) {
    steps[4].completed = true;
    steps[4].current = true;
    steps[4].timestamp = updatedAt;
    steps[4].tone = "success";
    return steps;
  }

  if (
    normalizedStatus === ORDER_STATUSES.READY ||
    normalizedFulfillmentStatus === ORDER_STATUSES.READY ||
    normalizedFulfillmentStatus === "out_for_delivery"
  ) {
    steps[3].current = true;
    steps[3].timestamp = updatedAt;
    steps[3].label = display.label;
    return steps;
  }

  if (
    normalizedStatus === ORDER_STATUSES.ACCEPTED ||
    normalizedFulfillmentStatus === ORDER_STATUSES.ACCEPTED
  ) {
    steps[2].current = true;
    steps[2].timestamp = updatedAt;
    return steps;
  }

  if (paidReached) {
    steps[1].current = true;
    return steps;
  }

  steps[0].current = true;
  return steps;
}
