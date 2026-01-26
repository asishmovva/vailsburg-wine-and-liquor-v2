"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useCart } from "@/hooks/useCart";
import { calcSubtotal } from "@/utils/calcTotals";

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function CartClient() {
  const { items, loading, updateQty, removeItem, clear, totalQty } = useCart();
  const [overLimit, setOverLimit] = useState<Record<string, number>>({});
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});

  const subtotal = useMemo(() => calcSubtotal(items), [items]);

  const handleQtyChange = (productId: string, next: string, stock: number) => {
    setQtyDrafts((prev) => ({ ...prev, [productId]: next }));

    if (next === "") return;
    const parsed = Number.parseInt(next, 10);
    if (Number.isNaN(parsed)) return;

    if (parsed > stock) {
      setOverLimit((prev) => ({ ...prev, [productId]: stock }));
    } else {
      setOverLimit((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }

    const clamped = Math.max(1, Math.min(parsed, stock));
    updateQty(productId, clamped, stock);
  };

  const handleQtyBlur = (productId: string, stock: number) => {
    const draft = qtyDrafts[productId];
    if (!draft) {
      setQtyDrafts((prev) => ({ ...prev, [productId]: "" }));
      return;
    }
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(1, Math.min(parsed, stock));
    updateQty(productId, clamped, stock);
    setQtyDrafts((prev) => ({ ...prev, [productId]: String(clamped) }));
  };

  if (loading) {
    return (
      <Card className="p-6 text-sm text-zinc-600">Loading cart...</Card>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Cart</h1>
          <p className="text-sm text-zinc-600">
            Review your items before checkout.
          </p>
        </div>

        <Card className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-zinc-600">Your cart is empty.</p>
          <Link
            href="/shop"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Start shopping
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Cart</h1>
          <p className="text-sm text-zinc-600">
            Review your items before checkout.
          </p>
        </div>
        <Button variant="outline" onClick={clear}>
          Clear cart
        </Button>
      </div>

      <div className="hidden rounded-2xl border border-zinc-200 bg-white px-6 py-4 text-sm text-zinc-600 lg:block">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-4">
          <span>Item</span>
          <span>Price</span>
          <span>Quantity</span>
          <span>Total</span>
        </div>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const draftValue = qtyDrafts[item.productId];
          const qtyValue = draftValue !== undefined ? draftValue : String(item.qty);
          const itemTotal = item.price * item.qty;
          const maxMessage = overLimit[item.productId];

          return (
            <Card key={item.productId} className="p-4">
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr] lg:items-center">
                <div className="flex gap-4">
                  <div className="h-20 w-20 rounded-xl bg-zinc-100" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.category} {item.size ? `• ${item.size}` : ""} {item.pack ? `• ${item.pack}` : ""}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                      onClick={() => removeItem(item.productId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="text-sm text-zinc-700">
                  {formatMoney(item.price)}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-full border border-zinc-200 text-lg text-zinc-700"
                    onClick={() => updateQty(item.productId, item.qty - 1, item.stock)}
                    disabled={item.qty <= 1}
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <Input
                    type="number"
                    min={1}
                    max={item.stock}
                    className="h-10 w-16 rounded-xl text-center"
                    value={qtyValue}
                    onChange={(event) =>
                      handleQtyChange(item.productId, event.target.value, item.stock)
                    }
                    onBlur={() => handleQtyBlur(item.productId, item.stock)}
                  />
                  <button
                    type="button"
                    className="h-9 w-9 rounded-full border border-zinc-200 text-lg text-zinc-700"
                    onClick={() => updateQty(item.productId, item.qty + 1, item.stock)}
                    disabled={item.qty >= item.stock}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <div className="text-sm font-semibold text-zinc-900">
                  {formatMoney(itemTotal)}
                </div>
              </div>
              {maxMessage ? (
                <p className="mt-3 text-xs text-amber-600">
                  Max available: {maxMessage}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-zinc-600">Subtotal</p>
          <p className="text-2xl font-semibold text-zinc-900">
            {formatMoney(subtotal)}
          </p>
          <p className="text-xs text-zinc-500">Tax added at checkout.</p>
        </div>
        <div className="flex w-full gap-3 sm:w-auto">
          <Link
            href="/shop"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-zinc-200 text-sm font-medium text-zinc-700"
          >
            Continue shopping
          </Link>
          <Link
            href="/checkout"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white"
          >
            Checkout ({totalQty})
          </Link>
        </div>
      </Card>
    </div>
  );
}
