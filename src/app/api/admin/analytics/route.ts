import { NextResponse, type NextRequest } from "next/server";
import { getAdminAnalytics } from "@/lib/analytics/orderAnalytics";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminRateLimit } from "@/lib/server/adminRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const limited = adminRateLimit("read", admin.uid, request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);

  const analytics = await getAdminAnalytics({
    range: searchParams.get("range"),
    start: searchParams.get("start"),
    end: searchParams.get("end"),
  });

  return NextResponse.json(analytics);
}
