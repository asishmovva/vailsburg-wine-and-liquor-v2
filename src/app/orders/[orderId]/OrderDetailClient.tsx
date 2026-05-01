"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderSummaryCard } from "@/components/orders/OrderSummaryCard";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { Card } from "@/components/ui/Card";
import { toast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { authedFetch } from "@/lib/client/authedFetch";
import { ORDER_STATUSES } from "@/lib/orders/status";
import {
  getCustomerStatusMeta,
  normalizeOrderStatus,
} from "@/lib/orders/statusMapping";
import type { OrderRecord } from "@/lib/orders/types";
import { orderNumberFromId } from "@/utils/order";

function getFulfillmentMessage(order: OrderRecord) {
  if (order.fulfillment === "delivery") {
    const lines = [
      order.delivery?.address ?? "Delivery address unavailable.",
      order.delivery?.miles
        ? `${order.delivery.miles.toFixed(1)} miles from store`
        : "Same-day delivery requested.",
      "We'll notify you when your order is on the way.",
    ];

    if (order.deliveryInstructions) {
      lines.push(`Delivery instructions: ${order.deliveryInstructions}`);
    }

    return {
      title: "Delivery details",
      lines,
    };
  }

  return {
    title: "Pickup details",
    lines: [
      "We'll notify you when your order is ready for pickup.",
      "Show this order at the counter when you arrive.",
      "Pickup at: Vailsburg Wine & Liquor",
    ],
  };
}

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const loadOrder = useCallback(
    async ({
      showLoader = false,
      verify = false,
    }: {
      showLoader?: boolean;
      verify?: boolean;
    } = {}) => {
      if (!user || !orderId) return;
      if (showLoader) setLoading(true);
      setError(null);
      try {
        if (verify) {
          await authedFetch(`/api/orders/verify?orderId=${encodeURIComponent(orderId)}`);
        }

        const response = await authedFetch(`/api/orders/${orderId}`);
        if (!response.ok) {
          setOrder(null);
          if (response.status !== 404) {
            const payload = (await response.json()) as { error?: string };
            setError(payload.error ?? "Unable to load order.");
          }
          return;
        }

        const payload = (await response.json()) as { order: OrderRecord };
        const data = payload.order;
        const nextOrder: OrderRecord = {
          ...data,
          id: data.id ?? orderId,
          items: data.items ?? [],
          deliveryFee: data.deliveryFee ?? 0,
          tip: data.tip ?? 0,
          tax: data.tax ?? 0,
          subtotal: data.subtotal ?? 0,
          total: data.total ?? 0,
        };

        const nextStatusKey = nextOrder.customerStatus?.key ?? normalizeOrderStatus(nextOrder.status);
        if (lastStatusRef.current && lastStatusRef.current !== nextStatusKey) {
          const label = nextOrder.customerStatus?.label ?? getCustomerStatusMeta(nextOrder).label;
          if (
            nextStatusKey === ORDER_STATUSES.CANCELLED ||
            nextStatusKey === ORDER_STATUSES.FAILED
          ) {
            toast.error(`Order update: ${label}`);
          } else {
            toast.success(`Order update: ${label}`);
          }
        }
        lastStatusRef.current = nextStatusKey;
        setOrder(nextOrder);
      } catch (err) {
        setError((err as Error).message ?? "Unable to load order.");
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [orderId, user]
  );

  useEffect(() => {
    if (!user || !orderId) return;
    void loadOrder({ showLoader: true, verify: true });
  }, [loadOrder, orderId, user]);

  useEffect(() => {
    if (!user || !orderId) return;
    const interval = setInterval(() => {
      const normalizedStatus = normalizeOrderStatus(order?.status);
      void loadOrder({
        showLoader: false,
        verify: normalizedStatus === ORDER_STATUSES.PENDING_PAYMENT,
      });
    }, 12000);

    return () => clearInterval(interval);
  }, [loadOrder, order?.status, orderId, user]);

  const handleCopyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(orderId);
      toast.success("Order ID copied");
    } catch {
      toast.error("Unable to copy order ID");
    }
  };

  if (loading) {
    return <Card className="p-6 text-sm text-zinc-600">Loading order...</Card>;
  }

  if (error) {
    return (
      <Card className="p-6 text-sm text-red-600">
        Unable to load order. {error}
      </Card>
    );
  }

  if (!order) {
    return (
      <Card className="space-y-3 p-6 text-sm text-zinc-600">
        <p>Order not found.</p>
        <Link
          href="/orders"
          className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-900 hover:border-zinc-400"
        >
          Back to orders
        </Link>
      </Card>
    );
  }

  const statusMeta = order.customerStatus ?? getCustomerStatusMeta(order);
  const normalizedStatus = order.normalizedStatus ?? normalizeOrderStatus(order.status);
  const fulfillmentMessage = getFulfillmentMessage(order);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-zinc-900">
              {statusMeta.label}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
              <span>Order #{orderNumberFromId(orderId)}</span>
              <button
                type="button"
                onClick={handleCopyOrderId}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
              >
                Copy order ID
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <OrderStatusBadge
                status={order.status}
                fulfillment={order.fulfillment}
                fulfillmentStatus={order.fulfillmentStatus}
              />
              <p className="text-sm text-zinc-600">{statusMeta.hint}</p>
            </div>
          </div>
          <Link
            href="/orders"
            className="text-sm text-zinc-600 underline-offset-4 hover:underline"
          >
            Back to orders
          </Link>
        </div>
      </div>

      {normalizedStatus === ORDER_STATUSES.CANCELLED ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          This order was cancelled. If you already paid, the store will follow up
          with next steps for pickup, delivery, or refund handling.
        </Card>
      ) : null}

      {normalizedStatus === ORDER_STATUSES.FAILED ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          Payment failed for this order. If you still want these items, place the
          order again from the shop.
        </Card>
      ) : null}

      {normalizedStatus === "refunded" ? (
        <Card className="border-zinc-200 bg-zinc-50 text-sm text-zinc-700">
          A refund has been issued for this order.
        </Card>
      ) : null}

      {order.inventoryException?.hasException ? (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">
          {order.inventoryException.status === "open"
            ? "One or more items in this order need attention. The store will follow up about any replacement or refund steps."
            : "One or more items in this order were updated by the store. Review the item details below for the latest status."}
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Order timeline</h2>
          <p className="text-sm text-zinc-600">
            Track each milestone as your order moves forward.
          </p>
        </div>
        <OrderTimeline order={order} />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">
          {fulfillmentMessage.title}
        </h2>
        {fulfillmentMessage.lines.map((line) => (
          <p key={line} className="text-sm text-zinc-600">
            {line}
          </p>
        ))}
      </Card>

      <OrderSummaryCard order={order} />
    </div>
  );
}
