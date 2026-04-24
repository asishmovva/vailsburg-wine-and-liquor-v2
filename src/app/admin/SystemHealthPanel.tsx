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
    staleOrders: number;
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
          <Badge className="bg-emerald-700">Live</Badge>
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
            Stale open orders
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {health.counts.staleOrders}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Pending {health.staleByStatus.pendingStore} - Preparing{" "}
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

