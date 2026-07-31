import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { adminRateLimit } from "@/lib/server/adminRateLimit";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { resolveProductImage } from "@/services/productImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

type ReplacementSearchItem = {
  id: string;
  name: string;
  category: string;
  size: string;
  pack: string;
  price: number;
  inStock: boolean;
  stock: number;
  image: string;
};

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const { uid, error } = await requireAdmin(request);
  if (error) return error;
  const limited = adminRateLimit("read", uid, request);
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const limit = normalizeLimit(params.get("limit"));

  if (q.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const snapshot = await adminDb()
    .collection("products")
    .where("nameLower", ">=", q)
    .where("nameLower", "<=", `${q}\uf8ff`)
    .orderBy("nameLower")
    .limit(limit * 6)
    .get();

  const items = snapshot.docs
    .map((doc) => {
      const data = doc.data() as {
        name?: string;
        category?: string;
        size?: string;
        pack?: string;
        price?: number;
        isSellableOnline?: boolean;
        inStock?: boolean;
        stock?: number;
        reservedStock?: number;
        image?: string;
        primaryImageUrl?: string;
      };

      const stock = Math.max(
        0,
        Number(data.stock ?? 0) - Number(data.reservedStock ?? 0)
      );

      const item: ReplacementSearchItem & { isSellableOnline: boolean } = {
        id: doc.id,
        name: data.name ?? "Unnamed item",
        category: data.category ?? "Other",
        size: data.size ?? "",
        pack: data.pack ?? "",
        price: typeof data.price === "number" ? data.price : 0,
        isSellableOnline: data.isSellableOnline === true,
        inStock:
          typeof data.inStock === "boolean" ? data.inStock : stock > 0,
        stock,
        image: resolveProductImage(data),
      };

      return item;
    })
    .filter((item) => item.isSellableOnline)
    .sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit)
    .map((item) => {
      const { isSellableOnline, ...publicItem } = item;
      void isSellableOnline;
      return publicItem;
    });

  return NextResponse.json({ items });
}
