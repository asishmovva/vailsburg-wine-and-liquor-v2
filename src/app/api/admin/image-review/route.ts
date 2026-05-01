import { NextResponse, type NextRequest } from "next/server";
import { buildReviewPageData } from "@/lib/image-review/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminRateLimit } from "@/lib/server/adminRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOptionalNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;
  const limited = adminRateLimit("read", admin.uid, req);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") ?? "20", 10) || 20;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 30);
  const category = searchParams.get("category")?.trim() ?? "";
  const search = searchParams.get("search")?.trim() ?? "";
  const minScore = parseOptionalNumber(searchParams.get("minScore"));
  const maxScore = parseOptionalNumber(searchParams.get("maxScore"));

  const payload = await buildReviewPageData({
    page,
    pageSize,
    category,
    search,
    minScore,
    maxScore,
  });

  return NextResponse.json(payload);
}
