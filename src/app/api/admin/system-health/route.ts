import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  ADMIN_ORDER_STATUSES,
  type AdminOrderStatus,
} from "@/lib/orders/adminStatusTransitions";
import { logError } from "@/lib/ops/logError";
import { getOrderStaleState } from "@/lib/ops/staleOrders";
import { adminRateLimit } from "@/lib/server/adminRateLimit";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountQuery = FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

const DAYS_7_MS = 7 * 24 * 60 * 60 * 1000;

const STALE_STATUS_ALIASES: Record<AdminOrderStatus, string[]> = {
  [ADMIN_ORDER_STATUSES.PENDING_STORE]: ["PENDING_STORE", "NEW"],
  [ADMIN_ORDER_STATUSES.PREPARING]: ["PREPARING", "ACCEPTED"],
  [ADMIN_ORDER_STATUSES.READY_FOR_PICKUP]: ["READY_FOR_PICKUP", "READY"],
  [ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY]: ["OUT_FOR_DELIVERY"],
  [ADMIN_ORDER_STATUSES.COMPLETED]: ["COMPLETED"],
  [ADMIN_ORDER_STATUSES.CANCELLED]: ["CANCELLED"],
};

async function getCount(query: CountQuery) {
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

function toIso(value?: unknown) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const withToDate = value as { toDate?: () => Date };
  if (typeof withToDate.toDate === "function") {
    return withToDate.toDate().toISOString();
  }
  const seconds = (value as { _seconds?: number; seconds?: number })._seconds ??
    (value as { seconds?: number }).seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000).toISOString();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const limited = adminRateLimit("read", admin.uid, request);
  if (limited) return limited;

  const db = adminDb();
  const nowMs = Date.now();
  const recentStart = Timestamp.fromMillis(nowMs - DAYS_7_MS);

  try {
    const failedNotificationsPromise = getCount(
      db
        .collection("opsLogs")
        .where("eventType", "==", "NOTIFICATION_SEND_FAILURE")
        .where("createdAt", ">=", recentStart)
    );

    const failedSyncPromise = getCount(
      db
        .collection("opsLogs")
        .where("eventType", "==", "SYNC_FAILURE")
        .where("createdAt", ">=", recentStart)
    );

    const stalePendingPromise = db
      .collection("orders")
      .where("status", "in", STALE_STATUS_ALIASES[ADMIN_ORDER_STATUSES.PENDING_STORE])
      .get();

    const stalePreparingPromise = db
      .collection("orders")
      .where("status", "in", STALE_STATUS_ALIASES[ADMIN_ORDER_STATUSES.PREPARING])
      .get();

    const staleReadyPromise = db
      .collection("orders")
      .where("status", "in", STALE_STATUS_ALIASES[ADMIN_ORDER_STATUSES.READY_FOR_PICKUP])
      .get();

    const lastWebhookEventPromise = db
      .collection("stripeEvents")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    const syncStatePromise = db.collection("syncState").doc("sypram").get();

    const [
      failedNotifications,
      failedSyncs,
      stalePendingSnapshot,
      stalePreparingSnapshot,
      staleReadySnapshot,
      lastWebhookEventSnap,
      syncStateSnap,
    ] = await Promise.all([
      failedNotificationsPromise,
      failedSyncPromise,
      stalePendingPromise,
      stalePreparingPromise,
      staleReadyPromise,
      lastWebhookEventPromise,
      syncStatePromise,
    ]);

    const stalePending = stalePendingSnapshot.docs.filter((doc) =>
      getOrderStaleState(doc.data() as { status?: string; updatedAt?: unknown; createdAt?: unknown }).isStale
    ).length;
    const stalePreparing = stalePreparingSnapshot.docs.filter((doc) =>
      getOrderStaleState(doc.data() as { status?: string; updatedAt?: unknown; createdAt?: unknown }).isStale
    ).length;
    const staleReady = staleReadySnapshot.docs.filter((doc) =>
      getOrderStaleState(doc.data() as { status?: string; updatedAt?: unknown; createdAt?: unknown }).isStale
    ).length;

    const lastWebhookEvent = lastWebhookEventSnap.docs[0]?.data() as
      | { createdAt?: unknown; type?: string; eventId?: string }
      | undefined;
    const syncState = syncStateSnap.data() as
      | { lastRunAt?: unknown; lastStatus?: string; lastSummary?: unknown }
      | undefined;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      counts: {
        failedNotificationsRecent: failedNotifications,
        failedSyncRecent: failedSyncs,
        staleOrders: stalePending + stalePreparing + staleReady,
      },
      staleByStatus: {
        pendingStore: stalePending,
        preparing: stalePreparing,
        readyForPickup: staleReady,
      },
      lastWebhookEvent: {
        at: toIso(lastWebhookEvent?.createdAt),
        type: lastWebhookEvent?.type ?? null,
        eventId: lastWebhookEvent?.eventId ?? null,
      },
      lastSypramSync: {
        at: toIso(syncState?.lastRunAt),
        status: syncState?.lastStatus ?? null,
      },
    });
  } catch (error) {
    await logError({
      source: "api/admin/system-health",
      eventType: "ADMIN_HEALTH_QUERY_FAIL",
      severity: "error",
      message: "Failed to load system health metrics.",
      error,
      userId: admin.uid,
      persist: true,
    });
    return NextResponse.json(
      { error: "Unable to load system health metrics." },
      { status: 500 }
    );
  }
}
