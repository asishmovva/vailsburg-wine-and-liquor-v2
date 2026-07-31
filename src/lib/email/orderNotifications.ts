import "server-only";

import {
  sendOrderNotification,
} from "@/lib/notifications/sendOrderNotification";
import type { CustomerOrderEmailMilestone, OrderEmailData } from "@/lib/email/orders";
import type { OrderRefundStatus } from "@/lib/orders/types";

type OrderNotificationOrder = Omit<OrderEmailData, "items"> & {
  items?: Array<{
    name?: string;
    qty: number;
    price?: number;
  }>;
  notifications?: Record<string, unknown> | null;
  alerts?: Record<string, unknown> | null;
  refundStatus?: OrderRefundStatus | null;
};

function getEventKey(milestone: CustomerOrderEmailMilestone) {
  switch (milestone) {
    case "orderReceived":
      return "ORDER_RECEIVED" as const;
    case "paymentConfirmed":
      return "PAYMENT_CONFIRMED" as const;
    case "orderUpdated":
      return "ORDER_UPDATED" as const;
    case "ready":
      return "READY_FOR_PICKUP" as const;
    case "outForDelivery":
      return "OUT_FOR_DELIVERY" as const;
    case "completed":
      return "ORDER_COMPLETED" as const;
    case "cancelled":
      return "ORDER_CANCELLED" as const;
    case "refundMarked":
      return "REFUND_MARKED" as const;
  }
}

export async function maybeSendCustomerOrderEmail({
  orderId,
  order,
  orderRef,
  milestone,
}: {
  orderId: string;
  order: OrderNotificationOrder;
  orderRef: FirebaseFirestore.DocumentReference;
  milestone: CustomerOrderEmailMilestone;
}) {
  return sendOrderNotification({
    orderId,
    orderRef,
    order,
    eventKey: getEventKey(milestone),
  });
}
