import { ORDER_STATUSES } from "@/lib/orders/status";
import {
  getCustomerStatusMeta,
  normalizeOrderStatus,
} from "@/lib/orders/statusMapping";
import type { OrderListRecord, OrderRecord } from "@/lib/orders/types";

function getPaymentMethodLabel(order: {
  status?: string | null;
  stripe?: { paymentIntentId?: string | null; checkoutSessionId?: string | null } | null;
}) {
  const normalizedStatus = normalizeOrderStatus(order.status);
  if (order.stripe?.paymentIntentId || order.stripe?.checkoutSessionId) {
    return normalizedStatus === ORDER_STATUSES.PENDING_PAYMENT
      ? "Card payment processing"
      : "Card";
  }
  return null;
}

export function formatOrderRecordForClient<T extends OrderRecord | OrderListRecord>(
  order: T
) {
  const normalizedStatus = normalizeOrderStatus(order.status);
  return {
    ...order,
    normalizedStatus,
    customerStatus: getCustomerStatusMeta({
      status: order.status,
      fulfillment: order.fulfillment ?? "pickup",
      fulfillmentStatus: "fulfillmentStatus" in order ? order.fulfillmentStatus : undefined,
    }),
    paymentMethodLabel:
      "stripe" in order ? getPaymentMethodLabel(order) : null,
  };
}

