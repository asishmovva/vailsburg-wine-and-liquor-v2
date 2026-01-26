import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import type { ProductDetail } from "@/services/productTypes";

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const snapshot = await adminDb().collection("products").doc(id).get();
  if (!snapshot.exists) return null;

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
    createdAt?: FirebaseFirestore.Timestamp | null;
  };

  return {
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
    createdAt: data.createdAt?.toMillis?.() ?? null,
  };
}
