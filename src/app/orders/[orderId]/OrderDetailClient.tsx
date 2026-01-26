"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { OrderDetails, type OrderRecord } from "@/components/orders/OrderDetails";
import { orderNumberFromId } from "@/utils/order";

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadOrder = async () => {
      if (!db || !user || !orderId) return;
      setLoading(true);
      setError(null);
      try {
        const snap = await getDoc(doc(db, "orders", orderId));
        if (!active) return;
        if (!snap.exists()) {
          setOrder(null);
          return;
        }
        const data = snap.data() as OrderRecord;
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
      <Card className="p-6 text-sm text-zinc-600">
        We could not find this order.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Order #{orderNumberFromId(orderId)}
        </h1>
        <p className="text-sm text-zinc-600 capitalize">
          Status: {order.status ?? "processing"}
        </p>
        <Link
          href="/orders"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline"
        >
          Back to orders
        </Link>
      </div>

      <OrderDetails order={order} />
    </div>
  );
}
