"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

type OrderSummary = {
  subtotal: number;
  taxableSubtotal?: number;
  deliveryFee: number;
  tip: number;
  tax: number;
  total: number;
  fulfillment: "delivery" | "pickup";
  address?: {
    street: string;
    apt?: string;
    city: string;
    state: string;
    zip: string;
  };
  items: Array<{
    productId: string;
    name: string;
    price: number;
    qty: number;
    image?: string | null;
    category?: string;
  }>;
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

const GUEST_ORDERS_KEY = "vw_guest_orders_v1";

function recordGuestOrder(orderId: string) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(GUEST_ORDERS_KEY);
  const existing = raw ? (JSON.parse(raw) as string[]) : [];
  const next = [orderId, ...existing.filter((id) => id !== orderId)].slice(0, 10);
  window.localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify(next));
}

function PaymentForm({
  clientSecret,
  orderId,
  summary,
  isGuest,
  email,
}: {
  clientSecret: string;
  orderId: string;
  summary: OrderSummary | null;
  isGuest: boolean;
  email?: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { clear } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    if (processing) return;

    setProcessing(true);
    setError(null);

    const card = elements.getElement(CardElement);
    if (!card) {
      setError("Card input is not ready.");
      setProcessing(false);
      return;
    }

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card,
        billing_details: email ? { email } : undefined,
      },
    });

    if (result.error) {
      setError(result.error.message ?? "Payment failed. Try again.");
      setProcessing(false);
      return;
    }

    if (result.paymentIntent?.status === "succeeded") {
      if (summary && typeof window !== "undefined") {
        window.localStorage.setItem(
          "vw_last_order_summary",
          JSON.stringify({ orderId, ...summary })
        );
      }
      if (isGuest) {
        recordGuestOrder(orderId);
      }
      clear();
      router.replace(`/order/success?orderId=${encodeURIComponent(orderId)}`);
      return;
    }

    setError("Payment requires additional steps. Please try again.");
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: "#18181b",
                "::placeholder": { color: "#a1a1aa" },
              },
            },
          }}
        />
      </div>
      <p className="text-xs text-zinc-500">
        Wallet options appear if supported by your device/browser.
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={!stripe || processing} className="w-full">
        {processing ? "Processing..." : "Confirm payment"}
      </Button>
      <Link href="/checkout" className="block text-center text-xs text-zinc-500">
        Back to checkout
      </Link>
    </form>
  );
}

export default function PaymentClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const clientSecret = searchParams.get("clientSecret") ?? "";
  const { user } = useAuth();

  const summary = useMemo(() => {
    if (!orderId || typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(`vw_order_summary_${orderId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OrderSummary;
    } catch {
      return null;
    }
  }, [orderId]);

  const tipValue = summary
    ? summary.tip ?? (summary as OrderSummary & { tipAmount?: number }).tipAmount ?? 0
    : 0;

  const stripeReady = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  const elementsOptions = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: "stripe" as const,
      },
    }),
    [clientSecret]
  );

  if (!stripeReady) {
    return (
      <Card className="p-6 text-sm text-red-600">
        Stripe publishable key is missing. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        and restart the dev server.
      </Card>
    );
  }

  if (!orderId || !clientSecret) {
    return (
      <Card className="p-6 text-sm text-zinc-600">
        Missing payment session. Return to checkout.
      </Card>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Payment</h1>
          <p className="text-sm text-zinc-600">
            Enter your card details to complete the order.
          </p>
        </div>

        <Elements stripe={stripePromise} options={elementsOptions}>
          <PaymentForm
            clientSecret={clientSecret}
            orderId={orderId}
            summary={summary}
            isGuest={!user}
            email={user?.email}
          />
        </Elements>
      </div>

      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Order summary</h2>
          {summary ? (
            <div className="space-y-2 text-sm text-zinc-600">
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
                  <span>{formatMoney(tipValue)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span>Tax</span>
                <span>{formatMoney(summary.tax)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-base font-semibold">
                <span>Total</span>
                <span>{formatMoney(summary.total)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Order summary will appear once payment session loads.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
