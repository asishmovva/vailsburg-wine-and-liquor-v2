import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getAvailableStock } from "@/lib/checkout/inventoryReservations";
import { rateLimit } from "@/lib/server/rateLimit";
import { resolveProductImage } from "@/services/productImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_CACHE_HEADER =
  "public, s-maxage=3600, stale-while-revalidate=86400";

function parseNumericSize(value: string) {
  const match = value.match(/(\d+(\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : Number.NaN;
}

function getClientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(`products-by-group:${getClientKey(request)}`, request, {
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const groupKey = (searchParams.get("groupKey") ?? "").trim();

  if (!groupKey) {
    return NextResponse.json({ items: [] }, { headers: { "Cache-Control": PRODUCT_CACHE_HEADER } });
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
      primaryImageUrl?: string;
      stock?: number;
      inStock?: boolean;
      reservedStock?: number;
      size?: string;
      pack?: string;
    };
    const availableStock = getAvailableStock(data);
    const inStock =
      (typeof data.inStock === "boolean" ? data.inStock : true) &&
      availableStock > 0;
    return {
      id: doc.id,
      name: data.name ?? "Unnamed item",
      category: data.category ?? "Other",
      price: typeof data.price === "number" ? data.price : 0,
      image: resolveProductImage(data),
      primaryImageUrl: data.primaryImageUrl ?? "",
      stock: availableStock,
      inStock,
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

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": PRODUCT_CACHE_HEADER } }
  );
}
