import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Product } from "@/services/productTypes";

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

function getPlaceholder(category: string) {
  const key = category.trim().toUpperCase();
  return (
    CATEGORY_STYLES[key] ?? {
      label: category || "Spirits",
      classes: "from-zinc-100 via-white to-zinc-200",
    }
  );
}

export function ShopProductCard({
  product,
  isFavorite,
  onToggleFavorite,
  favoritePending,
}: {
  product: Product;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
  favoritePending?: boolean;
}) {
  const placeholder = getPlaceholder(product.category);

  return (
    <Card className="group flex h-full flex-col gap-3 border border-zinc-200">
      <div className="relative">
        <Link
          href={`/product/${product.id}`}
          className="block overflow-hidden rounded-2xl"
        >
          {product.image ? (
            <div
              className="h-40 w-full bg-cover bg-center transition duration-300 group-hover:scale-[1.02]"
              style={{ backgroundImage: `url(${product.image})` }}
              aria-label={product.name}
            />
          ) : (
            <div
              className={`flex h-40 w-full flex-col items-center justify-center gap-2 bg-gradient-to-br ${placeholder.classes}`}
            >
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
                {placeholder.label}
              </span>
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={() => onToggleFavorite(product.id)}
          className={`absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm transition ${
            isFavorite
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-white/60 bg-white/80 text-zinc-600"
          }`}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          disabled={favoritePending}
        >
          <IconHeart filled={isFavorite} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <Link href={`/product/${product.id}`} className="space-y-1">
          <p className="text-sm font-semibold text-zinc-900">
            {product.name}
          </p>
          <p className="text-sm text-zinc-600">
            ${product.price.toFixed(2)}
          </p>
        </Link>

        <div className="flex items-center justify-between">
          <Badge
            className={
              product.inStock
                ? "bg-emerald-600 text-white"
                : "bg-zinc-200 text-zinc-700"
            }
          >
            {product.inStock ? "In stock" : "Out of stock"}
          </Badge>
        </div>

        <Button
          className="mt-auto w-full"
          variant="outline"
          disabled
          aria-disabled
        >
          Add to cart
        </Button>
      </div>
    </Card>
  );
}

function IconHeart({ filled }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.7A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z" />
    </svg>
  );
}
