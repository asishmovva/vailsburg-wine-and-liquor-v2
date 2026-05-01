import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  ADMIN_ORDER_STATUSES,
  type AdminOrderStatus,
} from "@/lib/orders/adminStatusTransitions";
import { logError } from "@/lib/ops/logError";
import { buildSystemHealthAlerts } from "@/lib/ops/healthAlerts";
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

function toMillis(value?: unknown) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const withToDate = value as { toDate?: () => Date };
  if (typeof withToDate.toDate === "function") {
    return withToDate.toDate().getTime();
  }
  const seconds = (value as { _seconds?: number; seconds?: number })._seconds ??
    (value as { seconds?: number }).seconds;
  if (typeof seconds === "number") {
    return seconds * 1000;
  }
  return null;
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

    const recentErrorEventsPromise = getCount(
      db
        .collection("opsLogs")
        .where("severity", "==", "error")
        .where("createdAt", ">=", Timestamp.fromMillis(nowMs - 24 * 60 * 60 * 1000))
    );
    const recentCriticalEventsPromise = getCount(
      db
        .collection("opsLogs")
        .where("severity", "==", "critical")
        .where("createdAt", ">=", Timestamp.fromMillis(nowMs - 24 * 60 * 60 * 1000))
    );

    const recentIncidentsPromise = db
      .collection("opsLogs")
      .where("severity", "in", ["error", "critical"])
      .orderBy("createdAt", "desc")
      .limit(12)
      .get();

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
      recentErrorEvents24h,
      recentCriticalEvents24h,
      recentIncidentsSnapshot,
      stalePendingSnapshot,
      stalePreparingSnapshot,
      staleReadySnapshot,
      lastWebhookEventSnap,
      syncStateSnap,
    ] = await Promise.all([
      failedNotificationsPromise,
      failedSyncPromise,
      recentErrorEventsPromise,
      recentCriticalEventsPromise,
      recentIncidentsPromise,
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
    const lastWebhookEventAtMs = toMillis(lastWebhookEvent?.createdAt);
    const lastSypramSyncAtMs = toMillis(syncState?.lastRunAt);
    const alerts = buildSystemHealthAlerts({
      nowMs,
      counts: {
        failedNotificationsRecent: failedNotifications,
        failedSyncRecent: failedSyncs,
        staleOrders: stalePending + stalePreparing + staleReady,
        recentErrorEvents24h,
        recentCriticalEvents24h,
      },
      staleByStatus: {
        pendingStore: stalePending,
        preparing: stalePreparing,
        readyForPickup: staleReady,
      },
      lastWebhookEventAtMs,
      lastSypramSyncAtMs,
      lastSypramSyncStatus: syncState?.lastStatus ?? null,
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      counts: {
        failedNotificationsRecent: failedNotifications,
        failedSyncRecent: failedSyncs,
        errorEvents24h: recentErrorEvents24h,
        criticalEvents24h: recentCriticalEvents24h,
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
      alerts,
      recentIncidents: recentIncidentsSnapshot.docs.map((doc) => {
        const incident = doc.data() as {
          source?: string;
          eventType?: string;
          message?: string;
          severity?: string;
          createdAt?: unknown;
          createdAtIso?: string;
        };
        return {
          id: doc.id,
          source: incident.source ?? "unknown",
          eventType: incident.eventType ?? "unknown",
          severity:
            incident.severity === "critical" ||
            incident.severity === "error" ||
            incident.severity === "warning"
              ? incident.severity
              : "error",
          message: incident.message ?? "(no message)",
          createdAt:
            toIso(incident.createdAt) ??
            (typeof incident.createdAtIso === "string" ? incident.createdAtIso : null),
        };
      }),
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
