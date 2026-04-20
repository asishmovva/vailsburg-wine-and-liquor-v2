import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  ADMIN_ORDER_STATUSES,
  getAdminStatusQueryValues,
} from "@/lib/orders/adminStatusTransitions";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCreatedAtSeconds(value?: unknown) {
  return (
    (value as { _seconds?: number; seconds?: number } | undefined)?._seconds ??
    (value as { seconds?: number } | undefined)?.seconds ??
    0
  );
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? ADMIN_ORDER_STATUSES.PENDING_STORE;
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

  const db = adminDb();
  const queryStatuses = getAdminStatusQueryValues(status);
  const snapshots = await Promise.all(
    queryStatuses.map((queryStatus) =>
      db
        .collection("orders")
        .where("status", "==", queryStatus)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get()
    )
  );

  const mergedOrders = snapshots.flatMap((snapshot) =>
    snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as { id: string; createdAt?: unknown } & Record<string, unknown>
    )
  );

  const orders = mergedOrders
    .sort((a, b) => getCreatedAtSeconds(b.createdAt) - getCreatedAtSeconds(a.createdAt))
    .slice(0, limit);

  return NextResponse.json({ orders });
}
