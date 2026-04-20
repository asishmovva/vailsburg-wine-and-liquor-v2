import { NextResponse, type NextRequest } from "next/server";
import { getAdminAnalytics } from "@/lib/analytics/orderAnalytics";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);

  const analytics = await getAdminAnalytics({
    range: searchParams.get("range"),
    start: searchParams.get("start"),
    end: searchParams.get("end"),
  });

  return NextResponse.json(analytics);
}
