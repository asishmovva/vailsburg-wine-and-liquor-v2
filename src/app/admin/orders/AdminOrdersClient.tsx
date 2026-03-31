"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
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

const NEW_PULSE_MS = 30000;
const DELAYED_MINUTES = 15;
const CANCEL_PRESETS = [
  { label: "Out of stock", value: "Out of stock" },
  { label: "Customer unreachable", value: "Customer unreachable" },
  { label: "Store closing", value: "Store closing" },
  { label: "Other", value: "Other" },
];

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
  if (!date) return "-";
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
  const phone = order.customer?.phone ?? order.phone ?? "-";
  const email = order.customer?.email ?? order.email ?? "-";
  return { name, phone, email };
}

type PrimaryAction = { label: string; nextStatus: string };

function getPrimaryAction(status: string): PrimaryAction | null {
  switch (status) {
    case ORDER_STATUSES.NEW:
      return { label: "Accept", nextStatus: ORDER_STATUSES.ACCEPTED };
    case ORDER_STATUSES.ACCEPTED:
      return { label: "Ready", nextStatus: ORDER_STATUSES.READY };
    case ORDER_STATUSES.READY:
      return { label: "Complete", nextStatus: ORDER_STATUSES.COMPLETED };
    default:
      return null;
  }
}

function isFinalStatus(status: string) {
  return (
    status === ORDER_STATUSES.COMPLETED ||
    status === ORDER_STATUSES.CANCELLED
  );
}

export default function AdminOrdersClient() {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole(user);
  const [activeStatus, setActiveStatus] = useState<string>(ORDER_STATUSES.NEW);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastPollAt, setLastPollAt] = useState<Date | null>(null);
  const [pollStale, setPollStale] = useState(false);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelPreset, setCancelPreset] = useState<string>("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    orderId: string;
    action: string;
  } | null>(null);

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const audioContextRef = useRef<AudioContext | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadedRef = useRef(false);
  const lastStaleAlertRef = useRef(0);

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
                body: `${formatMoney(latest.total)} - ${latest.fulfillment ?? "pickup"}`,
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
      setLastPollAt(new Date());
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

  useEffect(() => {
    const interval = setInterval(() => {
      if (!lastPollAt) {
        setPollStale(false);
        return;
      }
      const stale = Date.now() - lastPollAt.getTime() > 45000;
      setPollStale(stale);
      if (stale && alertsEnabled && !alertsMuted) {
        const now = Date.now();
        if (now - lastStaleAlertRef.current > 30000) {
          playBeep();
          lastStaleAlertRef.current = now;
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [alertsEnabled, alertsMuted, lastPollAt, playBeep]);

  const handleTestAlert = async () => {
    if (!alertsEnabled) {
      await enableAlerts();
    }
    if (notificationStatus === "granted") {
      new Notification("Order alerts test", {
        body: "Notifications are enabled for new orders.",
      });
    }
    playBeep();
  };

  useEffect(() => {
    if (!pendingAction) return;
    const timeout = setTimeout(() => {
      setPendingAction(null);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [pendingAction]);

  const handleStatusChange = useCallback(
    async (orderId: string, status: string, reason?: string) => {
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
                  cancellationReason:
                    status === ORDER_STATUSES.CANCELLED
                      ? reason ?? order.cancellationReason ?? null
                      : order.cancellationReason,
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
    },
    [user]
  );

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
    setCancelPreset("");
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

  const activeMobileOrder = useMemo(() => {
    if (!expandedOrderId) return null;
    return filteredOrders.find((order) => order.id === expandedOrderId) ?? null;
  }, [expandedOrderId, filteredOrders]);

  const showMobileActionBar = useMemo(() => {
    if (!activeMobileOrder) return false;
    const status = activeMobileOrder.status ?? ORDER_STATUSES.NEW;
    const hasPrimary = Boolean(getPrimaryAction(status));
    const canCancel = status === ORDER_STATUSES.NEW;
    return hasPrimary || canCancel;
  }, [activeMobileOrder]);

  const handleCardToggle = useCallback(
    (event: MouseEvent<HTMLDivElement>, orderId: string) => {
      if (typeof window === "undefined") return;
      if (window.innerWidth >= 640) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, a, textarea, input, label")) return;
      setPendingAction(null);
      setExpandedOrderId((prev) => (prev === orderId ? null : orderId));
    },
    []
  );

  const handlePrimaryAction = useCallback(
    (orderId: string, nextStatus: string) => {
      if (pendingAction?.orderId === orderId && pendingAction.action === nextStatus) {
        setPendingAction(null);
        handleStatusChange(orderId, nextStatus);
        return;
      }
      setPendingAction({ orderId, action: nextStatus });
    },
    [handleStatusChange, pendingAction]
  );

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
    <div
      className={`space-y-6 ${showMobileActionBar ? "pb-24 sm:pb-0" : ""}`}
    >
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
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "-"}
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
                setExpandedOrderId(null);
                setPendingAction(null);
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
            onClick={handleTestAlert}
            disabled={notificationStatus === "unsupported"}
          >
            Test alert
          </Button>
          <Button
            variant="outline"
            onClick={() => setAlertsMuted((prev) => !prev)}
            disabled={!alertsEnabled}
          >
            {alertsMuted ? "Unmute" : "Mute"}
          </Button>
        </div>
        <p className="text-xs text-zinc-500">
          Notification permission: {notificationStatus}
        </p>
        {notificationStatus === "denied" ? (
          <p className="text-xs text-amber-600">
            Notifications are blocked in your browser settings.
          </p>
        ) : null}
      </Card>

      {pollStale ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          Updates paused—refresh tab.
        </Card>
      ) : null}

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
          const isExpanded = expandedOrderId === order.id;
          const primaryAction = getPrimaryAction(status);
          const isNewPulse = Boolean(
            status === ORDER_STATUSES.NEW &&
              createdAt &&
              Date.now() - createdAt.getTime() < NEW_PULSE_MS
          );
          const isDelayed = Boolean(
            createdAt &&
              !isFinalStatus(status) &&
              Date.now() - createdAt.getTime() > DELAYED_MINUTES * 60 * 1000
          );
          const deliveryAddress =
            order.fulfillment === "delivery" ? order.delivery?.address : null;
          const mapHref = deliveryAddress
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                deliveryAddress
              )}`
            : "";
          const phoneHref =
            customer.phone && customer.phone !== "-" ? `tel:${customer.phone}` : "";
          const showItems = isExpanded;
          return (
            <Card
              key={order.id}
              className={`space-y-4 ${isExpanded ? "ring-1 ring-zinc-200" : ""} cursor-pointer sm:cursor-default`}
              onClick={(event) => handleCardToggle(event, order.id)}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {isNewPulse ? (
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    ) : null}
                    <span>Order #{orderNumberFromId(order.id)}</span>
                    {isDelayed ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Delayed
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-zinc-900">
                      {customer.name}
                    </h3>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 capitalize">
                      {order.fulfillment ?? "pickup"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {createdAt ? createdAt.toLocaleString() : "-"} |{" "}
                    {formatTimeAgo(createdAt)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700"}`}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  <p className="text-lg font-semibold text-zinc-900">
                    {formatMoney(order.total)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-sm text-zinc-700 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-zinc-900">Customer</p>
                    <p>{customer.email}</p>
                    {phoneHref ? (
                      <a
                        href={phoneHref}
                        className="inline-flex items-center gap-2 text-zinc-700 underline-offset-4 hover:underline"
                      >
                        {customer.phone}
                      </a>
                    ) : (
                      <p>-</p>
                    )}
                  </div>
                  {deliveryAddress ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-zinc-900">
                        Delivery address
                      </p>
                      {mapHref ? (
                        <a
                          href={mapHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-zinc-700 underline-offset-4 hover:underline"
                        >
                          {deliveryAddress}
                        </a>
                      ) : (
                        <p>{deliveryAddress}</p>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1 text-sm text-zinc-600 sm:text-right">
                  <p>Subtotal {formatMoney(order.subtotal)}</p>
                  <p>
                    Tip {formatMoney(order.tip)} | Tax {formatMoney(order.tax)}
                  </p>
                </div>
              </div>

              {!showItems && items.length > 0 ? (
                <p className="text-xs text-zinc-500 sm:hidden">
                  Tap to view {items.length} item{items.length === 1 ? "" : "s"}.
                </p>
              ) : null}
              {!showItems && items.length === 0 ? (
                <p className="text-xs text-zinc-500 sm:hidden">No items found.</p>
              ) : null}

              <div className={`${showItems ? "block" : "hidden sm:block"} space-y-2`}>
                <p className="text-sm font-semibold text-zinc-900">Items</p>
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
                          {item.qty} x {item.name}
                        </span>
                        <span>{formatMoney(item.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${showItems ? "block" : "hidden sm:block"} space-y-2 text-sm text-zinc-600`}>
                <p>Notes: {order.statusNote || "-"}</p>
                {order.cancellationReason ? (
                  <p className="text-sm text-red-600">
                    Cancel reason: {order.cancellationReason}
                  </p>
                ) : null}
              </div>

              <div className="hidden flex-wrap gap-2 sm:flex">
                {status === ORDER_STATUSES.NEW ? (
                  <>
                    <Button
                      onClick={() =>
                        handleStatusChange(order.id, ORDER_STATUSES.ACCEPTED)
                      }
                      disabled={updatingId === order.id}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCancelTarget(order);
                        setCancelReason("");
                        setCancelPreset("");
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
                    onClick={() =>
                      handleStatusChange(order.id, ORDER_STATUSES.READY)
                    }
                    disabled={updatingId === order.id}
                  >
                    Ready
                  </Button>
                ) : null}
                {status === ORDER_STATUSES.READY ? (
                  <Button
                    onClick={() =>
                      handleStatusChange(order.id, ORDER_STATUSES.COMPLETED)
                    }
                    disabled={updatingId === order.id}
                  >
                    Complete
                  </Button>
                ) : null}
                {!primaryAction && status === ORDER_STATUSES.CANCELLED ? (
                  <span className="text-xs text-zinc-500">
                    Cancelled order
                  </span>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {showMobileActionBar && activeMobileOrder ? (() => {
        const status = activeMobileOrder.status ?? ORDER_STATUSES.NEW;
        const primaryAction = getPrimaryAction(status);
        const canCancel = status === ORDER_STATUSES.NEW;
        if (!primaryAction && !canCancel) return null;
        const confirmLabel =
          pendingAction?.orderId === activeMobileOrder.id &&
          pendingAction.action === primaryAction?.nextStatus
            ? "Tap again to confirm"
            : primaryAction?.label;
        return (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white p-3 sm:hidden">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
              <span>Order #{orderNumberFromId(activeMobileOrder.id)}</span>
              <span>{STATUS_LABELS[status] ?? status}</span>
            </div>
            <div className="flex gap-2">
              {primaryAction ? (
                <Button
                  className="flex-1"
                  onClick={() =>
                    handlePrimaryAction(activeMobileOrder.id, primaryAction.nextStatus)
                  }
                  disabled={updatingId === activeMobileOrder.id}
                >
                  {confirmLabel ?? primaryAction.label}
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCancelTarget(activeMobileOrder);
                    setCancelReason("");
                    setCancelPreset("");
                    setCancelError(null);
                  }}
                  disabled={updatingId === activeMobileOrder.id}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
            {pendingAction?.orderId === activeMobileOrder.id ? (
              <p className="mt-2 text-xs text-zinc-500">
                Tap again to confirm status change.
              </p>
            ) : null}
          </div>
        );
      })() : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-zinc-900">Cancel order</h3>
              <p className="text-sm text-zinc-600">
                Provide a reason for cancelling order #{orderNumberFromId(cancelTarget.id)}.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-900">Reason</p>
              <div className="grid grid-cols-2 gap-2">
                {CANCEL_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setCancelPreset(preset.value);
                      setCancelReason(preset.value === "Other" ? "" : preset.value);
                    }}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      cancelPreset === preset.value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {cancelPreset === "Other" ? (
              <textarea
                className="mt-3 h-24 w-full rounded-2xl border border-zinc-200 p-3 text-sm text-zinc-700"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Reason for cancellation"
              />
            ) : null}

            {cancelError ? (
              <p className="mt-2 text-xs text-red-600">{cancelError}</p>
            ) : null}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason("");
                  setCancelPreset("");
                  setCancelError(null);
                }}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
