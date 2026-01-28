"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ShopProductCard } from "@/components/products/ShopProductCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ProductGridSkeleton } from "@/components/ui/ProductGridSkeleton";
import { toast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { addFavorite, fetchFavorites, removeFavorite } from "@/services/favorites";
import type { Product, ProductSort } from "@/services/productTypes";

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "az", label: "A-Z" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

const CATEGORY_OPTIONS = [
  "BEER",
  "WINE",
  "WHISKEY",
  "VODKA",
  "TEQUILA",
  "RUM",
  "GIN",
  "EXTRAS",
];

type FilterState = {
  q: string;
  category: string;
  sub: string;
  size: string;
  pack: string;
  inStock: boolean;
  sort: ProductSort;
  min?: number;
  max?: number;
};

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFilters(params: URLSearchParams): FilterState {
  const sortParam = params.get("sort") as ProductSort | null;
  const sort = SORT_OPTIONS.some((option) => option.value === sortParam)
    ? (sortParam as ProductSort)
    : "az";

  return {
    q: params.get("q") ?? "",
    category: params.get("category")?.toUpperCase() ?? "",
    sub: params.get("sub")?.toUpperCase() ?? "",
    size: params.get("size") ?? "",
    pack: params.get("pack") ?? "",
    inStock: params.get("inStock") === "1",
    sort,
    min: parseNumber(params.get("min")),
    max: parseNumber(params.get("max")),
  };
}

function formatCategoryLabel(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

function normalizeFacetValue(value: string) {
  return value.trim();
}

function parseSizeValue(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/(\d+(?:\.\d+)?)/);
  const number = match ? Number.parseFloat(match[1]) : Number.NaN;
  const unit = trimmed.replace(/[^a-zA-Z]+/g, "").toLowerCase();
  if (!Number.isFinite(number)) return Number.NaN;
  if (unit === "l" || unit === "lt" || unit === "ltr") return number * 1000;
  if (unit === "oz" || unit === "floz") return number * 29.5735;
  return number;
}

function sortSizes(values: string[]) {
  const normalized = values
    .map((value) => normalizeFacetValue(value))
    .filter(Boolean);

  return normalized.sort((a, b) => {
    const aValue = parseSizeValue(a);
    const bValue = parseSizeValue(b);
    if (Number.isFinite(aValue) && Number.isFinite(bValue)) {
      return aValue - bValue;
    }
    if (Number.isFinite(aValue)) return -1;
    if (Number.isFinite(bValue)) return 1;
    return a.localeCompare(b);
  });
}

function sortPacks(values: string[]) {
  const normalized = values
    .map((value) => normalizeFacetValue(value))
    .filter(Boolean);

  return normalized.sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aIsSingle = aLower.includes("single");
    const bIsSingle = bLower.includes("single");
    if (aIsSingle && !bIsSingle) return -1;
    if (!aIsSingle && bIsSingle) return 1;

    const aNumber = Number.parseFloat(aLower.match(/\d+(?:\.\d+)?/)?.[0] ?? "");
    const bNumber = Number.parseFloat(bLower.match(/\d+(?:\.\d+)?/)?.[0] ?? "");
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
      return aNumber - bNumber;
    }
    if (Number.isFinite(aNumber)) return -1;
    if (Number.isFinite(bNumber)) return 1;
    return a.localeCompare(b);
  });
}

export default function ShopClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { user } = useAuth();
  const { addItem } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesPending, setFavoritesPending] = useState<Set<string>>(
    new Set()
  );
  const [resultCount, setResultCount] = useState(0);
  const [facetSizes, setFacetSizes] = useState<string[]>([]);
  const [facetPacks, setFacetPacks] = useState<string[]>([]);
  const [facetError, setFacetError] = useState<string | null>(null);

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const setFilters = useCallback(
    (updates: Partial<FilterState>) => {
      const merged: FilterState = {
        ...filters,
        ...updates,
      };

      const params = new URLSearchParams();

      const query = merged.q.trim();
      if (query) params.set("q", query);

      const category = merged.category.trim().toUpperCase();
      if (category) params.set("category", category);

      const sub = merged.sub.trim().toUpperCase();
      if (sub) params.set("sub", sub);

      const size = merged.size.trim();
      if (size) params.set("size", size);

      const pack = merged.pack.trim();
      if (pack) params.set("pack", pack);

      if (merged.inStock) params.set("inStock", "1");

      if (merged.sort && merged.sort !== "az") params.set("sort", merged.sort);

      if (typeof merged.min === "number") params.set("min", String(merged.min));
      if (typeof merged.max === "number") params.set("max", String(merged.max));

      const queryString = params.toString();
      const nextUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [filters, pathname, router]
  );

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const searchKey = searchParams.toString();

  useEffect(() => {
    const controller = new AbortController();
    const queryString = searchKey;
    const url = queryString ? `/api/products?${queryString}` : "/api/products";

    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to load products.");
        }
        return res.json() as Promise<{ items: Product[]; total: number }>;
      })
      .then((data) => {
        setProducts(data.items ?? []);
        setResultCount(data.total ?? data.items?.length ?? 0);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [searchKey]);

  useEffect(() => {
    let active = true;
    setFacetError(null);

    fetch("/api/catalog/facets")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to load facets.");
        }
        return res.json() as Promise<{ sizes: string[]; packs: string[] }>;
      })
      .then((data) => {
        if (!active) return;
        setFacetSizes(Array.isArray(data.sizes) ? data.sizes : []);
        setFacetPacks(Array.isArray(data.packs) ? data.packs : []);
      })
      .catch((err: Error) => {
        if (!active) return;
        setFacetSizes([]);
        setFacetPacks([]);
        setFacetError(err.message);
      });

    return () => {
      active = false;
    };
  }, []);

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

  const subcategoryOptions: { value: string; label: string }[] = [];

  useEffect(() => {
    if (filters.sub && subcategoryOptions.length === 0) {
      setFilters({ sub: "" });
    }
  }, [filters.sub, setFilters, subcategoryOptions.length]);

  const hasActiveFilters = Boolean(
    filters.q ||
      filters.category ||
      filters.sub ||
      filters.size ||
      filters.pack ||
      filters.inStock ||
      typeof filters.min === "number" ||
      typeof filters.max === "number" ||
      filters.sort !== "az"
  );

  const filteredProducts = useMemo(() => {
    let items = products;
    const sizeFilter = normalizeFacetValue(filters.size).toLowerCase();
    const packFilter = normalizeFacetValue(filters.pack).toLowerCase();

    if (sizeFilter) {
      items = items.filter(
        (item) =>
          normalizeFacetValue(item.size ?? "").toLowerCase() === sizeFilter
      );
    }

    if (packFilter) {
      items = items.filter(
        (item) =>
          normalizeFacetValue(item.pack ?? "").toLowerCase() === packFilter
      );
    }

    return items;
  }, [products, filters.pack, filters.size]);

  const displayedCount =
    filters.size || filters.pack ? filteredProducts.length : resultCount;

  const handleFavoriteToggle = async (productId: string) => {
    if (!user) {
      const currentQuery = searchParams.toString();
      const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;
      router.push(`/signin?next=${encodeURIComponent(currentUrl)}`);
      return;
    }

    if (favoritesPending.has(productId)) return;

    setFavoritesPending((prev) => new Set(prev).add(productId));

    try {
      if (favorites.has(productId)) {
        await removeFavorite(user.uid, productId);
        setFavorites((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      } else {
        await addFavorite(user.uid, productId);
        setFavorites((prev) => new Set(prev).add(productId));
      }
    } finally {
      setFavoritesPending((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const handleAddToCart = (product: Product) => {
    const result = addItem({
      productId: product.id,
      qty: 1,
      price: product.price,
      name: product.name,
      image: product.image,
      category: product.category,
      size: product.size ?? "",
      pack: product.pack ?? "",
      stock: product.stock,
    });
    if (result === "added") {
      toast.success(`${product.name} added to cart`);
    } else if (result === "invalid") {
      toast.error("Could not add item. Try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Shop</h1>
        <p className="text-sm text-zinc-600">
          Browse curated bottles, mixers, and same-day favorites.
        </p>
      </div>

      <div className="sticky top-16 z-20 -mx-4 border-y border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex-1">
            <Input
              value={filters.q}
              onChange={(event) => setFilters({ q: event.target.value })}
              placeholder="Search products"
              aria-label="Search products"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.sort}
              onChange={(event) =>
                setFilters({ sort: event.target.value as ProductSort })
              }
              className="h-11 rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-700"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              Filters
            </Button>
            <span className="text-sm text-zinc-500">
              {loading ? "Loading..." : `${displayedCount} items`}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-600">
          {error}
        </Card>
      ) : null}

      {loading ? (
        <ProductGridSkeleton />
      ) : filteredProducts.length === 0 ? (
        <Card className="space-y-4 py-12 text-center">
          <p className="text-sm text-zinc-600">
            {hasActiveFilters
              ? "No products match your filters."
              : "No products found in Firestore yet. Run the seed script to populate the catalog."}
          </p>
          {hasActiveFilters ? (
            <Button onClick={clearFilters}>Clear filters</Button>
          ) : null}
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <ShopProductCard
              key={product.id}
              product={product}
              isFavorite={favorites.has(product.id)}
              favoritePending={favoritesPending.has(product.id)}
              onToggleFavorite={handleFavoriteToggle}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      )}

      <FiltersPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onUpdate={setFilters}
        onClear={clearFilters}
        onApply={() => {
          setFilters({ ...filters });
          setFiltersOpen(false);
        }}
        subcategories={subcategoryOptions}
        sizes={sortSizes(facetSizes)}
        packs={sortPacks(facetPacks)}
        facetError={facetError}
      />
    </div>
  );
}

function FiltersPanel({
  open,
  onClose,
  filters,
  onUpdate,
  onClear,
  onApply,
  subcategories,
  sizes,
  packs,
  facetError,
}: {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  onClear: () => void;
  onUpdate: (updates: Partial<FilterState>) => void;
  filters: FilterState;
  subcategories: { value: string; label: string }[];
  sizes: string[];
  packs: string[];
  facetError: string | null;
}) {
  return (
    <div
      className={`fixed inset-0 z-40 ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-label="Close filters"
      />

      <div
        className={`fixed right-0 top-0 hidden h-full w-[360px] flex-col border-l border-zinc-200 bg-white p-6 shadow-xl transition-transform lg:flex ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <FiltersContent
          filters={filters}
          onUpdate={onUpdate}
          onClear={onClear}
          onApply={onApply}
          subcategories={subcategories}
          sizes={sizes}
          packs={packs}
          facetError={facetError}
        />
      </div>

      <div
        className={`fixed bottom-0 left-0 right-0 flex max-h-[85vh] flex-col rounded-t-3xl border-t border-zinc-200 bg-white p-6 shadow-xl transition-transform lg:hidden ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <FiltersContent
          filters={filters}
          onUpdate={onUpdate}
          onClear={onClear}
          onApply={onApply}
          subcategories={subcategories}
          sizes={sizes}
          packs={packs}
          facetError={facetError}
        />
      </div>
    </div>
  );
}

function FiltersContent({
  filters,
  onUpdate,
  onClear,
  onApply,
  subcategories,
  sizes,
  packs,
  facetError,
}: {
  filters: FilterState;
  onUpdate: (updates: Partial<FilterState>) => void;
  onClear: () => void;
  onApply: () => void;
  subcategories: { value: string; label: string }[];
  sizes: string[];
  packs: string[];
  facetError: string | null;
}) {
  const handleMinChange = (value: string) => {
    if (!value) {
      onUpdate({ min: undefined });
      return;
    }
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) onUpdate({ min: parsed });
  };

  const handleMaxChange = (value: string) => {
    if (!value) {
      onUpdate({ max: undefined });
      return;
    }
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) onUpdate({ max: parsed });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Filters</h2>
        <button
          type="button"
          onClick={onApply}
          className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600"
        >
          Close
        </button>
      </div>

      <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Price range</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Min"
              value={filters.min ?? ""}
              onChange={(event) => handleMinChange(event.target.value)}
            />
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Max"
              value={filters.max ?? ""}
              onChange={(event) => handleMaxChange(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Availability</h3>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={filters.inStock}
              onChange={(event) => onUpdate({ inStock: event.target.checked })}
              className="h-4 w-4 rounded border-zinc-300"
            />
            In stock only
          </label>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Category</h3>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() =>
                  onUpdate({
                    category,
                    sub: "",
                  })
                }
                className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                  filters.category === category
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-700"
                }`}
              >
                {formatCategoryLabel(category)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Size</h3>
          {facetError ? (
            <p className="text-xs text-zinc-500">Sizes unavailable.</p>
          ) : sizes.length === 0 ? (
            <p className="text-xs text-zinc-500">No sizes available yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sizes.map((size) => {
                const isActive = filters.size === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() =>
                      onUpdate({ size: isActive ? "" : size })
                    }
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                      isActive
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-700"
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Pack</h3>
          {facetError ? (
            <p className="text-xs text-zinc-500">Packs unavailable.</p>
          ) : packs.length === 0 ? (
            <p className="text-xs text-zinc-500">No packs available yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {packs.map((pack) => {
                const isActive = filters.pack === pack;
                return (
                  <button
                    key={pack}
                    type="button"
                    onClick={() =>
                      onUpdate({ pack: isActive ? "" : pack })
                    }
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                      isActive
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-700"
                    }`}
                  >
                    {pack}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Sub-category</h3>
          {subcategories.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No sub-categories available yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {subcategories.map((sub) => (
                <button
                  key={sub.value}
                  type="button"
                  onClick={() => onUpdate({ sub: sub.value })}
                  className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                    filters.sub === sub.value
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-700"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onClear}>
          Clear all
        </Button>
        <Button onClick={onApply}>Apply</Button>
      </div>
    </div>
  );
}
