"use client";

import { Card } from "@/components/ui/Card";
import { getCustomerStatusMeta } from "@/lib/orders/statusDisplay";
import type { OrderRecord } from "@/lib/orders/types";

const CATEGORY_STYLES: Record<string, { label: string; classes: string }> = {
  BEER: {
    label: "Beer",
    classes: "from-amber-100 via-yellow-50 to-orange-100",
  },
  WINE: {
    label: "Wine",
    classes: "from-rose-100 via-pink-50 to-red-100",
  },
  WHISKEY: {
    label: "Whiskey",
    classes: "from-amber-100 via-orange-50 to-yellow-100",
  },
  VODKA: {
    label: "Vodka",
    classes: "from-sky-100 via-blue-50 to-indigo-100",
  },
  TEQUILA: {
    label: "Tequila",
    classes: "from-lime-100 via-green-50 to-emerald-100",
  },
  RUM: {
    label: "Rum",
    classes: "from-amber-100 via-stone-50 to-orange-100",
  },
  GIN: {
    label: "Gin",
    classes: "from-emerald-100 via-green-50 to-teal-100",
  },
  EXTRAS: {
    label: "Extras",
    classes: "from-slate-100 via-zinc-50 to-stone-100",
  },
};

function getPlaceholder(category?: string) {
  const key = category?.trim().toUpperCase() ?? "";
  return (
    CATEGORY_STYLES[key] ?? {
      label: category || "Spirits",
      classes: "from-zinc-100 via-white to-zinc-200",
    }
  );
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export function OrderSummaryCard({ order }: { order: OrderRecord }) {
  const fulfillment = order.fulfillment ?? "pickup";
  const customerStatus = order.customerStatus ?? getCustomerStatusMeta(order);

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
          <div>
            <p className="font-medium text-zinc-900">{customerStatus.label}</p>
            <p>{customerStatus.hint}</p>
          </div>
          <span className="capitalize">{fulfillment}</span>
        </div>
        {fulfillment === "delivery" && order.delivery ? (
          <div className="space-y-1 text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">Delivery address</p>
            <p>{order.delivery.address}</p>
            {Number.isFinite(order.delivery.miles) && (order.delivery.miles ?? 0) > 0 ? (
              <p className="text-xs text-zinc-500">
                {(order.delivery.miles ?? 0).toFixed(1)} miles from store
              </p>
            ) : null}
            {order.deliveryInstructions ? (
              <p className="text-xs text-zinc-500">
                Delivery instructions: {order.deliveryInstructions}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1 text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">Pickup details</p>
            <p>We&apos;ll notify you when your order is ready for pickup.</p>
            <p>Show this order at the counter when you arrive.</p>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">Items</h2>
        {order.items.length === 0 ? (
          <p className="text-sm text-zinc-500">No items found for this order.</p>
        ) : (
          <div className="space-y-4">
            {order.items.map((item) => {
              const placeholder = getPlaceholder(item.category);
              return (
                <div
                  key={`${item.productId}-${item.name}`}
                  className="flex items-center gap-4 border-b border-zinc-100 pb-4 last:border-b-0 last:pb-0"
                >
                  {item.image ? (
                    <div
                      className="h-16 w-16 rounded-xl bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.image})` }}
                      aria-label={item.name}
                    />
                  ) : (
                    <div
                      className={`flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-gradient-to-br ${placeholder.classes}`}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                        {placeholder.label}
                      </span>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Qty <span className="font-semibold text-zinc-700">{item.qty}</span>
                      {" - "}
                      {formatMoney(item.price)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatMoney(item.price * item.qty)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="space-y-2 text-sm text-zinc-600">
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal)}</span>
        </div>
        {fulfillment === "delivery" ? (
          <div className="flex items-center justify-between">
            <span>Delivery fee</span>
            <span>{formatMoney(order.deliveryFee)}</span>
          </div>
        ) : null}
        {order.tip > 0 ? (
          <div className="flex items-center justify-between">
            <span>Tip</span>
            <span>{formatMoney(order.tip)}</span>
          </div>
        ) : null}
        {order.paymentMethodLabel ? (
          <div className="flex items-center justify-between">
            <span>Payment method</span>
            <span>{order.paymentMethodLabel}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span>Age confirmation</span>
          <span>{order.ageVerified ? "21+ confirmed" : "Pending"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Tax</span>
          <span>{formatMoney(order.tax)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-base font-semibold text-zinc-900">
          <span>Total</span>
          <span>{formatMoney(order.total)}</span>
        </div>
        <p className="text-xs text-zinc-500">Tax calculated at checkout.</p>
      </Card>
    </div>
  );
}
