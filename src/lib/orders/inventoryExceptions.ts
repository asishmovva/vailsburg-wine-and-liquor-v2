import type {
  OrderAdjustments,
  OrderInventoryException,
  OrderItem,
  OrderRecord,
} from "@/lib/orders/types";

export const ORDER_ITEM_FULFILLMENT_STATUSES = {
  PENDING: "pending",
  FULFILLED: "fulfilled",
  UNAVAILABLE: "unavailable",
  REPLACED: "replaced",
  REFUND_PENDING: "refund_pending",
  REFUNDED: "refunded",
} as const;

export type OrderItemFulfillmentStatus =
  (typeof ORDER_ITEM_FULFILLMENT_STATUSES)[keyof typeof ORDER_ITEM_FULFILLMENT_STATUSES];

function normalizeText(value?: string | null) {
  return value?.trim() ?? "";
}

export function buildFallbackLineItemId(item: Pick<OrderItem, "productId">, index: number) {
  const productId = normalizeText(item.productId) || "item";
  return `line-${index}-${productId}`;
}

export function getOrderItemLineItemId(
  item: Pick<OrderItem, "lineItemId" | "productId">,
  index: number
) {
  return normalizeText(item.lineItemId) || buildFallbackLineItemId(item, index);
}

export function ensureOrderItemsHaveLineItemIds<T extends OrderItem>(items: T[] | null | undefined) {
  return (items ?? []).map((item, index) => ({
    ...item,
    lineItemId: getOrderItemLineItemId(item, index),
  }));
}

export function getOrderItemFulfillmentStatus(item?: Pick<OrderItem, "fulfillmentStatus"> | null) {
  return item?.fulfillmentStatus ?? ORDER_ITEM_FULFILLMENT_STATUSES.PENDING;
}

export function getOrderItemStatusBadge(status: OrderItemFulfillmentStatus) {
  switch (status) {
    case ORDER_ITEM_FULFILLMENT_STATUSES.UNAVAILABLE:
      return {
        label: "Unavailable",
        className: "bg-red-100 text-red-700",
      };
    case ORDER_ITEM_FULFILLMENT_STATUSES.REPLACED:
      return {
        label: "Replaced",
        className: "bg-blue-100 text-blue-700",
      };
    case ORDER_ITEM_FULFILLMENT_STATUSES.REFUND_PENDING:
      return {
        label: "Refund pending",
        className: "bg-amber-100 text-amber-700",
      };
    case ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED:
      return {
        label: "Refunded",
        className: "bg-emerald-100 text-emerald-700",
      };
    case ORDER_ITEM_FULFILLMENT_STATUSES.FULFILLED:
      return {
        label: "Fulfilled",
        className: "bg-emerald-100 text-emerald-700",
      };
    case ORDER_ITEM_FULFILLMENT_STATUSES.PENDING:
    default:
      return {
        label: "Pending",
        className: "bg-zinc-100 text-zinc-700",
      };
  }
}

type OrderItemExceptionView = Pick<OrderItem, "fulfillmentStatus" | "exceptionReason"> & {
  replacement?: {
    name?: string;
    price?: number;
    qty?: number;
  } | null;
  refund?: {
    amount?: number;
    status?: "pending" | "completed";
    note?: string | null;
  } | null;
};

export function getOrderItemCustomerMessage(item: OrderItemExceptionView) {
  const status = getOrderItemFulfillmentStatus(item);
  switch (status) {
    case ORDER_ITEM_FULFILLMENT_STATUSES.UNAVAILABLE:
      return "This item is unavailable. Store staff will follow up about a replacement or refund.";
    case ORDER_ITEM_FULFILLMENT_STATUSES.REPLACED:
      return item.replacement?.name
        ? `Replaced with ${item.replacement.name}.`
        : "This item was replaced by the store.";
    case ORDER_ITEM_FULFILLMENT_STATUSES.REFUND_PENDING:
      return "Partial refund pending for this item.";
    case ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED:
      return "Partial refund marked completed for this item.";
    default:
      return null;
  }
}

export function getOrderItemOperationalSummary(item: OrderItemExceptionView) {
  const status = getOrderItemFulfillmentStatus(item);
  switch (status) {
    case ORDER_ITEM_FULFILLMENT_STATUSES.UNAVAILABLE:
      return item.exceptionReason
        ? `Unavailable: ${item.exceptionReason}`
        : "Unavailable";
    case ORDER_ITEM_FULFILLMENT_STATUSES.REPLACED:
      return item.replacement?.name
        ? `Replacement: ${item.replacement.name}`
        : "Replacement selected";
    case ORDER_ITEM_FULFILLMENT_STATUSES.REFUND_PENDING:
      return item.refund?.amount
        ? `Refund pending: $${item.refund.amount.toFixed(2)}`
        : "Refund pending";
    case ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED:
      return item.refund?.amount
        ? `Refunded: $${item.refund.amount.toFixed(2)}`
        : "Refunded";
    default:
      return null;
  }
}

export function buildOrderAdjustmentSummary(items: OrderItem[]): OrderAdjustments | null {
  let refundPendingTotal = 0;
  let refundCompletedTotal = 0;
  let replacementDifference = 0;

  items.forEach((item) => {
    const status = getOrderItemFulfillmentStatus(item);
    if (status === ORDER_ITEM_FULFILLMENT_STATUSES.REFUND_PENDING) {
      refundPendingTotal += Number(item.refund?.amount ?? 0);
    }
    if (status === ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED) {
      refundCompletedTotal += Number(item.refund?.amount ?? 0);
    }
    if (status === ORDER_ITEM_FULFILLMENT_STATUSES.REPLACED && item.replacement) {
      const originalTotal = Number(item.price ?? 0) * Number(item.qty ?? 0);
      const replacementTotal =
        Number(item.replacement.price ?? 0) * Number(item.replacement.qty ?? item.qty ?? 0);
      replacementDifference += replacementTotal - originalTotal;
    }
  });

  const hasAdjustments =
    refundPendingTotal > 0 ||
    refundCompletedTotal > 0 ||
    replacementDifference !== 0;

  if (!hasAdjustments) return null;

  return {
    refundPendingTotal: refundPendingTotal || undefined,
    refundCompletedTotal: refundCompletedTotal || undefined,
    replacementDifference: replacementDifference || undefined,
  };
}

export function buildInventoryExceptionSummary(items: OrderItem[]) {
  let unavailableCount = 0;
  let replacedCount = 0;
  let refundPendingCount = 0;
  let refundedCount = 0;

  items.forEach((item) => {
    const status = getOrderItemFulfillmentStatus(item);
    if (status === ORDER_ITEM_FULFILLMENT_STATUSES.UNAVAILABLE) unavailableCount += 1;
    if (status === ORDER_ITEM_FULFILLMENT_STATUSES.REPLACED) replacedCount += 1;
    if (status === ORDER_ITEM_FULFILLMENT_STATUSES.REFUND_PENDING) refundPendingCount += 1;
    if (status === ORDER_ITEM_FULFILLMENT_STATUSES.REFUNDED) refundedCount += 1;
  });

  const hasException =
    unavailableCount + replacedCount + refundPendingCount + refundedCount > 0;

  if (!hasException) {
    return {
      hasException: false,
      status: "resolved" as const,
      summary: null,
    };
  }

  const summaryParts: string[] = [];
  if (unavailableCount > 0) {
    summaryParts.push(
      `${unavailableCount} item${unavailableCount === 1 ? "" : "s"} unavailable`
    );
  }
  if (replacedCount > 0) {
    summaryParts.push(
      `${replacedCount} item${replacedCount === 1 ? "" : "s"} replaced`
    );
  }
  if (refundPendingCount > 0) {
    summaryParts.push(
      `${refundPendingCount} partial refund${refundPendingCount === 1 ? "" : "s"} pending`
    );
  }
  if (refundedCount > 0) {
    summaryParts.push(
      `${refundedCount} partial refund${refundedCount === 1 ? "" : "s"} completed`
    );
  }

  return {
    hasException: true,
    status:
      unavailableCount > 0 || refundPendingCount > 0
        ? ("open" as const)
        : ("resolved" as const),
    summary: summaryParts.join(", "),
  };
}

export function buildInventoryExceptionState({
  items,
  updatedBy,
  updatedAt,
}: {
  items: OrderItem[];
  updatedBy: string;
  updatedAt: unknown;
}): OrderInventoryException | null {
  const summary = buildInventoryExceptionSummary(items);
  if (!summary.hasException) return null;

  return {
    hasException: true,
    status: summary.status,
    summary: summary.summary,
    updatedAt,
    updatedBy,
  };
}

export function hasInventoryException(order: Pick<OrderRecord, "inventoryException" | "items">) {
  if (order.inventoryException?.hasException) return true;
  return buildInventoryExceptionSummary(order.items ?? []).hasException;
}

export function getInventoryExceptionBadge(order: Pick<OrderRecord, "inventoryException" | "items">) {
  const summary =
    order.inventoryException?.hasException
      ? {
          hasException: true,
          status: order.inventoryException.status,
          summary: order.inventoryException.summary ?? null,
        }
      : buildInventoryExceptionSummary(order.items ?? []);

  if (!summary.hasException) return null;
  if (summary.status === "open") {
    return {
      label: "Exception open",
      className: "bg-red-100 text-red-700",
    };
  }
  return {
    label: "Exception resolved",
    className: "bg-amber-100 text-amber-700",
  };
}
