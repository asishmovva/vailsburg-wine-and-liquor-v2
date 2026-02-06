import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { ids?: string[] };

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getClientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(`products-by-ids:${getClientKey(request)}`, request, {
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) {
    return NextResponse.json({ items: [] });
  }

  const db = adminDb();
  const groups = chunk(ids, 10);
  const items: Array<Record<string, unknown>> = [];

  for (const group of groups) {
    const snaps = await db.getAll(
      ...group.map((id) => db.collection("products").doc(id))
    );
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      const data = snap.data() as {
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
      };

      if (data.isSellableOnline !== true) return;

      items.push({
        id: snap.id,
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
      });
    });
  }

  return NextResponse.json({ items });
}
