"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { authedFetch } from "@/lib/client/authedFetch";

type SystemHealthResponse = {
  generatedAt: string;
  counts: {
    failedNotificationsRecent: number;
    failedSyncRecent: number;
    openOrders: number;
    errorEvents24h: number;
    criticalEvents24h: number;
    staleOrders: number;
  };
  openByStatus: {
    pendingStore: number;
    preparing: number;
    readyForPickup: number;
    outForDelivery: number;
  };
  staleByStatus: {
    pendingStore: number;
    preparing: number;
    readyForPickup: number;
  };
  lastWebhookEvent: {
    at: string | null;
    type: string | null;
    eventId: string | null;
  };
  lastSypramSync: {
    at: string | null;
    status: string | null;
  };
  alerts: {
    overallStatus: "ok" | "warning" | "critical";
    alerts: Array<{
      id: string;
      title: string;
      severity: "warning" | "critical";
      message: string;
      actionHref?: string;
      actionLabel?: string;
    }>;
  };
  recentIncidents: Array<{
    id: string;
    source: string;
    eventType: string;
    severity: "warning" | "error" | "critical";
    message: string;
    createdAt: string | null;
  }>;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function formatDateForInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getHealthBadgeClass(status: "ok" | "warning" | "critical") {
  if (status === "critical") return "bg-red-700";
  if (status === "warning") return "bg-amber-700";
  return "bg-emerald-700";
}

function getHealthBadgeLabel(status: "ok" | "warning" | "critical") {
  if (status === "critical") return "Critical";
  if (status === "warning") return "Warning";
  return "Healthy";
}

function getIncidentTextClass(severity: "warning" | "error" | "critical") {
  if (severity === "critical") return "text-red-700";
  if (severity === "error") return "text-rose-700";
  return "text-amber-700";
}

export default function SystemHealthPanel() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      setError(null);
      const response = await authedFetch("/api/admin/system-health");
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load system health.");
      }
      const payload = (await response.json()) as SystemHealthResponse;
      setHealth(payload);
    } catch (loadError) {
      setError((loadError as Error).message ?? "Unable to load system health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const interval = setInterval(() => {
      void loadHealth();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const exportHref = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      start: formatDateForInput(start),
      end: formatDateForInput(end),
      format: "csv",
    });
    return `/api/admin/orders/export?${params.toString()}`;
  }, []);

  if (loading) {
    return (
      <Card className="space-y-2 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">System Health</p>
        <p>Loading operational metrics...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="space-y-2 p-4 text-sm text-red-600">
        <p className="font-medium text-zinc-900">System Health</p>
        <p>{error}</p>
      </Card>
    );
  }

  if (!health) return null;

  return (
    <Card id="system-health" className="space-y-5 p-4 text-sm text-zinc-700 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold text-zinc-900">System Health</p>
          <Badge className={getHealthBadgeClass(health.alerts.overallStatus)}>
            {getHealthBadgeLabel(health.alerts.overallStatus)}
          </Badge>
        </div>
        <p className="text-xs text-zinc-500">
          Last updated {formatDateTime(health.generatedAt)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Failed notifications (7d)
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {health.counts.failedNotificationsRecent}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Alert pipeline reliability</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Open order backlog
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {health.counts.openOrders}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Pending {health.openByStatus.pendingStore} - Preparing{" "}
            {health.openByStatus.preparing} - Ready{" "}
            {health.openByStatus.readyForPickup} - Delivery{" "}
            {health.openByStatus.outForDelivery}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Stale subset {health.counts.staleOrders} - Pending{" "}
            {health.staleByStatus.pendingStore} - Preparing{" "}
            {health.staleByStatus.preparing} - Ready{" "}
            {health.staleByStatus.readyForPickup}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Failed sync events (7d)
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {health.counts.failedSyncRecent}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Catalog sync health signal</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Error events (24h)
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {health.counts.errorEvents24h}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Includes persisted error-level server incidents
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Critical events (24h)
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {health.counts.criticalEvents24h}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Immediate escalation signals
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Active Alerts
        </p>
        {health.alerts.alerts.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            No active alerts. System health indicators look stable.
          </div>
        ) : (
          <div className="space-y-2">
            {health.alerts.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border p-3 text-sm ${
                  alert.severity === "critical"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{alert.title}</p>
                  <Badge
                    className={
                      alert.severity === "critical" ? "bg-red-700" : "bg-amber-700"
                    }
                  >
                    {alert.severity.toUpperCase()}
                  </Badge>
                </div>
                <p className="mt-1">{alert.message}</p>
                {alert.actionHref ? (
                  <div className="mt-2">
                    <Link
                      href={alert.actionHref}
                      className="text-xs font-semibold underline underline-offset-2"
                    >
                      {alert.actionLabel ?? "Investigate"}
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Recent Activity
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 p-3">
            <p className="text-[11px] text-zinc-500">Last webhook event</p>
            <p className="mt-1 text-xs font-medium text-zinc-800">
              {formatDateTime(health.lastWebhookEvent.at)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Type: {health.lastWebhookEvent.type ?? "-"}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 p-3">
            <p className="text-[11px] text-zinc-500">Last sync run</p>
            <p className="mt-1 text-xs font-medium text-zinc-800">
              {formatDateTime(health.lastSypramSync.at)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Status: {health.lastSypramSync.status ?? "-"}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 p-3">
            <p className="text-[11px] text-zinc-500">Dashboard refresh</p>
            <p className="mt-1 text-xs font-medium text-zinc-800">
              {formatDateTime(health.generatedAt)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Auto-refresh every 60s
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Recent Incidents
        </p>
        {health.recentIncidents.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">
            No persisted error incidents found.
          </div>
        ) : (
          <div className="space-y-2">
            {health.recentIncidents.map((incident) => (
              <div
                key={incident.id}
                className="rounded-xl border border-zinc-200 p-3 text-xs text-zinc-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`font-semibold ${getIncidentTextClass(incident.severity)}`}>
                    {incident.eventType}
                  </p>
                  <p className="text-zinc-500">{formatDateTime(incident.createdAt)}</p>
                </div>
                <p className="mt-1 text-sm text-zinc-800">{incident.message}</p>
                <p className="mt-1 text-zinc-500">Source: {incident.source}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
        <Link
          href="/admin/orders"
          className="font-medium text-zinc-800 underline underline-offset-2"
        >
          Open Orders Queue
        </Link>
        <a
          href={exportHref}
          className="font-medium text-zinc-800 underline underline-offset-2"
        >
          Export last 7 days of orders (CSV)
        </a>
      </div>
    </Card>
  );
}

