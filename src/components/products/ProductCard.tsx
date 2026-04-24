"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useCart } from "@/hooks/useCart";

export interface ProductCardItem {
  id: string;
  name: string;
  price: string;
  imageUrl?: string | null;
  category?: string;
  size?: string;
  pack?: string;
  stock?: number;
  inStock?: boolean;
  priceValue?: number;
}

export function ProductCard({ item }: { item: ProductCardItem }) {
  const { addItem } = useCart();

  const canAdd =
    typeof item.inStock === "boolean"
      ? item.inStock
      : (item.stock ?? 0) > 0;

  const handleAddToCart = () => {
    const priceValue =
      typeof item.priceValue === "number"
        ? item.priceValue
        : Number.parseFloat(item.price.replace(/[^\d.]/g, ""));

    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      toast.error("Could not add item. Try again.");
      return;
    }

    const result = addItem({
      productId: item.id,
      qty: 1,
      price: priceValue,
      name: item.name,
      image: item.imageUrl ?? "",
      category: item.category ?? "",
      size: item.size ?? "",
      pack: item.pack ?? "",
      stock: item.stock ?? (canAdd ? 1 : 0),
    });

    if (result === "added") {
      toast.success(`${item.name} added to cart`);
      return;
    }

    if (result === "throttled") {
      return;
    }

    toast.error("Could not add item. Try again.");
  };

  return (
    <Card className="group flex h-full flex-col gap-3">
      {item.imageUrl ? (
        <Link href={`/product/${item.id}`} prefetch={false}>
          <div className="h-32 overflow-hidden rounded-2xl bg-zinc-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-contain object-center p-2 transition duration-300 group-hover:scale-[1.02]"
            />
          </div>
        </Link>
      ) : (
        <Link href={`/product/${item.id}`} prefetch={false}>
          <div className="flex h-32 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-100 via-white to-zinc-200">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {item.name.slice(0, 3)}
            </span>
          </div>
        </Link>
      )}

      <div className="space-y-1">
        <Link href={`/product/${item.id}`} prefetch={false}>
          <p className="text-sm font-medium text-zinc-900">{item.name}</p>
        </Link>
        <p className="text-xs text-zinc-500">
          {typeof item.priceValue === "number"
            ? `$${item.priceValue.toFixed(2)}`
            : item.price}
        </p>
      </div>

      <Button
        className="mt-auto w-full"
        variant="outline"
        onClick={handleAddToCart}
        disabled={!canAdd}
        aria-disabled={!canAdd}
      >
        {canAdd ? "Add to cart" : "Out of stock"}
      </Button>
    </Card>
  );
}
