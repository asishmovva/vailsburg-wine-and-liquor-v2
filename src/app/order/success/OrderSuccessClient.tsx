"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { OrderDetails, type OrderRecord } from "@/components/orders/OrderDetails";
import { orderNumberFromId } from "@/utils/order";

type Address = {
  street: string;
  apt?: string;
  city: string;
  state: string;
  zip: string;
};

type LocalSummary = {
  orderId: string;
  fulfillment: "delivery" | "pickup";
  subtotal: number;
  deliveryFee: number;
  tip?: number;
  tipAmount?: number;
  tax: number;
  total: number;
  address?: Address;
  items?: Array<{
    productId: string;
    name: string;
    price: number;
    qty: number;
    image?: string | null;
    category?: string;
  }>;
};

function formatAddress(address: Address) {
  const parts = [
    address.street,
    address.apt ? `Apt ${address.apt}` : "",
    address.city,
    address.state,
    address.zip,
  ]
    .map((part) => part?.toString().trim())
    .filter(Boolean);
  return parts.join(", ");
}

function readLocalSummary(orderId: string) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("vw_last_order_summary");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocalSummary;
    if (parsed.orderId !== orderId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function summaryToOrder(summary: LocalSummary): OrderRecord {
  const tip = summary.tip ?? summary.tipAmount ?? 0;
  return {
    id: summary.orderId,
    fulfillment: summary.fulfillment,
    delivery:
      summary.fulfillment === "delivery" && summary.address
        ? {
            address: formatAddress(summary.address),
            miles: 0,
            eligible: true,
          }
        : null,
    items: summary.items ?? [],
    subtotal: summary.subtotal,
    deliveryFee: summary.deliveryFee,
    tip,
    tax: summary.tax,
    total: summary.total,
  };
}

function statusCopy(status?: string) {
  if (!status) return "Processing payment";
  switch (status) {
    case "paid":
      return "Order confirmed";
    case "payment_pending":
      return "Payment processing";
    case "failed":
      return "Payment failed";
    case "cancelled":
      return "Payment cancelled";
    default:
      return "Order confirmed";
  }
}

export default function OrderSuccessClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const { user, loading } = useAuth();

  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localSummary = useMemo(() => readLocalSummary(orderId), [orderId]);

  const fetchOrder = useCallback(async () => {
    if (!user || !orderId) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          setError("Order not found or not allowed.");
        } else {
          const payload = (await response.json()) as { error?: string };
          setError(payload.error ?? "Unable to load order.");
        }
        setOrder(null);
        return;
      }
      const payload = (await response.json()) as { order: OrderRecord };
      const data = payload.order;
      setOrder({
        ...data,
        id: data.id ?? orderId,
        items: data.items ?? [],
        deliveryFee: data.deliveryFee ?? 0,
        tip: (data as OrderRecord).tip ?? 0,
        tax: data.tax ?? 0,
        subtotal: data.subtotal ?? 0,
        total: data.total ?? 0,
      });
    } catch (err) {
      setError((err as Error).message ?? "Unable to load order.");
    }
  }, [orderId, user]);

  useEffect(() => {
    if (!loading && user && orderId) {
      const timer = setTimeout(() => {
        void fetchOrder();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [fetchOrder, loading, orderId, user]);

  useEffect(() => {
    if (!user || !orderId) return;
    let attempts = 0;
    const maxAttempts = 12;
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      attempts += 1;
      try {
        const token = await user.getIdToken();
        await fetch(`/api/orders/verify?orderId=${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        await fetchOrder();
      } catch {
        // ignore polling errors, fallback to next attempt
      }
      if (attempts >= maxAttempts && timer) {
        clearInterval(timer);
      }
    };

    if (!order || order.status === "payment_pending") {
      timer = setInterval(poll, 2500);
      poll();
      return () => {
        if (timer) clearInterval(timer);
      };
    }
    return undefined;
  }, [order, orderId, user, fetchOrder]);

  if (!orderId) {
    return (
      <Card className="p-6 text-sm text-zinc-600">Missing order reference.</Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6 text-sm text-zinc-600">
        Loading your order...
      </Card>
    );
  }

  if (user) {
    if (error) {
      return (
        <Card className="p-6 text-sm text-red-600">
          {error}
        </Card>
      );
    }

    if (!order) {
      return (
        <Card className="p-6 text-sm text-zinc-600">
          We&apos;re still finalizing your order. Please refresh in a moment.
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {statusCopy(order.status)}
          </h1>
          <p className="text-sm text-zinc-600">
            Order #{orderNumberFromId(orderId)}
          </p>
          {order.status === "payment_pending" ? (
            <p className="text-xs text-zinc-500">
              Payment confirmation can take a moment. We&apos;ll update this page
              automatically.
            </p>
          ) : null}
        </div>

        <OrderDetails order={order} />

        <Link
          href="/shop"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  if (!localSummary) {
    return (
      <Card className="space-y-2 p-6 text-sm text-zinc-600">
        <p>Order confirmed.</p>
        <p>We&apos;re finalizing your receipt. Check your email for updates.</p>
      </Card>
    );
  }

  const guestOrder = summaryToOrder(localSummary);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Order confirmed</h1>
        <p className="text-sm text-zinc-600">
          Order #{orderNumberFromId(orderId)}
        </p>
      </div>
      <OrderDetails order={guestOrder} />
      <Link
        href="/shop"
        className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Continue shopping
      </Link>
    </div>
  );
}
