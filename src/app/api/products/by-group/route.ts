import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNumericSize(value: string) {
  const match = value.match(/(\d+(\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : Number.NaN;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupKey = (searchParams.get("groupKey") ?? "").trim();

  if (!groupKey) {
    return NextResponse.json({ items: [] });
  }

  const snapshot = await adminDb()
    .collection("products")
    .where("groupKey", "==", groupKey)
    .where("isSellableOnline", "==", true)
    .get();

  const items = snapshot.docs.map((doc) => {
    const data = doc.data() as {
      name?: string;
      category?: string;
      price?: number;
      image?: string;
      stock?: number;
      inStock?: boolean;
      size?: string;
      pack?: string;
    };
    return {
      id: doc.id,
      name: data.name ?? "Unnamed item",
      category: data.category ?? "Other",
      price: typeof data.price === "number" ? data.price : 0,
      image: data.image ?? "",
      stock: typeof data.stock === "number" ? data.stock : 0,
      inStock:
        typeof data.inStock === "boolean"
          ? data.inStock
          : (data.stock ?? 0) > 0,
      size: data.size ?? "",
      pack: data.pack ?? "",
    };
  });

  items.sort((a, b) => {
    const sizeA = parseNumericSize(a.size);
    const sizeB = parseNumericSize(b.size);
    if (!Number.isNaN(sizeA) && !Number.isNaN(sizeB) && sizeA !== sizeB) {
      return sizeA - sizeB;
    }
    const packCompare = a.pack.localeCompare(b.pack);
    if (packCompare !== 0) return packCompare;
    return a.price - b.price;
  });

  return NextResponse.json({ items });
}
