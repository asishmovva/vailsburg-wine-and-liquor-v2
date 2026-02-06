import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { TTLCache } from "@/lib/cache/ttlCache";
import type { ProductDetail } from "@/services/productTypes";

type CachedProduct = { found: true; data: ProductDetail } | { found: false };

const productCache = new TTLCache<CachedProduct>();
const FOUND_TTL_MS = 30 * 60 * 1000;
const NOT_FOUND_TTL_MS = 5 * 60 * 1000;

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const trimmedId = id.trim();
  if (!trimmedId) return null;

  const cacheKey = `product:${trimmedId}`;
  const cached = productCache.get(cacheKey);
  if (cached) {
    console.info("product_read_cache_hit", { id: trimmedId });
    return cached.found ? cached.data : null;
  }
  console.info("product_read_cache_miss", { id: trimmedId });

  console.info("product_read_firestore_get", { id: trimmedId });
  const snapshot = await adminDb().collection("products").doc(trimmedId).get();
  if (!snapshot.exists) {
    productCache.set(cacheKey, { found: false }, NOT_FOUND_TTL_MS);
    return null;
  }

  const data = snapshot.data() as {
    name?: string;
    category?: string;
    subcategory?: string;
    price?: number;
    image?: string;
    stock?: number;
    inStock?: boolean;
    size?: string;
    pack?: string;
    upc?: string;
    sku?: string;
    groupKey?: string;
    isSellableOnline?: boolean;
    onlineBlockReason?: string;
    createdAt?: FirebaseFirestore.Timestamp | null;
  };

  if (data.isSellableOnline !== true) {
    productCache.set(cacheKey, { found: false }, NOT_FOUND_TTL_MS);
    return null;
  }

  const product: ProductDetail = {
    id: snapshot.id,
    name: data.name ?? "Unnamed item",
    category: data.category ?? "Other",
    subcategory: data.subcategory ?? "",
    price: typeof data.price === "number" ? data.price : 0,
    image: data.image ?? "",
    stock: typeof data.stock === "number" ? data.stock : 0,
    inStock:
      typeof data.inStock === "boolean" ? data.inStock : (data.stock ?? 0) > 0,
    size: data.size ?? "",
    pack: data.pack ?? "",
    upc: data.upc ?? "",
    sku: data.sku ?? "",
    groupKey: data.groupKey ?? "",
    isSellableOnline: data.isSellableOnline ?? false,
    onlineBlockReason: data.onlineBlockReason ?? "",
    createdAt: data.createdAt?.toMillis?.() ?? null,
  };

  productCache.set(cacheKey, { found: true, data: product }, FOUND_TTL_MS);
  return product;
}
