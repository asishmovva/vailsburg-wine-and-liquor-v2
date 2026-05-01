import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeCategory } from "@/lib/catalog/onlineCatalogRules";
import { getAvailableStock } from "@/lib/checkout/inventoryReservations";
import { resolveProductImage } from "@/services/productImage";
import type { Product, ProductFilters, ProductSort } from "@/services/productTypes";
import { FieldPath, Timestamp } from "firebase-admin/firestore";

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 72;

type CursorPayload = {
  lastId: string;
  lastValue: string | number | null;
};

function encodeCursor(payload: CursorPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function decodeCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64").toString("utf8")
    ) as CursorPayload;
    if (!decoded || typeof decoded.lastId !== "string") return null;
    return {
      lastId: decoded.lastId,
      lastValue:
        decoded.lastValue === undefined ? null : decoded.lastValue,
    };
  } catch {
    return null;
  }
}

function normalizeCategoryLabel(value?: string) {
  if (!value) return "";
  const normalized = normalizeCategory(value);
  return normalized.label;
}

function normalizeSort(sort?: ProductSort | null): ProductSort {
  if (sort === "price_asc" || sort === "price_desc" || sort === "newest") {
    return sort;
  }
  return "az";
}

function normalizeSubcategory(value?: string) {
  if (!value) return "";
  return value.trim();
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

  query = query.where("isSellableOnline", "==", true);

  const category = normalizeCategoryLabel(filters.category);
  if (category) {
    query = query.where("category", "==", category);
  }

  const subcategory = normalizeSubcategory(filters.sub);
  if (subcategory) {
    query = query.where("subcategory", "==", subcategory);
  }

  const size = filters.size?.trim();
  if (size) {
    query = query.where("size", "==", size);
  }

  const pack = filters.pack?.trim();
  if (pack) {
    query = query.where("pack", "==", pack);
  }

  if (filters.inStock) {
    query = query.where("inStock", "==", true);
  }

  const term = filters.q?.trim().toLowerCase() ?? "";
  const min = typeof filters.min === "number" ? filters.min : undefined;
  const max = typeof filters.max === "number" ? filters.max : undefined;
  const sort = normalizeSort(filters.sort);
  let appliedSort = sort;
  const cursor = decodeCursor(filters.page);
  const limit = Math.min(
    Math.max(filters.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  let orderField: "nameLower" | "price" | "createdAt" = "nameLower";
  let orderDirection: FirebaseFirestore.OrderByDirection = "asc";

  if (term) {
    // Prefix search on nameLower to avoid full collection scan.
    query = query
      .where("nameLower", ">=", term)
      .where("nameLower", "<", `${term}\uf8ff`);
    orderField = "nameLower";
  } else if (typeof min === "number" || typeof max === "number") {
    if (typeof min === "number") {
      query = query.where("price", ">=", min);
    }
    if (typeof max === "number") {
      query = query.where("price", "<=", max);
    }
    orderField = "price";
    orderDirection = sort === "price_desc" ? "desc" : "asc";
    appliedSort = sort;
  } else {
    switch (sort) {
      case "price_asc":
        orderField = "price";
        orderDirection = "asc";
        break;
      case "price_desc":
        orderField = "price";
        orderDirection = "desc";
        break;
      case "newest":
        orderField = "createdAt";
        orderDirection = "desc";
        break;
      case "az":
      default:
        orderField = "nameLower";
        orderDirection = "asc";
        break;
    }
  }

  query = query.orderBy(orderField, orderDirection);
  const docIdDirection: FirebaseFirestore.OrderByDirection =
    orderDirection === "desc" ? "desc" : "asc";
  query = query.orderBy(FieldPath.documentId(), docIdDirection);

  if (cursor) {
    let cursorValue:
      | string
      | number
      | FirebaseFirestore.Timestamp
      | null = cursor.lastValue;
    if (orderField === "createdAt" && typeof cursorValue === "number") {
      cursorValue = Timestamp.fromMillis(cursorValue);
    }
    query = query.startAfter(cursorValue, cursor.lastId);
  }

  query = query.limit(limit + 1);

  const snapshot = await query.get();
  const hasMore = snapshot.docs.length > limit;
  const pageDocs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;
  const lastDoc = pageDocs[pageDocs.length - 1];

  let items: Product[] = pageDocs.map((doc) => {
    const data = doc.data() as {
      name?: string;
      category?: string;
      subcategory?: string;
      price?: number;
      image?: string;
      primaryImageUrl?: string;
      stock?: number;
      inStock?: boolean;
      reservedStock?: number;
      size?: string;
      pack?: string;
      upc?: string;
      sku?: string;
      groupKey?: string;
      isSellableOnline?: boolean;
      onlineBlockReason?: string;
      createdAt?: FirebaseFirestore.Timestamp | null;
    };

    const availableStock = getAvailableStock(data);
    const inStock =
      (typeof data.inStock === "boolean" ? data.inStock : true) &&
      availableStock > 0;

    return {
      id: doc.id,
      name: data.name ?? "Unnamed item",
      category: data.category ?? "Other",
      subcategory: data.subcategory ?? "",
      price: typeof data.price === "number" ? data.price : 0,
      image: resolveProductImage(data),
      primaryImageUrl: data.primaryImageUrl ?? "",
      stock: availableStock,
      inStock,
      createdAt: data.createdAt?.toMillis?.() ?? null,
      size: data.size ?? "",
      pack: data.pack ?? "",
      upc: data.upc ?? "",
      sku: data.sku ?? "",
      groupKey: data.groupKey ?? "",
      isSellableOnline: data.isSellableOnline ?? false,
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

  let nextPage: string | null = null;
  if (hasMore && lastDoc) {
    const lastValueRaw = lastDoc.get(orderField) as
      | string
      | number
      | FirebaseFirestore.Timestamp
      | null
      | undefined;
    let lastValue: string | number | null = null;
    if (lastValueRaw instanceof Timestamp) {
      lastValue = lastValueRaw.toMillis();
    } else if (
      typeof lastValueRaw === "string" ||
      typeof lastValueRaw === "number"
    ) {
      lastValue = lastValueRaw;
    }

    nextPage = encodeCursor({ lastId: lastDoc.id, lastValue });
  }

  return { items, total: items.length, nextPage };
}
