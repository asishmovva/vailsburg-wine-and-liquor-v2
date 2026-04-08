import { ORDER_STATUSES } from "@/lib/orders/status";
import type {
  CustomerStatusView,
  OrderFulfillment,
  OrderRecord,
  OrderStatusTone,
} from "@/lib/orders/types";

function normalizeValue(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function normalizeOrderStatus(status?: string | null) {
  const normalized = normalizeValue(status);
  switch (normalized) {
    case "":
      return ORDER_STATUSES.PENDING_PAYMENT;
    case "created":
      return "created";
    case "payment_pending":
    case "pending_payment":
      return ORDER_STATUSES.PENDING_PAYMENT;
    case "pending_store":
      return ORDER_STATUSES.NEW;
    case "paid":
      return "paid";
    case "new":
      return ORDER_STATUSES.NEW;
    case "accepted":
    case "processing":
    case "preparing":
      return ORDER_STATUSES.ACCEPTED;
    case "ready":
    case "ready_for_pickup":
      return ORDER_STATUSES.READY;
    case "out_for_delivery":
      return "out_for_delivery";
    case "fulfilled":
    case "completed":
      return ORDER_STATUSES.COMPLETED;
    case "cancelled":
    case "canceled":
      return ORDER_STATUSES.CANCELLED;
    case "failed":
    case "payment_failed":
      return ORDER_STATUSES.FAILED;
    case "refunded":
      return "refunded";
    default:
      return status ?? ORDER_STATUSES.PENDING_PAYMENT;
  }
}

function normalizeFulfillment(fulfillment?: OrderFulfillment | null) {
  return fulfillment === "delivery" ? "delivery" : "pickup";
}

export type CustomerStatusDisplay = CustomerStatusView;

export function getCustomerStatusDisplay({
  status,
  fulfillment,
  fulfillmentStatus,
}: {
  status?: string | null;
  fulfillment?: OrderFulfillment | null;
  fulfillmentStatus?: string | null;
}): CustomerStatusDisplay {
  const normalizedStatus = normalizeOrderStatus(status);
  const normalizedFulfillmentStatus = normalizeOrderStatus(fulfillmentStatus);
  const normalizedFulfillment = normalizeFulfillment(fulfillment);

  if (normalizedStatus === "refunded") {
    return {
      key: "refunded",
      label: "Refunded",
      tone: "neutral",
      hint: "Refund issued",
    };
  }

  if (normalizedStatus === ORDER_STATUSES.CANCELLED) {
    return {
      key: ORDER_STATUSES.CANCELLED,
      label: "Cancelled",
      tone: "destructive",
      hint: "Order cancelled",
    };
  }

  if (normalizedStatus === ORDER_STATUSES.FAILED) {
    return {
      key: ORDER_STATUSES.FAILED,
      label: "Payment failed",
      tone: "destructive",
      hint: "Payment did not go through",
    };
  }

  if (normalizedStatus === "created") {
    return {
      key: "created",
      label: "Order created",
      tone: "neutral",
      hint: "Waiting for payment",
    };
  }

  if (normalizedStatus === ORDER_STATUSES.PENDING_PAYMENT) {
    return {
      key: ORDER_STATUSES.PENDING_PAYMENT,
      label: "Awaiting payment",
      tone: "warning",
      hint: "Payment still processing",
    };
  }

  if (
    normalizedFulfillmentStatus === ORDER_STATUSES.COMPLETED ||
    normalizedStatus === ORDER_STATUSES.COMPLETED
  ) {
    return {
      key: ORDER_STATUSES.COMPLETED,
      label: "Completed",
      tone: "neutral",
      hint: "Order completed",
    };
  }

  if (
    normalizedFulfillmentStatus === "out_for_delivery" ||
    normalizedStatus === "out_for_delivery" ||
    (normalizedStatus === ORDER_STATUSES.READY &&
      normalizedFulfillment === "delivery")
  ) {
    return {
      key: "out_for_delivery",
      label: "Out for delivery",
      tone: "info",
      hint: "On the way",
    };
  }

  if (
    normalizedFulfillmentStatus === ORDER_STATUSES.ACCEPTED ||
    normalizedStatus === ORDER_STATUSES.ACCEPTED
  ) {
    return {
      key: ORDER_STATUSES.ACCEPTED,
      label: "Preparing your order",
      tone: "info",
      hint:
        normalizedFulfillment === "delivery"
          ? "Same-day delivery requested"
          : "Ready soon",
    };
  }

  if (
    normalizedFulfillmentStatus === ORDER_STATUSES.READY ||
    normalizedStatus === ORDER_STATUSES.READY
  ) {
    return {
      key: ORDER_STATUSES.READY,
      label:
        normalizedFulfillment === "delivery"
          ? "Out for delivery"
          : "Ready for pickup",
      tone: "success",
      hint:
        normalizedFulfillment === "delivery"
          ? "Driver is on the way"
          : "Show this order at the counter",
    };
  }

  if (normalizedStatus === "paid" || normalizedStatus === ORDER_STATUSES.NEW) {
    return {
      key: ORDER_STATUSES.NEW,
      label: "Order received",
      tone: "warning",
      hint:
        normalizedFulfillment === "delivery"
          ? "Delivery order"
          : "Pickup order",
    };
  }

  return {
    key: "processing",
    label: "Preparing your order",
    tone: "info",
    hint:
      normalizedFulfillment === "delivery" ? "Delivery order" : "Pickup order",
  };
}

export function getCustomerStatusToneClasses(tone: OrderStatusTone) {
  switch (tone) {
    case "success":
      return "bg-emerald-100 text-emerald-700";
    case "warning":
      return "bg-amber-100 text-amber-700";
    case "destructive":
      return "bg-red-100 text-red-700";
    case "info":
      return "bg-blue-100 text-blue-700";
    case "neutral":
    default:
      return "bg-zinc-200 text-zinc-700";
  }
}

export function getCustomerStatusMeta(
  order: Pick<OrderRecord, "status" | "fulfillment" | "fulfillmentStatus">
) {
  return getCustomerStatusDisplay({
    status: order.status,
    fulfillment: order.fulfillment,
    fulfillmentStatus: order.fulfillmentStatus,
  });
}

