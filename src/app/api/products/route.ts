import { NextResponse } from "next/server";
import { queryProducts } from "@/services/products";
import type { ProductFilters, ProductSort } from "@/services/productTypes";

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") as ProductSort | null;

  const filters: ProductFilters = {
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    sub: searchParams.get("sub") ?? undefined,
    inStock: searchParams.get("inStock") === "1",
    sort: sort ?? undefined,
    min: parseNumber(searchParams.get("min")),
    max: parseNumber(searchParams.get("max")),
  };

  const result = await queryProducts(filters);

  return NextResponse.json(result);
}
