export type HealthAlertSeverity = "warning" | "critical";
export type HealthAlertStatus = "ok" | HealthAlertSeverity;

export type HealthAlert = {
  id: string;
  title: string;
  severity: HealthAlertSeverity;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export type BuildSystemHealthAlertsInput = {
  nowMs: number;
  counts: {
    failedNotificationsRecent: number;
    failedSyncRecent: number;
    staleOrders: number;
    recentErrorEvents24h: number;
    recentCriticalEvents24h: number;
  };
  staleByStatus: {
    pendingStore: number;
    preparing: number;
    readyForPickup: number;
  };
  lastWebhookEventAtMs: number | null;
  lastSypramSyncAtMs: number | null;
  lastSypramSyncStatus: string | null;
};

function hasFailureLikeStatus(status: string | null) {
  if (!status) return false;
  return /fail|error|blocked/i.test(status);
}

function getHighestSeverity(alerts: HealthAlert[]): HealthAlertStatus {
  if (alerts.some((alert) => alert.severity === "critical")) {
    return "critical";
  }
  if (alerts.some((alert) => alert.severity === "warning")) {
    return "warning";
  }
  return "ok";
}

function hoursSince(nowMs: number, timestampMs: number | null) {
  if (timestampMs === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - timestampMs) / (60 * 60 * 1000));
}

export function buildSystemHealthAlerts(
  input: BuildSystemHealthAlertsInput
): {
  overallStatus: HealthAlertStatus;
  alerts: HealthAlert[];
} {
  const alerts: HealthAlert[] = [];

  if (input.counts.recentCriticalEvents24h > 0) {
    alerts.push({
      id: "critical-events-24h",
      title: "Critical server errors detected",
      severity: "critical",
      message: `${input.counts.recentCriticalEvents24h} critical event(s) were logged in the last 24 hours.`,
      actionHref: "/admin/orders",
      actionLabel: "Inspect order operations",
    });
  }

  if (input.counts.recentErrorEvents24h >= 20) {
    alerts.push({
      id: "error-events-24h",
      title: "High error volume in last 24 hours",
      severity: "warning",
      message: `${input.counts.recentErrorEvents24h} error-level events were logged in the last 24 hours.`,
      actionHref: "/admin",
      actionLabel: "Review health details",
    });
  }

  if (input.counts.staleOrders >= 12) {
    alerts.push({
      id: "stale-orders-critical",
      title: "Large stale order backlog",
      severity: "critical",
      message: `${input.counts.staleOrders} open orders are stale (pending ${input.staleByStatus.pendingStore}, preparing ${input.staleByStatus.preparing}, ready ${input.staleByStatus.readyForPickup}).`,
      actionHref: "/admin/orders",
      actionLabel: "Open orders queue",
    });
  } else if (input.counts.staleOrders >= 4) {
    alerts.push({
      id: "stale-orders-warning",
      title: "Stale orders need attention",
      severity: "warning",
      message: `${input.counts.staleOrders} open orders are stale and may require manual action.`,
      actionHref: "/admin/orders",
      actionLabel: "Review stale orders",
    });
  }

  if (input.counts.failedNotificationsRecent >= 3) {
    alerts.push({
      id: "failed-notifications",
      title: "Notification delivery failures",
      severity: "warning",
      message: `${input.counts.failedNotificationsRecent} notification failure event(s) in the last 7 days.`,
      actionHref: "/admin/orders",
      actionLabel: "Check notification status",
    });
  }

  if (input.counts.failedSyncRecent > 0) {
    alerts.push({
      id: "failed-sync-events",
      title: "Catalog sync failures detected",
      severity: "warning",
      message: `${input.counts.failedSyncRecent} sync failure event(s) in the last 7 days.`,
      actionHref: "/admin/sync",
      actionLabel: "Open sync dashboard",
    });
  }

  const webhookHours = hoursSince(input.nowMs, input.lastWebhookEventAtMs);
  if (webhookHours >= 6) {
    alerts.push({
      id: "webhook-delayed-critical",
      title: "No recent Stripe webhook activity",
      severity: "critical",
      message:
        input.lastWebhookEventAtMs === null
          ? "No Stripe webhook event has been recorded yet."
          : `Last Stripe webhook event was ${Math.floor(webhookHours)} hour(s) ago.`,
      actionHref: "/admin",
      actionLabel: "Validate Stripe webhook flow",
    });
  } else if (webhookHours >= 2) {
    alerts.push({
      id: "webhook-delayed-warning",
      title: "Stripe webhook activity is delayed",
      severity: "warning",
      message: `Last Stripe webhook event was ${Math.floor(webhookHours)} hour(s) ago.`,
      actionHref: "/admin",
      actionLabel: "Check webhook recency",
    });
  }

  const sypramSyncHours = hoursSince(input.nowMs, input.lastSypramSyncAtMs);
  if (sypramSyncHours >= 48) {
    alerts.push({
      id: "sypram-sync-stale-critical",
      title: "Catalog sync is stale",
      severity: "critical",
      message:
        input.lastSypramSyncAtMs === null
          ? "No Sypram sync run has been recorded yet."
          : `Last Sypram sync was ${Math.floor(sypramSyncHours)} hour(s) ago.`,
      actionHref: "/admin/sync",
      actionLabel: "Run sync now",
    });
  } else if (sypramSyncHours >= 24) {
    alerts.push({
      id: "sypram-sync-stale-warning",
      title: "Sypram sync recency warning",
      severity: "warning",
      message: `Last Sypram sync was ${Math.floor(sypramSyncHours)} hour(s) ago.`,
      actionHref: "/admin/sync",
      actionLabel: "Review sync schedule",
    });
  }

  if (hasFailureLikeStatus(input.lastSypramSyncStatus)) {
    alerts.push({
      id: "sypram-last-status-failed",
      title: "Last Sypram sync did not succeed",
      severity: "warning",
      message: `Most recent sync status is "${input.lastSypramSyncStatus}".`,
      actionHref: "/admin/sync",
      actionLabel: "Inspect sync failures",
    });
  }

  return {
    overallStatus: getHighestSeverity(alerts),
    alerts,
  };
}
