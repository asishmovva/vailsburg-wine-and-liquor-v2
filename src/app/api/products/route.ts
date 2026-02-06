import { NextRequest, NextResponse } from "next/server";
import { queryProducts } from "@/services/products";
import type { ProductFilters, ProductSort } from "@/services/productTypes";
import { rateLimit } from "@/lib/server/rateLimit";

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const limited = rateLimit(`products:${getClientKey(request)}`, request, {
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") as ProductSort | null;
  const limit = parseNumber(searchParams.get("limit"));

  const filters: ProductFilters = {
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    sub: searchParams.get("sub") ?? undefined,
    size: searchParams.get("size") ?? undefined,
    pack: searchParams.get("pack") ?? undefined,
    inStock: searchParams.get("inStock") === "1",
    sort: sort ?? undefined,
    min: parseNumber(searchParams.get("min")),
    max: parseNumber(searchParams.get("max")),
    page: searchParams.get("page") ?? undefined,
    limit: typeof limit === "number" ? limit : undefined,
  };

  const result = await queryProducts(filters);

  return NextResponse.json(result);
}
