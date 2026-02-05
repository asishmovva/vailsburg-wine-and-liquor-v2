import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? ORDER_STATUSES.NEW;
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

  const db = adminDb();
  const snapshot = await db
    .collection("orders")
    .where("status", "==", status)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const orders = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json({ orders });
}
