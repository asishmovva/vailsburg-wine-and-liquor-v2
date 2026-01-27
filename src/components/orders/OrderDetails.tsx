"use client";

import { Card } from "@/components/ui/Card";

type DeliveryInfo = {
  address: string;
  miles: number;
  eligible: boolean;
};

export type OrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
  category?: string;
};

export type OrderRecord = {
  id: string;
  status?: string;
  fulfillment: "delivery" | "pickup";
  delivery?: DeliveryInfo | null;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  tip: number;
  tax: number;
  total: number;
};

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

export function OrderDetails({ order }: { order: OrderRecord }) {
  const fulfillment = order.fulfillment ?? "pickup";
  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>Fulfillment</span>
          <span className="capitalize">{fulfillment}</span>
        </div>
        {fulfillment === "delivery" && order.delivery ? (
          <div className="space-y-1 text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">Delivery address</p>
            <p>{order.delivery.address}</p>
            {Number.isFinite(order.delivery.miles) && order.delivery.miles > 0 ? (
              <p className="text-xs text-zinc-500">
                {order.delivery.miles.toFixed(1)} miles from store
              </p>
            ) : null}
          </div>
        ) : null}
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
                  key={item.productId}
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

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Qty {item.qty} - {formatMoney(item.price)}
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
        {fulfillment === "delivery" ? (
          <div className="flex items-center justify-between">
            <span>Tip</span>
            <span>{formatMoney(order.tip)}</span>
          </div>
        ) : null}
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
