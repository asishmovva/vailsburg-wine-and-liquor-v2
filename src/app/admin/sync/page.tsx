"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";

type SyncCounts = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

type SyncSummary = SyncCounts & {
  runId: string;
  dryRun: boolean;
  durationMs: number;
};

type SyncLog = {
  id: string;
  runId: string;
  status: string;
  dryRun: boolean;
  counts: SyncCounts | null;
  finishedAt: string | null;
  errors?: string[] | null;
};

type SyncOverview = {
  state: {
    lastRunAt: string | null;
    lastStatus: string | null;
    lastSummary: SyncSummary | null;
  };
  cooldownActive: boolean;
  nextAllowedAt: string | null;
  logs: SyncLog[];
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function AdminSyncPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<SyncOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/sypram/sync", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as SyncOverview;
      setOverview(payload);
    } catch (error) {
      setMessage((error as Error).message ?? "Unable to load sync status.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const cooldownCopy = useMemo(() => {
    if (!overview?.cooldownActive) return null;
    return overview.nextAllowedAt
      ? `Cooldown active. Next allowed: ${formatDate(overview.nextAllowedAt)}`
      : "Cooldown active.";
  }, [overview]);

  const runSync = useCallback(
    async (dryRun: boolean) => {
      if (!user) return;
      setRunning(true);
      setMessage(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/admin/sypram/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dryRun }),
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload?.error === "cooldown_active") {
            setMessage(
              `Cooldown active. Next allowed: ${formatDate(payload.nextAllowedAt)}`
            );
          } else {
            setMessage(payload?.error ?? "Sync failed.");
          }
        } else {
          if (payload?.errors?.length) {
            const first = payload.errors[0];
            setMessage(
              `${dryRun ? "Dry sync" : "Sync"} completed with errors: ${first}`
            );
          } else {
            setMessage(
              dryRun ? "Dry sync completed. Review logs below." : "Sync completed."
            );
          }
        }
      } catch (error) {
        setMessage((error as Error).message ?? "Sync failed.");
      } finally {
        setRunning(false);
        void fetchOverview();
      }
    },
    [fetchOverview, user]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Sypram Sync</h1>
        <p className="text-sm text-zinc-600">
          Sync products from Sypram into Firestore. Cooldown enforced at 30
          minutes.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => runSync(true)}
            disabled={running || overview?.cooldownActive}
          >
            Run Dry Sync
          </Button>
          <Button
            onClick={() => runSync(false)}
            disabled={running || overview?.cooldownActive}
          >
            Run Commit Sync
          </Button>
        </div>
        {cooldownCopy ? (
          <p className="text-xs text-amber-600">{cooldownCopy}</p>
        ) : null}
        {message ? (
          <p className="text-sm text-zinc-600">{message}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">Last sync</h2>
        {loading ? (
          <p className="text-sm text-zinc-600">Loading status...</p>
        ) : overview?.state ? (
          <div className="space-y-2 text-sm text-zinc-600">
            <p>Last run: {formatDate(overview.state.lastRunAt)}</p>
            <p>Status: {overview.state.lastStatus ?? "—"}</p>
            {overview.state.lastSummary ? (
              <p>
                Counts: {overview.state.lastSummary.created} created,{" "}
                {overview.state.lastSummary.updated} updated,{" "}
                {overview.state.lastSummary.skipped} skipped,{" "}
                {overview.state.lastSummary.errors} errors
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No sync run yet.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">
          Recent sync runs
        </h2>
        {overview?.logs?.length ? (
          <div className="space-y-3 text-sm text-zinc-600">
            {overview.logs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-3"
              >
                <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                  <span>Run: {log.runId}</span>
                  <span>Status: {log.status}</span>
                  <span>{log.dryRun ? "Dry run" : "Committed"}</span>
                  <span>{formatDate(log.finishedAt)}</span>
                </div>
                {log.counts ? (
                  <div>
                    {log.counts.created} created, {log.counts.updated} updated,{" "}
                    {log.counts.skipped} skipped, {log.counts.errors} errors
                  </div>
                ) : null}
                {log.errors?.length ? (
                  <div className="text-xs text-rose-600">
                    {log.errors.slice(0, 2).map((err) => (
                      <p key={err}>{err}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No runs logged yet.</p>
        )}
      </Card>
    </div>
  );
}
