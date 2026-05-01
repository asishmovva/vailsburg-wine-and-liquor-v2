"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { Card } from "@/components/ui/Card";
import { toast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { authedFetch } from "@/lib/client/authedFetch";
import {
  getCustomerStatusMeta,
  normalizeOrderStatus,
} from "@/lib/orders/statusMapping";
import type { OrderItem, OrderListRecord } from "@/lib/orders/types";
import { formatOrderDate, orderNumberFromId } from "@/utils/order";

function buildItemPreview(items?: OrderItem[]) {
  if (!items || items.length === 0) {
    return { count: 0, summary: "Item summary available on order details." };
  }

  const itemCount = items.reduce((sum, item) => sum + Math.max(item.qty, 0), 0);
  const names = items.map((item) => item.name).filter(Boolean);
  const preview = names.slice(0, 2).join(", ");
  const remainder = Math.max(itemCount - 2, 0);

  return {
    count: itemCount,
    summary:
      remainder > 0
        ? `${itemCount} items • ${preview}, +${remainder} more`
        : `${itemCount} items • ${preview}`,
  };
}

function OrdersContent() {
  const { user } = useAuth();
  const router = useRouter();
  const { addItem } = useCart();
  const [orders, setOrders] = useState<OrderListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const loadOrders = useCallback(
    async (showLoader = false) => {
      if (!user) return;
      if (showLoader) setLoading(true);
      try {
        const response = await authedFetch("/api/orders");
        if (!response.ok) {
          throw new Error("Unable to load orders.");
        }
        const payload = (await response.json()) as { orders?: OrderListRecord[] };
        setOrders(payload.orders ?? []);
        setError(null);
      } catch (err) {
        setError((err as Error).message ?? "Unable to load orders.");
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;
    void loadOrders(true);
  }, [loadOrders, user]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      void loadOrders(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadOrders, user]);

  const handleReorder = async (orderId: string) => {
    if (!user || !orderId) return;
    setReorderingId(orderId);
    try {
      const response = await authedFetch(`/api/orders/${orderId}`);

      if (!response.ok) {
        throw new Error("Unable to load order.");
      }

      const payload = (await response.json()) as {
        order?: { items?: OrderItem[] };
      };
      const items = payload.order?.items ?? [];

      let addedCount = 0;
      let skippedCount = 0;
      let blockedCount = 0;

      const ids = items.map((item) => item.productId);
      const productsResponse = await fetch("/api/products/by-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!productsResponse.ok) {
        throw new Error("Unable to load products.");
      }

      const productsPayload = (await productsResponse.json()) as {
        items?: Array<{
          id: string;
          name?: string;
          price?: number;
          stock?: number;
          image?: string;
          category?: string;
          size?: string;
          pack?: string;
        }>;
      };

      const productMap = new Map(
        (productsPayload.items ?? []).map((product) => [product.id, product])
      );

      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
          blockedCount += 1;
          continue;
        }
        const stock = Number(product.stock ?? 0);
        if (stock <= 0) {
          skippedCount += 1;
          continue;
        }
        const qty = Math.min(Number(item.qty ?? 1), stock);
        const result = addItem({
          productId: item.productId,
          qty,
          price: Number(product.price ?? item.price ?? 0),
          name: String(product.name ?? item.name ?? "Item"),
          image: String(product.image ?? item.image ?? ""),
          category: String(product.category ?? item.category ?? ""),
          size: String(product.size ?? ""),
          pack: String(product.pack ?? ""),
          stock,
        });

        if (result === "added") {
          addedCount += 1;
        }
      }

      if (blockedCount > 0) {
        toast.error(`${blockedCount} items are not available online and were skipped.`);
      }

      if (skippedCount > 0) {
        toast.error(`${skippedCount} items were out of stock and skipped.`);
      }

      if (addedCount > 0) {
        toast.success(`Added ${addedCount} items to cart`);
        router.push("/cart");
      } else if (skippedCount === 0) {
        toast.error("Could not add items. Try again.");
      }
    } catch (err) {
      toast.error((err as Error).message ?? "Could not reorder. Try again.");
    } finally {
      setReorderingId(null);
    }
  };

  const hasOrders = orders.length > 0;
  const filteredOrders = useMemo(() => orders, [orders]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <Card key={index} className="space-y-3 p-6">
            <div className="h-4 w-32 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-4 w-24 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-10 w-28 animate-pulse rounded-full bg-zinc-100" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="space-y-2 p-6 text-sm text-red-600">
        <p>Unable to load orders.</p>
        <p>{error}</p>
      </Card>
    );
  }

  if (!hasOrders) {
    return (
      <Card className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-zinc-600">
          You haven&apos;t placed any orders yet.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/shop"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Shop now
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-900 hover:border-zinc-400"
          >
            Browse deals
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {filteredOrders.map((order) => {
        const statusMeta = order.customerStatus ?? getCustomerStatusMeta({
          status: order.status,
          fulfillment: order.fulfillment ?? "pickup",
        });
        const preview = buildItemPreview(order.items);
        const normalizedStatus = order.normalizedStatus ?? normalizeOrderStatus(order.status);

        return (
          <Card key={order.orderId} className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Order</p>
                <p className="text-lg font-semibold text-zinc-900">
                  #{orderNumberFromId(order.orderId)}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatOrderDate(order.createdAt)}
                </p>
                <p className="text-xs text-zinc-500">{statusMeta.hint}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <OrderStatusBadge
                  status={order.status}
                  fulfillment={order.fulfillment ?? "pickup"}
                />
                <span className="text-xs text-zinc-500 capitalize">
                  {normalizedStatus === "OUT_FOR_DELIVERY"
                    ? "Delivery update"
                    : order.fulfillment ?? "pickup"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-zinc-600">
              <span className="capitalize">{order.fulfillment ?? "pickup"}</span>
              <span>
                {preview.count > 0 ? `${preview.count} items` : "Order details available"}
              </span>
              <span className="font-semibold text-zinc-900">
                ${Number(order.total ?? 0).toFixed(2)}
              </span>
            </div>

            <p className="text-sm text-zinc-600">{preview.summary}</p>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/orders/${order.orderId}`}
                className="text-sm font-medium text-zinc-900 underline-offset-4 hover:underline"
              >
                View details
              </Link>
              <button
                type="button"
                onClick={() => handleReorder(order.orderId)}
                disabled={reorderingId === order.orderId}
                className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-900 hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reorderingId === order.orderId ? "Reordering..." : "Reorder"}
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function OrdersClient({ redirectTo }: { redirectTo: string }) {
  return (
    <RequireAuth redirectTo={redirectTo}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Your Orders</h1>
          <p className="text-sm text-zinc-600">
            Track current and past orders in one place.
          </p>
        </div>
        <OrdersContent />
      </div>
    </RequireAuth>
  );
}
