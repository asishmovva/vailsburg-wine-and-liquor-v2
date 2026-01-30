"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";

type PosQueueOrder = {
  orderId: string;
  status: string;
  fulfillmentStatus: string;
  total: number;
  pos: {
    pushStatus: string;
    attempts: number;
    lastAttemptAt: string | null;
    error?: string | null;
  };
  updatedAt: string | null;
};

type PosQueueSummary = {
  counts: {
    queued: number;
    failed: number;
    pushedToday: number;
  };
  recent: PosQueueOrder[];
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function AdminPosPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<PosQueueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/pos/queue", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as PosQueueSummary;
      setSummary(payload);
    } catch (error) {
      setMessage((error as Error).message ?? "Unable to load POS queue.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const processQueue = useCallback(
    async (orderId?: string) => {
      if (!user) return;
      setRunning(true);
      setMessage(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/admin/pos/process-queue", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderId ? { orderId } : {}),
        });
        const payload = await response.json();
        if (!response.ok) {
          setMessage(payload?.error ?? "POS processing failed.");
        } else {
          setMessage("POS queue processed.");
        }
      } catch (error) {
        setMessage((error as Error).message ?? "POS processing failed.");
      } finally {
        setRunning(false);
        void fetchSummary();
      }
    },
    [fetchSummary, user]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">POS Queue</h1>
        <p className="text-sm text-zinc-600">
          Monitor order pushes to Sypram and retry failed pushes.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => processQueue()} disabled={running}>
            Process queue
          </Button>
        </div>
        {message ? (
          <p className="text-sm text-zinc-600">{message}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">Queue status</h2>
        {loading ? (
          <p className="text-sm text-zinc-600">Loading status...</p>
        ) : summary ? (
          <div className="flex flex-wrap gap-4 text-sm text-zinc-600">
            <span>Queued: {summary.counts.queued}</span>
            <span>Failed: {summary.counts.failed}</span>
            <span>Pushed today: {summary.counts.pushedToday}</span>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No data yet.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">
          Recent orders
        </h2>
        {summary?.recent?.length ? (
          <div className="space-y-3 text-sm text-zinc-600">
            {summary.recent.map((order) => (
              <div
                key={order.orderId}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3"
              >
                <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                  <span>Order: {order.orderId}</span>
                  <span>Push: {order.pos.pushStatus}</span>
                  <span>Attempts: {order.pos.attempts}</span>
                  <span>Last attempt: {formatDate(order.pos.lastAttemptAt)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="capitalize">
                    Fulfillment: {order.fulfillmentStatus}
                  </span>
                  <span className="font-semibold text-zinc-900">
                    ${Number(order.total ?? 0).toFixed(2)}
                  </span>
                </div>
                {order.pos.pushStatus === "failed" ? (
                  <div className="space-y-2">
                    {order.pos.error ? (
                      <p className="text-xs text-rose-600">
                        {order.pos.error}
                      </p>
                    ) : null}
                    <Button
                      variant="outline"
                      onClick={() => processQueue(order.orderId)}
                      disabled={running}
                    >
                      Retry push
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No orders found.</p>
        )}
      </Card>
    </div>
  );
}
