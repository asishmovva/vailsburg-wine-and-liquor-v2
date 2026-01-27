import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import type { Product, ProductFilters, ProductSort } from "@/services/productTypes";

const DEFAULT_LIMIT = 48;

const CATEGORY_MAP: Record<string, string> = {
  BEER: "Beer",
  WINE: "Wine",
  WHISKEY: "Whiskey",
  VODKA: "Vodka",
  TEQUILA: "Tequila",
  RUM: "Rum",
  GIN: "Gin",
  EXTRAS: "Extras",
};

function normalizeCategory(value?: string) {
  if (!value) return "";
  const upper = value.trim().toUpperCase();
  if (!upper) return "";
  return CATEGORY_MAP[upper] ?? titleCase(upper);
}

function normalizeSubcategory(value?: string) {
  if (!value) return "";
  return value.trim();
}

function normalizeSort(sort?: ProductSort | null): ProductSort {
  if (sort === "price_asc" || sort === "price_desc" || sort === "newest") {
    return sort;
  }
  return "az";
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

function sortItems(items: Product[], sort: ProductSort) {
  const sorted = [...items];
  if (sort === "price_asc") {
    return sorted.sort((a, b) => a.price - b.price);
  }
  if (sort === "price_desc") {
    return sorted.sort((a, b) => b.price - a.price);
  }
  if (sort === "newest") {
    return sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
  return sorted.sort((a, b) => a.name.localeCompare(b.name));
}

export async function queryProducts(filters: ProductFilters) {
  const db = adminDb();
  let query: FirebaseFirestore.Query = db.collection("products");

  // Enforce online sellability server-side.
  query = query.where("isSellableOnline", "==", true);

  const category = normalizeCategory(filters.category);
  if (category) {
    query = query.where("category", "==", category);
  }

  const subcategory = normalizeSubcategory(filters.sub);
  if (subcategory) {
    query = query.where("subcategory", "==", subcategory);
  }

  if (filters.inStock) {
    query = query.where("inStock", "==", true);
  }

  const term = filters.q?.trim().toLowerCase() ?? "";
  const min = typeof filters.min === "number" ? filters.min : undefined;
  const max = typeof filters.max === "number" ? filters.max : undefined;
  const sort = normalizeSort(filters.sort);
  const page = typeof filters.page === "number" && filters.page > 0 ? filters.page : 1;

  let appliedSort = sort;

  if (term) {
    // Prefix search on nameLower to avoid full collection scan.
    query = query
      .where("nameLower", ">=", term)
      .where("nameLower", "<", `${term}\uf8ff`)
      .orderBy("nameLower");
  } else if (typeof min === "number" || typeof max === "number") {
    if (typeof min === "number") {
      query = query.where("price", ">=", min);
    }
    if (typeof max === "number") {
      query = query.where("price", "<=", max);
    }
    const priceDirection = sort === "price_desc" ? "desc" : "asc";
    query = query.orderBy("price", priceDirection);
    appliedSort = sort;
  } else {
    switch (sort) {
      case "price_asc":
        query = query.orderBy("price", "asc");
        break;
      case "price_desc":
        query = query.orderBy("price", "desc");
        break;
      case "newest":
        query = query.orderBy("createdAt", "desc");
        break;
      case "az":
      default:
        query = query.orderBy("nameLower", "asc");
        break;
    }
  }

  const offset = (page - 1) * DEFAULT_LIMIT;
  if (offset > 0) {
    query = query.offset(offset);
  }

  query = query.limit(DEFAULT_LIMIT);

  const snapshot = await query.get();
  let items: Product[] = snapshot.docs.map((doc) => {
    const data = doc.data() as {
      name?: string;
      category?: string;
      subcategory?: string;
      price?: number;
      image?: string;
      stock?: number;
      inStock?: boolean;
      size?: string;
      pack?: string;
      groupKey?: string;
      isSellableOnline?: boolean;
      onlineBlockReason?: string;
      createdAt?: FirebaseFirestore.Timestamp | null;
    };

    return {
      id: doc.id,
      name: data.name ?? "Unnamed item",
      category: data.category ?? "Other",
      subcategory: data.subcategory ?? "",
      price: typeof data.price === "number" ? data.price : 0,
      image: data.image ?? "",
      stock: typeof data.stock === "number" ? data.stock : 0,
      inStock: typeof data.inStock === "boolean" ? data.inStock : (data.stock ?? 0) > 0,
      createdAt: data.createdAt?.toMillis?.() ?? null,
      size: data.size ?? "",
      pack: data.pack ?? "",
      groupKey: data.groupKey ?? "",
      isSellableOnline: data.isSellableOnline ?? true,
      onlineBlockReason: data.onlineBlockReason ?? "",
    };
  });

  if (typeof min === "number") {
    items = items.filter((item) => item.price >= min);
  }
  if (typeof max === "number") {
    items = items.filter((item) => item.price <= max);
  }

  if (term || appliedSort !== "az") {
    items = sortItems(items, sort);
  }

  return { items, total: items.length };
}
