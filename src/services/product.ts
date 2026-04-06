import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { TTLCache } from "@/lib/cache/ttlCache";
import { resolveProductImage } from "@/services/productImage";
import type { ProductDetail } from "@/services/productTypes";

type CachedProduct = { found: true; data: ProductDetail } | { found: false };

const productCache = new TTLCache<CachedProduct>();
const FOUND_TTL_MS = 30 * 60 * 1000;
const NOT_FOUND_TTL_MS = 5 * 60 * 1000;

function getCacheKey(id: string) {
  return `product:${id}`;
}

export function getCachedProductById(
  id: string
): CachedProduct | undefined {
  const trimmedId = id.trim();
  if (!trimmedId) return undefined;

  const cacheKey = getCacheKey(trimmedId);
  const cached = productCache.get(cacheKey);
  if (cached) {
    console.info("product_read_cache_hit", { id: trimmedId });
  } else {
    console.info("product_read_cache_miss", { id: trimmedId });
  }
  return cached;
}

export async function loadProductById(
  id: string
): Promise<ProductDetail | null> {
  const trimmedId = id.trim();
  if (!trimmedId) return null;

  console.info("product_read_firestore_get", { id: trimmedId });
  const snapshot = await adminDb().collection("products").doc(trimmedId).get();
  if (!snapshot.exists) {
    productCache.set(getCacheKey(trimmedId), { found: false }, NOT_FOUND_TTL_MS);
    return null;
  }

  const data = snapshot.data() as {
    name?: string;
    category?: string;
    subcategory?: string;
    price?: number;
    image?: string;
    primaryImageUrl?: string;
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
    productCache.set(getCacheKey(trimmedId), { found: false }, NOT_FOUND_TTL_MS);
    return null;
  }

  const product: ProductDetail = {
    id: snapshot.id,
    name: data.name ?? "Unnamed item",
    category: data.category ?? "Other",
    subcategory: data.subcategory ?? "",
    price: typeof data.price === "number" ? data.price : 0,
    image: resolveProductImage(data),
    primaryImageUrl: data.primaryImageUrl ?? "",
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

  productCache.set(getCacheKey(trimmedId), { found: true, data: product }, FOUND_TTL_MS);
  return product;
}

export async function getProductById(
  id: string
): Promise<ProductDetail | null> {
  const cached = getCachedProductById(id);
  if (cached) {
    return cached.found ? cached.data : null;
  }

  return loadProductById(id);
}
