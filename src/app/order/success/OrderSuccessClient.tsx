"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { orderNumberFromId } from "@/utils/order";

export default function OrderSuccessClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";

  useEffect(() => {
    if (!orderId) return;
    const timer = setTimeout(() => {
      router.replace(`/orders/${encodeURIComponent(orderId)}`);
    }, 600);
    return () => clearTimeout(timer);
  }, [orderId, router]);

  if (!orderId) {
    return (
      <Card className="space-y-3 p-6 text-sm text-zinc-600">
        <p>Order confirmed.</p>
        <Link
          href="/orders"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          View your orders
        </Link>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-6 text-sm text-zinc-600">
      <p className="text-base font-semibold text-zinc-900">
        Order #{orderNumberFromId(orderId)} confirmed
      </p>
      <p>Redirecting you to your order tracking page...</p>
      <Link
        href={`/orders/${orderId}`}
        className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        View order
      </Link>
    </Card>
  );
}
