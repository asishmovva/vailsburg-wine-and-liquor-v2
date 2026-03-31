"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderSummaryCard } from "@/components/orders/OrderSummaryCard";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { ORDER_STATUSES } from "@/lib/orders/status";
import {
  getCustomerStatusMeta,
  normalizeOrderStatus,
} from "@/lib/orders/statusDisplay";
import type { OrderRecord } from "@/lib/orders/types";
import { orderNumberFromId } from "@/utils/order";

function getFulfillmentMessage(order: OrderRecord) {
  if (order.fulfillment === "delivery") {
        return {
          title: "Delivery details",
          lines: [
            order.delivery?.address ?? "Delivery address unavailable.",
            order.delivery?.miles
              ? `${order.delivery.miles.toFixed(1)} miles from store`
              : "Same-day delivery requested.",
            "We'll notify you when your order is on the way.",
          ],
        };
  }

  return {
    title: "Pickup details",
    lines: [
      "We'll notify you when your order is ready for pickup.",
      "Bring your order confirmation and a valid ID at pickup.",
    ],
  };
}

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadOrder = async () => {
      if (!user || !orderId) return;
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        console.log("Order detail fetch", {
          orderId,
          status: response.status,
        });
        if (!active) return;
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
        setOrder({
          ...data,
          id: data.id ?? orderId,
          items: data.items ?? [],
          deliveryFee: data.deliveryFee ?? 0,
          tip: data.tip ?? 0,
          tax: data.tax ?? 0,
          subtotal: data.subtotal ?? 0,
          total: data.total ?? 0,
        });
      } catch (err) {
        if (active) {
          setError((err as Error).message ?? "Unable to load order.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadOrder();
    return () => {
      active = false;
    };
  }, [orderId, user]);

  if (loading) {
    return (
      <Card className="p-6 text-sm text-zinc-600">Loading order...</Card>
    );
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

  const statusMeta = getCustomerStatusMeta(order);
  const normalizedStatus = normalizeOrderStatus(order.status);
  const fulfillmentMessage = getFulfillmentMessage(order);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Order #{orderNumberFromId(orderId)}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <OrderStatusBadge
            status={order.status}
            fulfillment={order.fulfillment}
            fulfillmentStatus={order.fulfillmentStatus}
          />
          <p className="text-sm text-zinc-600">{statusMeta.hint}</p>
        </div>
        <Link
          href="/orders"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline"
        >
          Back to orders
        </Link>
      </div>

      {normalizedStatus === ORDER_STATUSES.CANCELLED ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          This order was cancelled.
          {order.cancellationReason ? ` Reason: ${order.cancellationReason}` : ""}
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
