import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { resolveProductImage } from "@/services/productImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 80;

type AdminProductItem = {
  id: string;
  name: string;
  category: string;
  size: string;
  pack: string;
  price: number;
  inStock: boolean;
  image: string;
  hasImage: boolean;
};

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const category = (params.get("category") ?? "").trim();
  const missingImageOnly = params.get("missingImage") === "1";
  const limit = normalizeLimit(params.get("limit"));
  const fetchLimit = Math.min(Math.max(limit * 4, 100), 300);

  let query: FirebaseFirestore.Query = adminDb().collection("products");

  if (q) {
    query = query
      .where("nameLower", ">=", q)
      .where("nameLower", "<=", `${q}\uf8ff`)
      .orderBy("nameLower")
      .limit(fetchLimit);
  } else if (category) {
    query = query.where("category", "==", category).limit(fetchLimit);
  } else {
    query = query.limit(fetchLimit);
  }

  const snapshot = await query.get();

  const mapped = snapshot.docs
    .map((doc) => {
      const data = doc.data() as {
        name?: string;
        category?: string;
        size?: string;
        pack?: string;
        price?: number;
        inStock?: boolean;
        stock?: number;
        image?: string;
        primaryImageUrl?: string;
      };

      const hasImage = Boolean(
        String(data.primaryImageUrl ?? "").trim() || String(data.image ?? "").trim()
      );

      const item: AdminProductItem = {
        id: doc.id,
        name: data.name ?? "Unnamed item",
        category: data.category ?? "Other",
        size: data.size ?? "",
        pack: data.pack ?? "",
        price: typeof data.price === "number" ? data.price : 0,
        inStock:
          typeof data.inStock === "boolean"
            ? data.inStock
            : Number(data.stock ?? 0) > 0,
        image: resolveProductImage(data),
        hasImage,
      };

      return item;
    })
    .filter((item) => (category ? item.category === category : true))
    .filter((item) => (missingImageOnly ? !item.hasImage : true))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);

  return NextResponse.json({ items: mapped });
}

