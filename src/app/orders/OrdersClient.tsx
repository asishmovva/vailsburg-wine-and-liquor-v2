"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { formatOrderDate, orderNumberFromId } from "@/utils/order";

type OrderPointer = {
  orderId: string;
  status?: string;
  total?: number;
  fulfillment?: "delivery" | "pickup";
  createdAt?: Timestamp;
};

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  payment_pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-zinc-200 text-zinc-700",
  fulfilled: "bg-blue-100 text-blue-700",
};

function StatusPill({ status }: { status?: string }) {
  const label = status?.replace("_", " ") ?? "processing";
  const classes = STATUS_STYLES[status ?? ""] ?? "bg-zinc-100 text-zinc-600";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

function OrdersContent() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderPointer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadOrders = async () => {
      if (!db || !user) return;
      setLoading(true);
      setError(null);
      try {
        const snapshot = await getDocs(
          query(
            collection(db, "users", user.uid, "orders"),
            orderBy("createdAt", "desc")
          )
        );
        if (!active) return;
        const data = snapshot.docs.map((docSnap) => {
          const value = docSnap.data() as OrderPointer;
          return {
            ...value,
            orderId: value.orderId ?? docSnap.id,
          };
        });
        setOrders(data);
      } catch (err) {
        if (active) {
          setError((err as Error).message ?? "Unable to load orders.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadOrders();
    return () => {
      active = false;
    };
  }, [user]);

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

  if (orders.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-zinc-600">No orders yet.</p>
        <Link
          href="/shop"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Start shopping
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.orderId} className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-500">Order</p>
              <p className="text-lg font-semibold text-zinc-900">
                #{orderNumberFromId(order.orderId)}
              </p>
              <p className="text-xs text-zinc-500">
                {formatOrderDate(order.createdAt)}
              </p>
            </div>
            <StatusPill status={order.status} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-zinc-600">
            <span className="capitalize">
              {order.fulfillment ?? "pickup"}
            </span>
            <span className="font-semibold text-zinc-900">
              ${Number(order.total ?? 0).toFixed(2)}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/orders/${order.orderId}`}
              className="text-sm font-medium text-zinc-900 underline-offset-4 hover:underline"
            >
              View details
            </Link>
            <Link
              href="/shop"
              className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-900 hover:border-zinc-400"
            >
              Reorder
            </Link>
          </div>
        </Card>
      ))}
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
