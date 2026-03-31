"use client";

import { OrderSummaryCard } from "@/components/orders/OrderSummaryCard";
import type { OrderItem, OrderRecord } from "@/lib/orders/types";

export type { OrderItem, OrderRecord };

export function OrderDetails({ order }: { order: OrderRecord }) {
  return <OrderSummaryCard order={order} />;
}
