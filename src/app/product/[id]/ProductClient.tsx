"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShopProductCard } from "@/components/products/ShopProductCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProductGridSkeleton } from "@/components/ui/ProductGridSkeleton";
import { toast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { addFavorite, fetchFavorites, removeFavorite } from "@/services/favorites";
import type { Product, ProductDetail } from "@/services/productTypes";

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

function parseSizeValue(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : Number.NaN;
}

function sortVariants(items: Product[]) {
  return [...items].sort((a, b) => {
    const sizeA = parseSizeValue(a.size ?? "");
    const sizeB = parseSizeValue(b.size ?? "");
    if (!Number.isNaN(sizeA) && !Number.isNaN(sizeB) && sizeA !== sizeB) {
      return sizeA - sizeB;
    }
    const packCompare = (a.pack ?? "").localeCompare(b.pack ?? "");
    if (packCompare !== 0) return packCompare;
    return a.price - b.price;
  });
}

function getPlaceholder(category: string) {
  const key = category.trim().toUpperCase();
  return (
    CATEGORY_STYLES[key] ?? {
      label: category || "Spirits",
      classes: "from-zinc-100 via-white to-zinc-200",
    }
  );
}

export default function ProductClient({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { addItem } = useCart();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Product[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesPending, setFavoritesPending] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError(null);
    setNotFound(false);

    fetch(`/api/products/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (res.status === 404) {
          throw new Error("not-found");
        }
        if (!res.ok) {
          throw new Error("Unable to load product.");
        }
        return res.json() as Promise<ProductDetail>;
      })
      .then((data) => {
        if (!active) return;
        setProduct(data);
        setQuantity(1);
      })
      .catch((err: Error) => {
        if (!active) return;
        if (err.message === "not-found") {
          setNotFound(true);
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!user) {
      setFavorites(new Set());
      return;
    }

    let active = true;
    fetchFavorites(user.uid)
      .then((items) => {
        if (!active) return;
        setFavorites(items);
      })
      .catch(() => {
        if (!active) return;
        setFavorites(new Set());
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!product) return;

    const categoryParam = product.category.trim().toUpperCase();
    if (!categoryParam) return;

    let active = true;
    setRelatedLoading(true);

    fetch(`/api/products?category=${encodeURIComponent(categoryParam)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load related products.");
        return res.json() as Promise<{ items: Product[] }>; // API returns Product list
      })
      .then((data) => {
        if (!active) return;
        const filtered = (data.items ?? []).filter(
          (item) =>
            item.id !== product.id &&
            (!product.groupKey || item.groupKey !== product.groupKey) &&
            (product.groupKey ||
              item.name.trim().toLowerCase() !==
                product.name.trim().toLowerCase())
        );
        setRelated(filtered.slice(0, 6));
      })
      .catch(() => {
        if (!active) return;
        setRelated([]);
      })
      .finally(() => {
        if (!active) return;
        setRelatedLoading(false);
      });

    return () => {
      active = false;
    };
  }, [product]);

  useEffect(() => {
    if (!product) {
      setVariants([]);
      return;
    }

    let active = true;
    const nameKey = product.name.trim().toLowerCase();
    const categoryParam = product.category.trim().toUpperCase();

    const loadVariants = async () => {
      setVariantsLoading(true);
      try {
        let items: Product[] = [];

        if (product.groupKey) {
          const res = await fetch(
            `/api/products/by-group?groupKey=${encodeURIComponent(
              product.groupKey
            )}`
          );
          if (res.ok) {
            const data = (await res.json()) as { items: Product[] };
            items = data.items ?? [];
          }
        }

        if (items.length <= 1 && nameKey) {
          const params = new URLSearchParams();
          if (categoryParam) params.set("category", categoryParam);
          params.set("q", product.name);
          const res = await fetch(`/api/products?${params.toString()}`);
          if (res.ok) {
            const data = (await res.json()) as { items: Product[] };
            items = (data.items ?? []).filter(
              (item) => item.name.trim().toLowerCase() === nameKey
            );
          }
        }

        if (!active) return;
        setVariants(sortVariants(items));
      } catch {
        if (!active) return;
        setVariants([]);
      } finally {
        if (!active) return;
        setVariantsLoading(false);
      }
    };

    void loadVariants();

    return () => {
      active = false;
    };
  }, [product]);

  const isFavorite = product ? favorites.has(product.id) : false;

  const handleToggleFavorite = async (targetId: string) => {
    if (!user) {
      router.push(`/signin?next=/product/${encodeURIComponent(id)}`);
      return;
    }

    if (favoritesPending.has(targetId)) return;
    setFavoritesPending((prev) => new Set(prev).add(targetId));

    try {
      if (favorites.has(targetId)) {
        await removeFavorite(user.uid, targetId);
        setFavorites((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      } else {
        await addFavorite(user.uid, targetId);
        setFavorites((prev) => new Set(prev).add(targetId));
      }
    } finally {
      setFavoritesPending((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  };

  const handleAddToCart = (target: Product | ProductDetail, qty: number) => {
    const result = addItem({
      productId: target.id,
      qty,
      price: target.price,
      name: target.name,
      image: target.image,
      category: target.category,
      size: target.size ?? "",
      pack: target.pack ?? "",
      stock: target.stock,
    });
    if (result === "added") {
      const label = qty > 1 ? `${target.name} (x${qty}) added to cart` : `${target.name} added to cart`;
      toast.success(label);
    } else if (result === "invalid") {
      toast.error("Could not add item. Try again.");
    }
  };

  const placeholder = product ? getPlaceholder(product.category) : null;
  const categoryLabel = product ? product.category : "";
  const categoryParam = product ? product.category.trim().toUpperCase() : "";

  const qtyDownDisabled = quantity <= 1;

  const quantityLabel = useMemo(() => `${quantity}`, [quantity]);

  if (loading) {
    return <ProductGridSkeleton />;
  }

  if (notFound) {
    return (
      <Card className="space-y-4 py-12 text-center">
        <p className="text-sm text-zinc-600">Product not found.</p>
        <Button onClick={() => router.push("/shop")}>Back to shop</Button>
      </Card>
    );
  }

  if (error || !product) {
    return (
      <Card className="border-red-200 bg-red-50 text-sm text-red-600">
        {error ?? "Unable to load product."}
      </Card>
    );
  }

  return (
    <div className="space-y-10 pb-24 lg:pb-0">
      <nav className="text-xs text-zinc-500">
        <Link href="/" className="hover:text-zinc-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link href="/shop" className="hover:text-zinc-700">
          Shop
        </Link>
        {categoryLabel ? (
          <>
            <span className="mx-2">/</span>
            <Link
              href={categoryParam ? `/shop?category=${categoryParam}` : "/shop"}
              className="hover:text-zinc-700"
            >
              {categoryLabel}
            </Link>
          </>
        ) : null}
        <span className="mx-2">/</span>
        <span className="text-zinc-700">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt={product.name}
                className="h-full w-full bg-zinc-100 object-contain object-center p-3"
              />
            ) : (
              <div
                className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br ${
                  placeholder?.classes ?? "from-zinc-100 via-white to-zinc-200"
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
                  {placeholder?.label ?? "Spirits"}
                </span>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Product details
            </p>
            <h1 className="text-3xl font-semibold text-zinc-900">
              {product.name}
            </h1>
            <p className="text-lg text-zinc-800">
              ${product.price.toFixed(2)}
            </p>
            <p className="text-xs text-zinc-500">Tax calculated at checkout</p>
          </div>

          <Card className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm text-zinc-600">
              {categoryLabel ? (
                <span className="rounded-full border border-zinc-200 px-3 py-1">
                  {categoryLabel}
                </span>
              ) : null}
              {product.size ? (
                <span className="rounded-full border border-zinc-200 px-3 py-1">
                  {product.size}
                </span>
              ) : null}
              {product.pack ? (
                <span className="rounded-full border border-zinc-200 px-3 py-1">
                  {product.pack}
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-between text-sm text-zinc-600">
              <span>Stock status</span>
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

            {product.upc ? (
              <p className="text-xs text-zinc-500">UPC: {product.upc}</p>
            ) : null}

            {variantsLoading ? (
              <p className="text-xs text-zinc-500">Loading sizes...</p>
            ) : variants.length > 1 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Available sizes
                </p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((variant) => {
                    const label = [variant.size, variant.pack]
                      .filter(Boolean)
                      .join(" • ");
                    const isCurrent = variant.id === product.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                          isCurrent
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : variant.inStock
                              ? "border-zinc-200 text-zinc-700"
                              : "border-zinc-200 text-zinc-400"
                        }`}
                        disabled={!variant.inStock || isCurrent}
                        onClick={() =>
                          router.push(`/product/${variant.id}`)
                        }
                      >
                        {label || "Variant"}
                        {!variant.inStock ? " • OOS" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">Quantity</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="h-9 w-9 rounded-full border border-zinc-200 text-lg text-zinc-700"
                  onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                  disabled={qtyDownDisabled}
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <span className="min-w-[2ch] text-sm font-medium text-zinc-700">
                  {quantityLabel}
                </span>
                <button
                  type="button"
                  className="h-9 w-9 rounded-full border border-zinc-200 text-lg text-zinc-700"
                  onClick={() => setQuantity((prev) => prev + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="flex-1"
                disabled={!product.inStock}
                aria-disabled={!product.inStock}
                onClick={() => handleAddToCart(product, quantity)}
              >
                Add to cart
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleToggleFavorite(product.id)}
                disabled={favoritesPending.has(product.id)}
              >
                {isFavorite ? "Favorited" : "Favorite"}
              </Button>
            </div>
          </Card>

          <Link href="/shop" className="text-sm text-zinc-600 hover:text-zinc-900">
            Back to shop
          </Link>
        </div>
      </div>

      {relatedLoading ? (
        <ProductGridSkeleton />
      ) : related.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            You may also like
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {related.map((item) => (
              <ShopProductCard
                key={item.id}
                product={item}
                isFavorite={favorites.has(item.id)}
                favoritePending={favoritesPending.has(item.id)}
                onToggleFavorite={handleToggleFavorite}
                onAddToCart={(productItem) => handleAddToCart(productItem, 1)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button
            variant="outline"
            className="h-11 w-11 shrink-0 rounded-full p-0"
            onClick={() => handleToggleFavorite(product.id)}
            disabled={favoritesPending.has(product.id)}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <HeartIcon filled={isFavorite} />
          </Button>
          <Button
            className="flex-1"
            disabled={!product.inStock}
            aria-disabled={!product.inStock}
            onClick={() => handleAddToCart(product, quantity)}
          >
            Add to cart
          </Button>
        </div>
      </div>
    </div>
  );
}

function HeartIcon({ filled }: { filled?: boolean }) {
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
