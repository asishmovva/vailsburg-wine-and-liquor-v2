import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/services/product";
import { rateLimit } from "@/lib/server/rateLimit";

const PRODUCT_CACHE_HEADER =
  "public, s-maxage=3600, stale-while-revalidate=86400";
const NOT_FOUND_CACHE_HEADER =
  "public, s-maxage=300, stale-while-revalidate=86400";

function getClientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(`product:${getClientKey(request)}`, request, {
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    return NextResponse.json(
      { message: "Not found" },
      { status: 404, headers: { "Cache-Control": NOT_FOUND_CACHE_HEADER } }
    );
  }

  return NextResponse.json(product, {
    headers: { "Cache-Control": PRODUCT_CACHE_HEADER },
  });
}
