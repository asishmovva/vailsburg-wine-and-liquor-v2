"use client";

import {
  getCustomerStatusMeta,
  getCustomerStatusToneClasses,
} from "@/lib/orders/statusDisplay";
import type { OrderFulfillment } from "@/lib/orders/types";

export function OrderStatusBadge({
  status,
  fulfillment,
  fulfillmentStatus,
  className = "",
}: {
  status?: string | null;
  fulfillment?: OrderFulfillment | null;
  fulfillmentStatus?: string | null;
  className?: string;
}) {
  const meta = getCustomerStatusMeta({
    status: status ?? undefined,
    fulfillment: fulfillment ?? "pickup",
    fulfillmentStatus: fulfillmentStatus ?? undefined,
  });

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getCustomerStatusToneClasses(
        meta.tone
      )} ${className}`.trim()}
    >
      {meta.label}
    </span>
  );
}
