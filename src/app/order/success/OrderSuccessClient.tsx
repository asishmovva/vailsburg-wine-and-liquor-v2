"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";

type OrderSummary = {
  orderId: string;
  fulfillment: "delivery" | "pickup";
  subtotal: number;
  deliveryFee: number;
  tipAmount: number;
  tax: number;
  total: number;
  address?: {
    street: string;
    apt?: string;
    city: string;
    state: string;
    zip: string;
  };
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function readLocalSummary(orderId: string) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("vw_last_order_summary");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OrderSummary;
    if (parsed.orderId !== orderId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function OrderSuccessClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const summary = useMemo(() => readLocalSummary(orderId), [orderId]);

  if (!orderId) {
    return (
      <Card className="p-6 text-sm text-zinc-600">
        Missing order reference.
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className="space-y-3 p-6 text-sm text-zinc-600">
        <p>Order confirmed.</p>
        <p>We’re finalizing your receipt. Check your email for updates.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Order confirmed
        </h1>
        <p className="text-sm text-zinc-600">
          Order #{summary.orderId}
        </p>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>Fulfillment</span>
          <span className="capitalize">{summary.fulfillment}</span>
        </div>
        {summary.fulfillment === "delivery" && summary.address ? (
          <div className="text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">Delivery address</p>
            <p>{summary.address.street}{summary.address.apt ? `, ${summary.address.apt}` : ""}</p>
            <p>
              {summary.address.city}, {summary.address.state} {summary.address.zip}
            </p>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-2 text-sm text-zinc-600">
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(summary.subtotal)}</span>
        </div>
        {summary.fulfillment === "delivery" ? (
          <div className="flex items-center justify-between">
            <span>Delivery fee</span>
            <span>{formatMoney(summary.deliveryFee)}</span>
          </div>
        ) : null}
        {summary.fulfillment === "delivery" ? (
          <div className="flex items-center justify-between">
            <span>Tip</span>
            <span>{formatMoney(summary.tipAmount)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span>Tax</span>
          <span>{formatMoney(summary.tax)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-base font-semibold text-zinc-900">
          <span>Total</span>
          <span>{formatMoney(summary.total)}</span>
        </div>
      </Card>

      <Link
        href="/shop"
        className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Continue shopping
      </Link>
    </div>
  );
}
