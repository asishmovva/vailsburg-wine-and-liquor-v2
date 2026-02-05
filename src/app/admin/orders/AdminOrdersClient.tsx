"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { orderNumberFromId } from "@/utils/order";

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
  category?: string;
};

type OrderRecord = {
  id: string;
  orderId?: string;
  status?: string;
  createdAt?: unknown;
  fulfillment?: "delivery" | "pickup";
  delivery?: { address: string; miles?: number; eligible?: boolean } | null;
  total?: number;
  subtotal?: number;
  tip?: number;
  tax?: number;
  email?: string | null;
  phone?: string | null;
  customer?: { name?: string | null; phone?: string | null; email?: string | null };
  items?: OrderItem[];
  cancellationReason?: string | null;
  statusNote?: string | null;
};

const STATUS_TABS = [
  ORDER_STATUSES.NEW,
  ORDER_STATUSES.ACCEPTED,
  ORDER_STATUSES.READY,
  ORDER_STATUSES.COMPLETED,
  ORDER_STATUSES.CANCELLED,
];

const STATUS_LABELS: Record<string, string> = {
  [ORDER_STATUSES.NEW]: "New",
  [ORDER_STATUSES.ACCEPTED]: "Accepted",
  [ORDER_STATUSES.READY]: "Ready",
  [ORDER_STATUSES.COMPLETED]: "Completed",
  [ORDER_STATUSES.CANCELLED]: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  [ORDER_STATUSES.NEW]: "bg-emerald-100 text-emerald-700",
  [ORDER_STATUSES.ACCEPTED]: "bg-blue-100 text-blue-700",
  [ORDER_STATUSES.READY]: "bg-amber-100 text-amber-700",
  [ORDER_STATUSES.COMPLETED]: "bg-zinc-200 text-zinc-700",
  [ORDER_STATUSES.CANCELLED]: "bg-red-100 text-red-700",
};

function formatMoney(value?: number) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function parseDate(value?: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const seconds = (value as { _seconds?: number; seconds?: number })._seconds ??
    (value as { seconds?: number }).seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000);
  }
  return null;
}

function formatTimeAgo(date?: Date | null) {
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function getCustomerDisplay(order: OrderRecord) {
  const name = order.customer?.name ?? order.email ?? "Customer";
  const phone = order.customer?.phone ?? order.phone ?? "—";
  const email = order.customer?.email ?? order.email ?? "—";
  return { name, phone, email };
}

export default function AdminOrdersClient() {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole(user);
  const [activeStatus, setActiveStatus] = useState<string>(ORDER_STATUSES.NEW);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const audioContextRef = useRef<AudioContext | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotificationStatus("unsupported");
      return;
    }
    setNotificationStatus(Notification.permission);
  }, []);

  const playBeep = useCallback(() => {
    if (alertsMuted) return;
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    oscillator.stop(ctx.currentTime + 0.25);
  }, [alertsMuted]);

  const enableAlerts = async () => {
    if (notificationStatus === "unsupported") {
      toast.error("Browser notifications are not supported.");
      return;
    }
    if (notificationStatus !== "granted") {
      const permission = await Notification.requestPermission();
      setNotificationStatus(permission);
      if (permission !== "granted") {
        toast.error("Notifications are blocked in this browser.");
        return;
      }
    }

    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
      }
    }
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }
    playBeep();
    setAlertsEnabled(true);
    toast.success("Alerts enabled.");
  };

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/orders?status=${activeStatus}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to load orders.");
      }
      const payload = (await response.json()) as { orders?: OrderRecord[] };
      const data = (payload.orders ?? []).map((order) => ({
        ...order,
        id: order.id ?? order.orderId ?? "",
      }));
      setOrders(data);
      setLastUpdated(new Date());

      if (activeStatus === ORDER_STATUSES.NEW && alertsEnabled) {
        const currentIds = new Set(data.map((order) => order.id));
        if (initialLoadedRef.current) {
          const newOrders = data.filter((order) => !knownIdsRef.current.has(order.id));
          if (newOrders.length > 0) {
            const latest = newOrders[0];
            if (notificationStatus === "granted") {
              new Notification("New order received", {
                body: `${formatMoney(latest.total)} • ${latest.fulfillment ?? "pickup"}`,
              });
            }
            playBeep();
          }
        }
        knownIdsRef.current = currentIds;
        initialLoadedRef.current = true;
      } else if (!initialLoadedRef.current) {
        knownIdsRef.current = new Set(data.map((order) => order.id));
        initialLoadedRef.current = true;
      }
    } catch (err) {
      setError((err as Error).message ?? "Unable to load orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, [activeStatus, alertsEnabled, notificationStatus, playBeep, user]);

  useEffect(() => {
    if (!user || roleLoading || role !== "admin") return;
    setLoadingOrders(true);
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders, role, roleLoading, user]);

  const handleStatusChange = async (
    orderId: string,
    status: string,
    reason?: string
  ) => {
    if (!user) return;
    setUpdatingId(orderId);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, reason }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to update status.");
      }
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status,
                cancellationReason: status === ORDER_STATUSES.CANCELLED ? reason ?? order.cancellationReason ?? null : order.cancellationReason,
              }
            : order
        )
      );
      toast.success(`Order ${STATUS_LABELS[status] ?? status}`);
    } catch (err) {
      toast.error((err as Error).message ?? "Unable to update order.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      setCancelError("Please provide a cancellation reason.");
      return;
    }
    setCancelError(null);
    await handleStatusChange(cancelTarget.id, ORDER_STATUSES.CANCELLED, cancelReason.trim());
    setCancelTarget(null);
    setCancelReason("");
  };

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) => {
      const customer = getCustomerDisplay(order);
      return (
        order.id.toLowerCase().includes(term) ||
        (order.orderId ?? "").toLowerCase().includes(term) ||
        customer.phone.toLowerCase().includes(term) ||
        customer.email.toLowerCase().includes(term)
      );
    });
  }, [orders, search]);

  if (loading || roleLoading) {
    return (
      <Card className="p-6 text-sm text-zinc-600">Loading admin view...</Card>
    );
  }

  if (!user || role !== "admin") {
    return (
      <Card className="p-6 text-sm text-zinc-600">Not authorized.</Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-zinc-900">Admin Orders</h1>
            <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">
              Admin Mode
            </span>
          </div>
          <p className="text-sm text-zinc-600">
            Live queue for staff processing.
          </p>
        </div>
        <div className="space-y-1 text-right text-xs text-zinc-500">
          <p>Polling every 15s</p>
          <p>
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
          </p>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setActiveStatus(status);
                initialLoadedRef.current = false;
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeStatus === status
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search by order id or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            variant="outline"
            onClick={enableAlerts}
            disabled={alertsEnabled}
          >
            {alertsEnabled ? "Alerts enabled" : "Enable alerts"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setAlertsMuted((prev) => !prev)}
            disabled={!alertsEnabled}
          >
            {alertsMuted ? "Unmute" : "Mute"}
          </Button>
        </div>
        {notificationStatus === "denied" ? (
          <p className="text-xs text-amber-600">
            Notifications are blocked in your browser settings.
          </p>
        ) : null}
      </Card>

      {loadingOrders ? (
        <Card className="p-6 text-sm text-zinc-600">Loading orders...</Card>
      ) : null}

      {error ? (
        <Card className="p-6 text-sm text-red-600">{error}</Card>
      ) : null}

      {!loadingOrders && filteredOrders.length === 0 ? (
        <Card className="p-6 text-sm text-zinc-600">
          No orders found for this status.
        </Card>
      ) : null}

      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const status = order.status ?? ORDER_STATUSES.NEW;
          const createdAt = parseDate(order.createdAt);
          const customer = getCustomerDisplay(order);
          const items = order.items ?? [];
          return (
            <Card key={order.id} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-zinc-500">
                    Order #{orderNumberFromId(order.id)}
                  </p>
                  <h3 className="text-lg font-semibold text-zinc-900">
                    {order.id}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {createdAt ? createdAt.toLocaleString() : "—"} • {formatTimeAgo(createdAt)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700"}`}
                >
                  {STATUS_LABELS[status] ?? status}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm text-zinc-700">
                  <p className="font-medium text-zinc-900">Fulfillment</p>
                  <p className="capitalize">{order.fulfillment ?? "pickup"}</p>
                  {order.fulfillment === "delivery" && order.delivery?.address ? (
                    <p className="text-sm text-zinc-600">{order.delivery.address}</p>
                  ) : null}
                  <p className="text-sm text-zinc-600">
                    {formatMoney(order.total)} total • Tip {formatMoney(order.tip)} • Tax {formatMoney(order.tax)}
                  </p>
                </div>
                <div className="space-y-2 text-sm text-zinc-700">
                  <p className="font-medium text-zinc-900">Customer</p>
                  <p>{customer.name}</p>
                  <p className="text-sm text-zinc-600">{customer.email}</p>
                  <a
                    href={customer.phone !== "—" ? `tel:${customer.phone}` : undefined}
                    className="text-sm text-zinc-600 underline-offset-4 hover:underline"
                  >
                    {customer.phone}
                  </a>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-900">Items</p>
                {items.length === 0 ? (
                  <p className="text-sm text-zinc-500">No items found.</p>
                ) : (
                  <div className="space-y-2 text-sm text-zinc-700">
                    {items.map((item) => (
                      <div
                        key={`${order.id}-${item.productId}`}
                        className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-b-0 last:pb-0"
                      >
                        <span>
                          {item.qty} × {item.name}
                        </span>
                        <span>{formatMoney(item.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm text-zinc-600">
                <p>
                  Notes: {order.statusNote || "—"}
                </p>
                {order.cancellationReason ? (
                  <p className="text-sm text-red-600">
                    Cancel reason: {order.cancellationReason}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {status === ORDER_STATUSES.NEW ? (
                  <>
                    <Button
                      onClick={() => handleStatusChange(order.id, ORDER_STATUSES.ACCEPTED)}
                      disabled={updatingId === order.id}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCancelTarget(order);
                        setCancelReason("");
                        setCancelError(null);
                      }}
                      disabled={updatingId === order.id}
                    >
                      Cancel
                    </Button>
                  </>
                ) : null}
                {status === ORDER_STATUSES.ACCEPTED ? (
                  <Button
                    onClick={() => handleStatusChange(order.id, ORDER_STATUSES.READY)}
                    disabled={updatingId === order.id}
                  >
                    Mark Ready
                  </Button>
                ) : null}
                {status === ORDER_STATUSES.READY ? (
                  <Button
                    onClick={() => handleStatusChange(order.id, ORDER_STATUSES.COMPLETED)}
                    disabled={updatingId === order.id}
                  >
                    Complete
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">Cancel order</h3>
              <p className="text-sm text-zinc-600">
                Provide a reason for cancelling order {cancelTarget.id}.
              </p>
            </div>
            <textarea
              className="h-24 w-full rounded-2xl border border-zinc-200 p-3 text-sm text-zinc-700"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Reason for cancellation"
            />
            {cancelError ? (
              <p className="text-xs text-red-600">{cancelError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCancelTarget(null)}
              >
                Back
              </Button>
              <Button
                onClick={handleCancelConfirm}
                disabled={updatingId === cancelTarget.id}
              >
                Confirm cancel
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
