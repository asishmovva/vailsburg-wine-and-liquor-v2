"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useCart } from "@/hooks/useCart";
import { calcTotals } from "@/utils/calcTotals";

const DELIVERY_FEE = 5.99;
const MIN_DELIVERY_ORDER = 20;

const TIP_OPTIONS = [0, 0.1, 0.15, 0.2];

const policyLinks = [
  { href: "/policies/delivery", label: "Delivery Policy" },
  { href: "/policies/pickup", label: "Pickup Policy" },
  { href: "/policies/refund-cancellation", label: "Refund & Cancellation" },
  { href: "/policies/terms", label: "Terms of Service" },
  { href: "/policies/privacy", label: "Privacy Policy" },
  { href: "/policies/age-verification", label: "Age Verification (21+)" },
];

type Fulfillment = "delivery" | "pickup";

type Address = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function CheckoutClient() {
  const { items, loading } = useCart();

  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [tipMode, setTipMode] = useState<"percent" | "custom">("percent");
  const [tipPercent, setTipPercent] = useState(0.1);
  const [customTip, setCustomTip] = useState(0);
  const [address, setAddress] = useState<Address>({
    street: "",
    city: "",
    state: "NJ",
    zip: "",
  });

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.price * item.qty, 0),
    [items]
  );

  const tipAmount = useMemo(() => {
    if (tipMode === "custom") return customTip;
    return subtotal * tipPercent;
  }, [tipMode, tipPercent, customTip, subtotal]);

  const deliveryFee = fulfillment === "delivery" ? DELIVERY_FEE : 0;

  const totals = useMemo(
    () => calcTotals({ items, deliveryFee, tip: tipAmount }),
    [items, deliveryFee, tipAmount]
  );

  const addressValid =
    fulfillment === "pickup" ||
    (address.street.trim() &&
      address.city.trim() &&
      address.state.trim().toUpperCase() === "NJ" &&
      address.zip.trim());

  const meetsMinOrder =
    fulfillment === "pickup" || subtotal >= MIN_DELIVERY_ORDER;

  const canPlaceOrder =
    items.length > 0 && addressValid && meetsMinOrder && !loading;

  if (loading) {
    return <Card className="p-6 text-sm text-zinc-600">Loading checkout...</Card>;
  }

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-zinc-600">Your cart is empty.</p>
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
    <div className="grid gap-8 pb-24 lg:pb-0 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Checkout</h1>
          <p className="text-sm text-zinc-600">
            Choose pickup or delivery and confirm your details.
          </p>
        </div>

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">Fulfillment</h2>
          <div className="flex flex-wrap gap-2">
            {(["delivery", "pickup"] as Fulfillment[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFulfillment(option)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  fulfillment === option
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-700"
                }`}
              >
                {option === "delivery" ? "Delivery" : "Pickup"}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-600">
            Same-day delivery within 8 miles. Pickup available.
          </p>
        </Card>

        {fulfillment === "delivery" ? (
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">
              Delivery address
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  placeholder="Street address"
                  value={address.street}
                  onChange={(event) =>
                    setAddress((prev) => ({
                      ...prev,
                      street: event.target.value,
                    }))
                  }
                />
              </div>
              <Input
                placeholder="City"
                value={address.city}
                onChange={(event) =>
                  setAddress((prev) => ({
                    ...prev,
                    city: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="State"
                value={address.state}
                onChange={(event) =>
                  setAddress((prev) => ({
                    ...prev,
                    state: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="ZIP"
                value={address.zip}
                onChange={(event) =>
                  setAddress((prev) => ({
                    ...prev,
                    zip: event.target.value,
                  }))
                }
              />
            </div>
            <p className="text-xs text-zinc-500">
              Delivery radius validation will be added in Phase 7.
            </p>
          </Card>
        ) : null}

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">Tip</h2>
          <div className="flex flex-wrap gap-2">
            {TIP_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setTipMode("percent");
                  setTipPercent(option);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  tipMode === "percent" && tipPercent === option
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-700"
                }`}
              >
                {option === 0 ? "No tip" : `${option * 100}%`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTipMode("custom")}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                tipMode === "custom"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 text-zinc-700"
              }`}
            >
              Custom
            </button>
          </div>
          {tipMode === "custom" ? (
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Enter tip"
              value={customTip ? String(customTip) : ""}
              onChange={(event) =>
                setCustomTip(Number.parseFloat(event.target.value) || 0)
              }
            />
          ) : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Policies</h2>
          <p className="text-sm text-zinc-600">
            By placing an order, you agree to the following policies.
          </p>
          <ul className="grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
            {policyLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-zinc-900">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">Order summary</h2>
          <div className="space-y-2 text-sm text-zinc-600">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatMoney(totals.subtotal)}</span>
            </div>
            {fulfillment === "delivery" ? (
              <div className="flex items-center justify-between">
                <span>Delivery fee</span>
                <span>{formatMoney(totals.deliveryFee)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span>Tip</span>
              <span>{formatMoney(totals.tip)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Estimated tax</span>
              <span>Calculated at payment</span>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-4 text-base font-semibold">
            <span>Total</span>
            <span>{formatMoney(totals.total)}</span>
          </div>
          {!meetsMinOrder ? (
            <p className="text-xs text-amber-600">
              Delivery requires a minimum order of ${MIN_DELIVERY_ORDER}.
            </p>
          ) : null}
          {!addressValid && fulfillment === "delivery" ? (
            <p className="text-xs text-amber-600">
              Enter a valid NJ delivery address to continue.
            </p>
          ) : null}
          <Button disabled={!canPlaceOrder} aria-disabled={!canPlaceOrder}>
            Place order (payment in Phase 8)
          </Button>
        </Card>

        <Card className="space-y-2 text-xs text-zinc-500">
          <p>Tax added at checkout.</p>
          <p>Same-day delivery only.</p>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500">Total</p>
            <p className="text-sm font-semibold text-zinc-900">
              {formatMoney(totals.total)}
            </p>
          </div>
          <Button disabled={!canPlaceOrder} aria-disabled={!canPlaceOrder}>
            Place order
          </Button>
        </div>
      </div>
    </div>
  );
}
