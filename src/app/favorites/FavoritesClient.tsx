"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { ShopProductCard } from "@/components/products/ShopProductCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProductGridSkeleton } from "@/components/ui/ProductGridSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { addFavorite, removeFavorite } from "@/services/favorites";
import type { Product } from "@/services/productTypes";

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchProductsByIds(ids: string[]) {
  if (!db) {
    throw new Error("Firestore client is not initialized.");
  }

  const productMap = new Map<string, Product>();
  const groups = chunk(ids, 10);

  for (const group of groups) {
    const snapshot = await getDocs(
      query(collection(db, "products"), where(documentId(), "in", group))
    );

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as Partial<Product>;
      productMap.set(doc.id, {
        id: doc.id,
        name: data.name ?? "Unnamed item",
        category: data.category ?? "Other",
        subcategory: data.subcategory ?? "",
        price: typeof data.price === "number" ? data.price : 0,
        image: data.image ?? "",
        stock: typeof data.stock === "number" ? data.stock : 0,
        inStock:
          typeof data.inStock === "boolean"
            ? data.inStock
            : (data.stock ?? 0) > 0,
        createdAt: null,
      });
    });
  }

  return ids
    .map((id) => productMap.get(id))
    .filter((item): item is Product => Boolean(item));
}

export default function FavoritesClient() {
  const router = useRouter();
  const { user } = useAuth();

  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesPending, setFavoritesPending] = useState<Set<string>>(
    new Set()
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;

    setFavoritesLoading(true);
    const favoritesRef = collection(db, "users", user.uid, "favorites");

    const unsubscribe = onSnapshot(
      favoritesRef,
      (snapshot) => {
        const ids = snapshot.docs.map((doc) => doc.id);
        setFavoriteIds(ids);
        setFavorites(new Set(ids));
        setFavoritesLoading(false);
      },
      (err) => {
        setError(err.message || "Unable to load favorites.");
        setFavoritesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (favoriteIds.length === 0) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }

    let active = true;
    setProductsLoading(true);

    fetchProductsByIds(favoriteIds)
      .then((items) => {
        if (!active) return;
        setProducts(items);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || "Unable to load favorites.");
      })
      .finally(() => {
        if (!active) return;
        setProductsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [favoriteIds, user]);

  const loading = favoritesLoading || productsLoading;

  const handleToggleFavorite = async (productId: string) => {
    if (!user) return;
    if (favoritesPending.has(productId)) return;

    setFavoritesPending((prev) => new Set(prev).add(productId));

    try {
      if (favorites.has(productId)) {
        await removeFavorite(user.uid, productId);
      } else {
        await addFavorite(user.uid, productId);
      }
    } finally {
      setFavoritesPending((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const hasFavorites = useMemo(() => favoriteIds.length > 0, [favoriteIds]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Favorites</h1>
        <p className="text-sm text-zinc-600">
          Save your go-to bottles and reorder quickly.
        </p>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-600">
          {error}
        </Card>
      ) : null}

      {loading ? (
        <ProductGridSkeleton />
      ) : !hasFavorites ? (
        <Card className="space-y-4 py-12 text-center">
          <p className="text-sm text-zinc-600">No favorites yet.</p>
          <Button onClick={() => router.push("/shop")}>Browse the shop</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ShopProductCard
              key={product.id}
              product={product}
              isFavorite={favorites.has(product.id)}
              favoritePending={favoritesPending.has(product.id)}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
