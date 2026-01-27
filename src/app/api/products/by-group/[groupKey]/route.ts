import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeGroupKey(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupKey: string }> }
) {
  const { groupKey } = await params;
  const key = normalizeGroupKey(groupKey);

  if (!key) {
    return NextResponse.json({ items: [] });
  }

  const snapshot = await adminDb()
    .collection("products")
    .where("groupKey", "==", key)
    .where("isSellableOnline", "==", true)
    .get();

  const items = snapshot.docs.map((doc) => {
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
      upc?: string;
      sku?: string;
      groupKey?: string;
    };
    return {
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
      size: data.size ?? "",
      pack: data.pack ?? "",
      upc: data.upc ?? "",
      sku: data.sku ?? "",
      groupKey: data.groupKey ?? "",
    };
  });

  return NextResponse.json({ items });
}
