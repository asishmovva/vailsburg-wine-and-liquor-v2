"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Card } from "@/components/ui/Card";
import { toast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { db } from "@/lib/firebase";
import { formatOrderDate, orderNumberFromId } from "@/utils/order";

type OrderPointer = {
  orderId: string;
  status?: string;
  fulfillmentStatus?: string;
  posPushStatus?: string;
  total?: number;
  fulfillment?: "delivery" | "pickup";
  createdAt?: Timestamp;
};

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
  category?: string;
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
  const router = useRouter();
  const { addItem } = useCart();
  const [orders, setOrders] = useState<OrderPointer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !user) return;
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, "users", user.uid, "orders"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => {
          const value = docSnap.data() as OrderPointer;
          return {
            ...value,
            orderId: value.orderId ?? docSnap.id,
          };
        });
        setOrders(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message ?? "Unable to load orders.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleReorder = async (orderId: string) => {
    if (!user || !db || !orderId) return;
    setReorderingId(orderId);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
            <span className="capitalize">
              Fulfillment: {order.fulfillmentStatus ?? "processing"}
            </span>
            {order.posPushStatus === "failed" ? (
              <span className="text-amber-600">
                Store confirmation pending
              </span>
            ) : null}
          </div>

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
