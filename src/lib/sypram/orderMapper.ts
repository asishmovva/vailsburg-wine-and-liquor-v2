import "server-only";

import type { SypramOrderPayload } from "@/lib/sypram/orderTypes";

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  sku?: string | null;
  upc?: string | null;
};

type OrderRecord = {
  id: string;
  orderId?: string;
  email?: string | null;
  userId?: string | null;
  phone?: string | null;
  fulfillment: "delivery" | "pickup";
  delivery?: { address?: string | null } | null;
  subtotal: number;
  taxableSubtotal?: number;
  tax: number;
  total: number;
  deliveryFee: number;
  tip: number;
  items: OrderItem[];
};

function deriveCustomerName(order: OrderRecord) {
  const email = order.email ?? "";
  const prefix = email.split("@")[0];
  return prefix ? prefix.replace(/[._]/g, " ").trim() : "Customer";
}

export function mapOrderToSypramPayload(order: OrderRecord): SypramOrderPayload {
  const orderId = order.orderId ?? order.id;
  const name = deriveCustomerName(order);

  return {
    idempotencyKey: orderId,
    customerInfo: {
      name,
      email: order.email ?? null,
      phone: order.phone ?? null,
    },
    orderInfo: {
      orderId,
      fulfillment: order.fulfillment,
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      deliveryFee: order.deliveryFee ?? 0,
      tip: order.tip ?? 0,
      taxableSubtotal: order.taxableSubtotal ?? order.subtotal,
      address: order.delivery?.address ?? null,
    },
    items: order.items.map((item) => ({
      sku: item.sku ?? undefined,
      upc: item.upc ?? undefined,
      quantity: item.qty,
      unitPrice: item.price,
      description: item.name,
    })),
  };
}
