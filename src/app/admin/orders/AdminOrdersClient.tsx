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
import { getOrderStaleState } from "@/lib/ops/staleOrders";
import {
  getMissedNotificationCandidates,
  getNotificationEventLabel,
  getNotificationSentAt,
  getNotificationState,
  getRelevantNotificationEvents,
  type NotificationEventKey,
} from "@/lib/notifications/events";
import {
  getFirstMissedNotificationCandidate,
  hasNotificationAttention,
  hasNotificationFailure,
  matchesNotificationHealthFilter,
  summarizeNotificationHealth,
} from "@/lib/notifications/ops";
import {
  ADMIN_ORDER_STATUSES,
  ADMIN_STATUS_LABELS,
  getAdminPrimaryActionLabel,
  getAllowedNextStatuses,
  normalizeAdminOrderStatus,
  type AdminOrderStatus,
} from "@/lib/orders/adminStatusTransitions";
import type {
  OrderAdminHistoryEntry,
  OrderHandoffVerification,
  OrderRecord,
  OrderRefundStatus,
  RefundReconciliationState,
} from "@/lib/orders/types";
import { orderNumberFromId } from "@/utils/order";

const STATUS_TABS: AdminOrderStatus[] = [
  ADMIN_ORDER_STATUSES.PENDING_STORE,
  ADMIN_ORDER_STATUSES.PREPARING,
  ADMIN_ORDER_STATUSES.READY_FOR_PICKUP,
  ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY,
  ADMIN_ORDER_STATUSES.COMPLETED,
  ADMIN_ORDER_STATUSES.CANCELLED,
];

const STATUS_STYLES: Record<AdminOrderStatus, string> = {
  [ADMIN_ORDER_STATUSES.PENDING_STORE]: "bg-emerald-100 text-emerald-700",
  [ADMIN_ORDER_STATUSES.PREPARING]: "bg-blue-100 text-blue-700",
  [ADMIN_ORDER_STATUSES.READY_FOR_PICKUP]: "bg-amber-100 text-amber-700",
  [ADMIN_ORDER_STATUSES.OUT_FOR_DELIVERY]: "bg-violet-100 text-violet-700",
  [ADMIN_ORDER_STATUSES.COMPLETED]: "bg-zinc-200 text-zinc-700",
  [ADMIN_ORDER_STATUSES.CANCELLED]: "bg-red-100 text-red-700",
};

const NEW_PULSE_MS = 30000;
const POLL_INTERVAL_MS = 15000;
const STALE_AFTER_MS = 45000;

const CANCEL_PRESETS = [
  "Customer requested cancellation",
  "Out of stock",
  "Store unable to fulfill",
  "Delivery issue",
  "Duplicate order",
  "Other",
] as const;

type PendingAction = {
  orderId: string;
  action: string;
};

type MutationPayload = {
  status?: string;
  reason?: string;
  refundStatus?: OrderRefundStatus;
  refundNote?: string;
  handoffVerification?: {
    idChecked: boolean;
    signatureCollected?: boolean;
    note?: string;
  };
};

type NotificationHealthFilter = "all" | "needs_attention" | "failed" | "missed";

const NOTIFICATION_FILTER_OPTIONS: Array<{
  value: NotificationHealthFilter;
  label: string;
}> = [
  { value: "all", label: "All notifications" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "failed", label: "Failed sends" },
  { value: "missed", label: "Missed sends" },
];

function formatMoney(value?: number) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function parseDate(value?: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const seconds =
    (value as { _seconds?: number; seconds?: number })._seconds ??
    (value as { seconds?: number }).seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000);
  }
  return null;
}

function formatDateTime(value?: unknown) {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleString() : "-";
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
  return {
    name: order.customer?.name ?? order.email ?? "Customer",
    phone: order.customer?.phone ?? order.phone ?? "-",
    email: order.customer?.email ?? order.email ?? "-",
  };
}

function isPaidOrder(order: OrderRecord) {
  return Boolean(order.paidAt || order.paid);
}

function getNormalizedStatus(order: OrderRecord) {
  return (
    normalizeAdminOrderStatus(order.status) ?? ADMIN_ORDER_STATUSES.PENDING_STORE
  );
}

function getPrimaryAction(order: OrderRecord) {
  const nextStatuses = getAllowedNextStatuses({
    currentStatus: order.status,
    fulfillment: order.fulfillment,
  });
  const nextStatus = nextStatuses.find(
    (status) => status !== ADMIN_ORDER_STATUSES.CANCELLED
  );
  const label = getAdminPrimaryActionLabel({
    currentStatus: order.status,
    fulfillment: order.fulfillment,
  });

  if (!nextStatus || !label) return null;
  return { label, nextStatus };
}

function canCancelOrder(order: OrderRecord) {
  return getAllowedNextStatuses({
    currentStatus: order.status,
    fulfillment: order.fulfillment,
  }).includes(ADMIN_ORDER_STATUSES.CANCELLED);
}

function getRefundActions(order: OrderRecord) {
  const normalizedStatus = getNormalizedStatus(order);
  if (normalizedStatus !== ADMIN_ORDER_STATUSES.CANCELLED || !isPaidOrder(order)) {
    return {
      canMarkPending: false,
      canMarkRefunded: false,
    };
  }

  return {
    canMarkPending: order.refundStatus !== "manual_pending" && order.refundStatus !== "refunded",
    canMarkRefunded: order.refundStatus !== "refunded",
  };
}

function getHistoryLabel(entry: OrderAdminHistoryEntry) {
  switch (entry.action) {
    case "cancel":
      return "Cancelled order";
    case "refund_marked":
      return `Refund ${entry.to?.replace("_", " ") ?? "updated"}`;
    case "note_added":
      return "Added note";
    case "status_change":
    default:
      return `Changed status to ${entry.to ?? "updated"}`;
  }
}

const REFUND_RECONCILIATION_LABELS: Record<
  RefundReconciliationState,
  { title: string; toneClass: string; description: string }
> = {
  not_checked: {
    title: "Not checked",
    toneClass: "bg-zinc-100 text-zinc-700",
    description: "Stripe reconciliation has not been checked yet.",
  },
  not_marked_refunded: {
    title: "Not marked refunded",
    toneClass: "bg-zinc-100 text-zinc-700",
    description: "Refund has not been manually marked in admin yet.",
  },
  stripe_refunded: {
    title: "Stripe refunded",
    toneClass: "bg-emerald-100 text-emerald-700",
    description: "Stripe confirms refunded funds for this order.",
  },
  manual_marked_without_stripe_refund: {
    title: "Mismatch: manual only",
    toneClass: "bg-red-100 text-red-700",
    description:
      "Order is marked refunded in admin, but Stripe refund evidence is missing.",
  },
  manual_marked_without_payment_intent: {
    title: "Mismatch: no payment intent",
    toneClass: "bg-red-100 text-red-700",
    description:
      "Order is marked refunded in admin, but no Stripe payment intent is linked.",
  },
  stripe_check_failed: {
    title: "Stripe check failed",
    toneClass: "bg-amber-100 text-amber-700",
    description:
      "Stripe refund reconciliation could not be completed automatically.",
  },
};

function formatCentsAsMoney(value?: number | null) {
  if (typeof value !== "number") return "-";
  return `$${value.toFixed(2)}`;
}

function getRefundReconciliationView(
  order: Pick<OrderRecord, "refundStatus" | "refundReconciliation">
) {
  const reconciliation = order.refundReconciliation;
  if (!reconciliation) {
    if (order.refundStatus === "refunded") {
      return {
        badge: {
          title: "Mismatch: missing check",
          toneClass: "bg-red-100 text-red-700",
        },
        details: {
          description:
            "Order is marked refunded but no reconciliation details are stored.",
          stripeInfo: null as string | null,
          amountInfo: null as string | null,
          errorInfo: null as string | null,
        },
      };
    }
    return null;
  }

  const fallback = REFUND_RECONCILIATION_LABELS.not_checked;
  const label =
    REFUND_RECONCILIATION_LABELS[reconciliation.state as RefundReconciliationState] ??
    fallback;
  const stripeInfo = reconciliation.stripePaymentIntentId
    ? `PI ${reconciliation.stripePaymentIntentId}`
    : null;
  const amountInfo =
    typeof reconciliation.stripeAmountCaptured === "number" ||
    typeof reconciliation.stripeAmountRefunded === "number"
      ? `Refunded ${formatCentsAsMoney(
          reconciliation.stripeAmountRefunded ?? null
        )} / Captured ${formatCentsAsMoney(
          reconciliation.stripeAmountCaptured ?? null
        )}`
      : null;

  return {
    badge: {
      title: label.title,
      toneClass: label.toneClass,
    },
    details: {
      description: label.description,
      stripeInfo,
      amountInfo,
      errorInfo: reconciliation.stripeLastError ?? null,
    },
  };
}

function getHandoffVerificationBadge(
  order: Pick<OrderRecord, "handoffVerification" | "fulfillment">
) {
  const verification = order.handoffVerification;
  if (!verification?.idChecked) {
    return {
      label: "ID check pending",
      className: "bg-amber-100 text-amber-700",
    };
  }

  if (order.fulfillment === "delivery" && !verification.signatureCollected) {
    return {
      label: "Signature pending",
      className: "bg-amber-100 text-amber-700",
    };
  }

  if (order.fulfillment === "delivery" && verification.signatureCollected) {
    return {
      label: "ID + signature verified",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: "ID verified",
    className: "bg-emerald-100 text-emerald-700",
  };
}

function requiresAlcoholHandoffVerification(order: Pick<OrderRecord, "ageVerified" | "fulfillment">) {
  return order.ageVerified === true || order.fulfillment === "delivery";
}

function buildHandoffVerificationPayload(
  order: Pick<OrderRecord, "handoffVerification" | "fulfillment">,
  updates: Partial<OrderHandoffVerification>,
  fallbackNote: string
) {
  return {
    idChecked: updates.idChecked ?? order.handoffVerification?.idChecked ?? false,
    signatureCollected:
      updates.signatureCollected ??
      order.handoffVerification?.signatureCollected ??
      false,
    note:
      updates.note ??
      order.handoffVerification?.note ??
      fallbackNote,
  };
}

function getHandoffVerificationWarning(order: Pick<OrderRecord, "handoffVerification" | "fulfillment" | "ageVerified">) {
  if (!requiresAlcoholHandoffVerification(order)) return null;
  if (!order.handoffVerification?.idChecked) {
    return "ID check is still pending. Verify it before completing this order.";
  }
  if (order.fulfillment === "delivery" && !order.handoffVerification?.signatureCollected) {
    return "Signature has not been collected yet for this delivery handoff.";
  }
  return null;
}

export default function AdminOrdersClient() {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole(user);

  const [activeStatus, setActiveStatus] = useState<AdminOrderStatus>(
    ADMIN_ORDER_STATUSES.PENDING_STORE
  );
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastPollAt, setLastPollAt] = useState<Date | null>(null);
  const [pollStale, setPollStale] = useState(false);
  const [search, setSearch] = useState("");
  const [notificationFilter, setNotificationFilter] =
    useState<NotificationHealthFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPreset, setCancelPreset] = useState<string>("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [printOrderId, setPrintOrderId] = useState<string | null>(null);
  const [resendingKey, setResendingKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const resetPrintMode = () => setPrintOrderId(null);
    window.addEventListener("afterprint", resetPrintMode);
    return () => window.removeEventListener("afterprint", resetPrintMode);
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
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
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
        items: order.items ?? [],
        adminHistory: order.adminHistory ?? [],
      }));
      setOrders(data);
      setLastUpdated(new Date());

      if (activeStatus === ADMIN_ORDER_STATUSES.PENDING_STORE && alertsEnabled) {
        const currentIds = new Set(data.map((order) => order.id));
        if (initialLoadedRef.current) {
          const newOrders = data.filter((order) => !knownIdsRef.current.has(order.id));
          if (newOrders.length > 0) {
            const latest = newOrders[0];
            if (notificationStatus === "granted") {
              new Notification("New order received", {
                body: `${formatMoney(latest.total)} - ${
                  latest.fulfillment ?? "pickup"
                }`,
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
    } catch (fetchError) {
      setError((fetchError as Error).message ?? "Unable to load orders.");
    } finally {
      setLastPollAt(new Date());
      setLoadingOrders(false);
    }
  }, [activeStatus, alertsEnabled, notificationStatus, playBeep, user]);

  useEffect(() => {
    if (!user || roleLoading || role !== "admin") return;
    setLoadingOrders(true);
    fetchOrders();
    const interval = setInterval(fetchOrders, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchOrders, role, roleLoading, user]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!lastPollAt) {
        setPollStale(false);
        return;
      }
      const stale = Date.now() - lastPollAt.getTime() > STALE_AFTER_MS;
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

  useEffect(() => {
    if (!pendingAction) return;
    const timeout = setTimeout(() => {
      setPendingAction(null);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [pendingAction]);

  const performMutation = useCallback(
    async ({
      orderId,
      payload,
      successMessage,
    }: {
      orderId: string;
      payload: MutationPayload;
      successMessage: string;
    }) => {
      if (!user) return false;

      setUpdatingId(orderId);
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/admin/orders/${orderId}/status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error ?? "Unable to update order.");
        }

        toast.success(successMessage);
        await fetchOrders();
        return true;
      } catch (mutationError) {
        toast.error((mutationError as Error).message ?? "Unable to update order.");
        return false;
      } finally {
        setUpdatingId(null);
        setPendingAction(null);
      }
    },
    [fetchOrders, user]
  );

  const handlePrimaryAction = useCallback(
    async (order: OrderRecord) => {
      const primaryAction = getPrimaryAction(order);
      if (!primaryAction) return;

      const needsConfirmation =
        primaryAction.nextStatus === ADMIN_ORDER_STATUSES.COMPLETED;
      const actionKey = `status:${primaryAction.nextStatus}`;

      if (
        needsConfirmation &&
        !(
          pendingAction?.orderId === order.id &&
          pendingAction.action === actionKey
        )
      ) {
        setPendingAction({ orderId: order.id, action: actionKey });
        return;
      }

      await performMutation({
        orderId: order.id,
        payload: { status: primaryAction.nextStatus },
        successMessage: primaryAction.label,
      });
    },
    [pendingAction, performMutation]
  );

  const handleRefundAction = useCallback(
    async (order: OrderRecord, refundStatus: OrderRefundStatus) => {
      const needsConfirmation = refundStatus === "refunded";
      const actionKey = `refund:${refundStatus}`;

      if (
        needsConfirmation &&
        !(
          pendingAction?.orderId === order.id &&
          pendingAction.action === actionKey
        )
      ) {
        setPendingAction({ orderId: order.id, action: actionKey });
        return;
      }

      await performMutation({
        orderId: order.id,
        payload: {
          refundStatus,
          refundNote:
            refundStatus === "manual_pending"
              ? "Refund pending review"
              : "Refund completed",
        },
        successMessage:
          refundStatus === "manual_pending"
            ? "Refund marked pending"
            : "Refund marked complete",
      });
    },
    [pendingAction, performMutation]
  );

  const handleHandoffVerificationAction = useCallback(
    async (
      order: OrderRecord,
      handoffVerification: {
        idChecked: boolean;
        signatureCollected?: boolean;
        note?: string;
      },
      successMessage: string
    ) => {
      await performMutation({
        orderId: order.id,
        payload: {
          handoffVerification,
        },
        successMessage,
      });
    },
    [performMutation]
  );

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;

    if (!cancelReason.trim()) {
      setCancelError("Please provide a cancellation reason.");
      return;
    }

    setCancelError(null);
    const success = await performMutation({
      orderId: cancelTarget.id,
      payload: {
        status: ADMIN_ORDER_STATUSES.CANCELLED,
        reason: cancelReason.trim(),
      },
      successMessage: "Order cancelled",
    });

    if (success) {
      setCancelTarget(null);
      setCancelReason("");
      setCancelPreset("");
    }
  };

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (
        !matchesNotificationHealthFilter(
          order,
          notificationFilter
        )
      ) {
        return false;
      }

      if (!term) return true;
      const customer = getCustomerDisplay(order);
      return (
        order.id.toLowerCase().includes(term) ||
        (order.orderId ?? "").toLowerCase().includes(term) ||
        customer.phone.toLowerCase().includes(term) ||
        customer.email.toLowerCase().includes(term)
      );
    });
  }, [notificationFilter, orders, search]);

  const notificationSummary = useMemo(() => {
    const summary = summarizeNotificationHealth(orders);
    return summary;
  }, [orders]);

  const activeMobileOrder = useMemo(() => {
    if (!expandedOrderId) return null;
    return filteredOrders.find((order) => order.id === expandedOrderId) ?? null;
  }, [expandedOrderId, filteredOrders]);

  const showMobileActionBar = useMemo(() => {
    if (!activeMobileOrder) return false;
    const refundActions = getRefundActions(activeMobileOrder);
    const requiresHandoff = requiresAlcoholHandoffVerification(activeMobileOrder);
    return Boolean(
      getPrimaryAction(activeMobileOrder) ||
        canCancelOrder(activeMobileOrder) ||
        requiresHandoff ||
        refundActions.canMarkPending ||
        refundActions.canMarkRefunded
    );
  }, [activeMobileOrder]);

  const handleCardToggle = useCallback(
    (event: MouseEvent<HTMLDivElement>, orderId: string) => {
      if (typeof window === "undefined" || window.innerWidth >= 640) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, a, textarea, input, label")) return;
      setExpandedOrderId((current) => (current === orderId ? null : orderId));
      setPendingAction(null);
    },
    []
  );

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

  const handlePrint = useCallback((orderId: string) => {
    if (typeof window === "undefined") return;
    setExpandedOrderId(orderId);
    setPrintOrderId(orderId);
    window.setTimeout(() => window.print(), 100);
  }, []);

  const handleResendNotification = useCallback(
    async (orderId: string, eventKey: NotificationEventKey) => {
      if (!user) return;

      const resendKey = `${orderId}:${eventKey}`;
      setResendingKey(resendKey);
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/admin/orders/${orderId}/notifications`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ eventKey }),
        });

        const payload = (await response.json()) as { error?: string; status?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to resend notification.");
        }

        toast.success(
          payload.status === "skipped_duplicate"
            ? "Notification already recorded for this event."
            : "Notification sent."
        );
        await fetchOrders();
      } catch (resendError) {
        toast.error(
          (resendError as Error).message ?? "Unable to resend notification."
        );
      } finally {
        setResendingKey(null);
      }
    },
    [fetchOrders, user]
  );

  const handleResendFirstMissed = useCallback(
    async (order: OrderRecord) => {
      const missedEventKey = getFirstMissedNotificationCandidate(order);
      if (!missedEventKey) {
        toast.error("No missed notification candidate for this order.");
        return;
      }
      await handleResendNotification(order.id, missedEventKey);
    },
    [handleResendNotification]
  );

  if (loading || roleLoading) {
    return <Card className="p-6 text-sm text-zinc-600">Loading admin view...</Card>;
  }

  if (!user || role !== "admin") {
    return <Card className="p-6 text-sm text-zinc-600">Not authorized.</Card>;
  }

  return (
    <div className={`space-y-6 ${showMobileActionBar ? "pb-28 sm:pb-0" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-zinc-900">Admin Orders</h1>
            <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">
              Admin Mode
            </span>
          </div>
          <p className="text-sm text-zinc-600">Live queue for staff processing.</p>
        </div>
        <div className="space-y-1 text-right text-xs text-zinc-500">
          <p>Polling every 15s</p>
          <p>Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "-"}</p>
        </div>
      </div>

      <Card className="space-y-4 print:hidden">
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
              {ADMIN_STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search by order id or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="flex items-center gap-1 rounded-full border border-zinc-200 p-1">
            {NOTIFICATION_FILTER_OPTIONS.map((option) => {
              const active = notificationFilter === option.value;
              const count =
                option.value === "all"
                  ? notificationSummary.all
                  : option.value === "needs_attention"
                    ? notificationSummary.needsAttention
                    : option.value === "failed"
                      ? notificationSummary.failed
                      : notificationSummary.missed;
              const activeClass =
                option.value === "failed"
                  ? "bg-red-600 text-white"
                  : option.value === "needs_attention" || option.value === "missed"
                    ? "bg-amber-500 text-white"
                    : "bg-zinc-900 text-white";

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNotificationFilter(option.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active ? activeClass : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {option.label} ({count})
                </button>
              );
            })}
          </div>
          <Button variant="outline" onClick={enableAlerts} disabled={alertsEnabled}>
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
            onClick={() => setAlertsMuted((current) => !current)}
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
        <Card className="border-red-200 bg-red-50 text-sm text-red-700 print:hidden">
          Updates paused - refresh tab.
        </Card>
      ) : null}

      {loadingOrders ? (
        <Card className="p-6 text-sm text-zinc-600">Loading orders...</Card>
      ) : null}

      {error ? <Card className="p-6 text-sm text-red-600">{error}</Card> : null}

      {!loadingOrders && filteredOrders.length === 0 ? (
        <Card className="p-6 text-sm text-zinc-600">
          No orders found for this status.
        </Card>
      ) : null}

      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const normalizedStatus = getNormalizedStatus(order);
          const createdAt = parseDate(order.createdAt);
          const staleState = getOrderStaleState(order);
          const customer = getCustomerDisplay(order);
          const isExpanded = expandedOrderId === order.id;
          const primaryAction = getPrimaryAction(order);
          const canCancel = canCancelOrder(order);
          const refundActions = getRefundActions(order);
          const deliveryAddress =
            order.fulfillment === "delivery" ? order.delivery?.address : null;
          const phoneHref =
            customer.phone && customer.phone !== "-" ? `tel:${customer.phone}` : "";
          const mapHref = deliveryAddress
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                deliveryAddress
              )}`
            : "";
          const showItems = isExpanded;
          const pendingStatusKey = primaryAction
            ? `status:${primaryAction.nextStatus}`
            : "";
          const pendingRefundKey = "refund:refunded";
          const isPendingConfirmation =
            pendingAction?.orderId === order.id ? pendingAction.action : null;
          const historyEntries = [...(order.adminHistory ?? [])]
            .reverse()
            .slice(0, 5);
          const notificationEvents = getRelevantNotificationEvents(order);
          const missedNotificationCandidates = getMissedNotificationCandidates(order);
          const hasNotificationFailures = hasNotificationFailure(order);
          const requiresNotificationAttention = hasNotificationAttention(order);
          const firstMissedNotificationEvent =
            getFirstMissedNotificationCandidate(order);
          const refundReconciliationView = getRefundReconciliationView(order);
          const handoffVerification = order.handoffVerification;
          const handoffWarning = getHandoffVerificationWarning(order);
          const handoffVerifiedBy =
            handoffVerification?.verifiedByEmail ??
            handoffVerification?.verifiedByUid ??
            null;
          const handoffVerifiedAt = handoffVerification?.verifiedAt;
          const completionBlockedByHandoff =
            primaryAction?.nextStatus === ADMIN_ORDER_STATUSES.COMPLETED &&
            requiresAlcoholHandoffVerification(order) &&
            !handoffVerification?.idChecked;

          return (
            <Card
              key={order.id}
              className={`${printOrderId && printOrderId !== order.id ? "print:hidden" : ""} ${
                isExpanded ? "ring-1 ring-zinc-200" : ""
              } cursor-pointer sm:cursor-default print:cursor-default print:border-0 print:p-0 print:shadow-none print:ring-0`}
              onClick={(event) => handleCardToggle(event, order.id)}
            >
              <div className="hidden border-b border-zinc-200 pb-4 print:block">
                <p className="text-lg font-semibold text-zinc-900">
                  Vailsburg Wine & Liquor
                </p>
                <p className="text-sm text-zinc-500">Order fulfillment sheet</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {normalizedStatus === ADMIN_ORDER_STATUSES.PENDING_STORE &&
                    createdAt &&
                    Date.now() - createdAt.getTime() < NEW_PULSE_MS ? (
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse print:hidden" />
                    ) : null}
                    <span>Order #{orderNumberFromId(order.id)}</span>
                    {staleState.isStale ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Delayed
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-zinc-900">
                      {customer.name}
                    </h3>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold capitalize text-zinc-700">
                      {order.fulfillment ?? "pickup"}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        STATUS_STYLES[normalizedStatus]
                      }`}
                    >
                      {ADMIN_STATUS_LABELS[normalizedStatus]}
                    </span>
                    {order.refundStatus ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                        Refund: {order.refundStatus.replace("_", " ")}
                      </span>
                    ) : null}
                    {refundReconciliationView ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold print:hidden ${refundReconciliationView.badge.toneClass}`}
                      >
                        {refundReconciliationView.badge.title}
                      </span>
                    ) : null}
                    {requiresAlcoholHandoffVerification(order) ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getHandoffVerificationBadge(order).className}`}
                      >
                        {getHandoffVerificationBadge(order).label}
                      </span>
                    ) : null}
                    {hasNotificationFailures ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 print:hidden">
                        Notification failed
                      </span>
                    ) : requiresNotificationAttention ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 print:hidden">
                        Notification attention
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-zinc-500">
                    {formatDateTime(order.createdAt)} | {formatTimeAgo(createdAt)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <p className="text-lg font-semibold text-zinc-900">
                    {formatMoney(order.total)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Payment: {isPaidOrder(order) ? "Paid" : "Pending"}
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
                  <p>Tax {formatMoney(order.tax)} | Tip {formatMoney(order.tip)}</p>
                  <p>Fulfillment status: {ADMIN_STATUS_LABELS[normalizedStatus]}</p>
                  <p>Age verification: {order.ageVerified ? "21+ confirmed" : "Pending"}</p>
                </div>
              </div>

              {!showItems && (order.items?.length ?? 0) > 0 ? (
                <p className="text-xs text-zinc-500 sm:hidden">
                  Tap to view {(order.items ?? []).length} item
                  {(order.items ?? []).length === 1 ? "" : "s"}.
                </p>
              ) : null}

              <div className={`${showItems ? "block" : "hidden sm:block"} space-y-2`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-900">Items</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="print:hidden"
                    onClick={() => handlePrint(order.id)}
                  >
                    Print order
                  </Button>
                </div>
                {(order.items ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500">No items found.</p>
                ) : (
                  <div className="space-y-2 text-sm text-zinc-700">
                    {(order.items ?? []).map((item) => (
                      <div
                        key={`${order.id}-${item.productId}`}
                        className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-b-0 last:pb-0"
                      >
                        <span>
                          <span className="font-semibold">{item.qty}x</span> {item.name}
                        </span>
                        <span>{formatMoney(item.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${showItems ? "block" : "hidden sm:block"} space-y-2 text-sm text-zinc-600`}>
                <p>Order notes: {order.statusNote ?? "-"}</p>
                {order.deliveryInstructions ? (
                  <p>Delivery instructions: {order.deliveryInstructions}</p>
                ) : null}
                {requiresAlcoholHandoffVerification(order) ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-zinc-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Handoff verification
                    </p>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      <p>
                        ID checked:{" "}
                        <span className="font-medium text-zinc-900">
                          {handoffVerification?.idChecked ? "Yes" : "No"}
                        </span>
                      </p>
                      <p>
                        Signature collected:{" "}
                        <span className="font-medium text-zinc-900">
                          {order.fulfillment === "delivery"
                            ? handoffVerification?.signatureCollected
                              ? "Yes"
                              : "No"
                            : "Not required"}
                        </span>
                      </p>
                      <p>
                        Verified by:{" "}
                        <span className="font-medium text-zinc-900">
                          {handoffVerifiedBy ?? "Not recorded"}
                        </span>
                      </p>
                      <p>
                        Verified at:{" "}
                        <span className="font-medium text-zinc-900">
                          {handoffVerifiedAt
                            ? formatDateTime(handoffVerifiedAt)
                            : "Not recorded"}
                        </span>
                      </p>
                    </div>
                    {handoffVerification?.note ? (
                      <p className="mt-2 text-xs text-zinc-600">
                        Note: {handoffVerification.note}
                      </p>
                    ) : null}
                    {handoffWarning ? (
                      <p className="mt-2 text-xs font-medium text-amber-700">
                        {handoffWarning}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                      {!handoffVerification?.idChecked ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void handleHandoffVerificationAction(
                              order,
                              buildHandoffVerificationPayload(
                                order,
                                { idChecked: true },
                                order.fulfillment === "delivery"
                                  ? "ID checked at delivery handoff."
                                  : "ID checked at pickup handoff."
                              ),
                              "ID checked"
                            )
                          }
                          disabled={updatingId === order.id}
                        >
                          Mark ID checked
                        </Button>
                      ) : null}
                      {order.fulfillment === "delivery" &&
                      handoffVerification?.idChecked &&
                      !handoffVerification?.signatureCollected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void handleHandoffVerificationAction(
                              order,
                              buildHandoffVerificationPayload(
                                order,
                                {
                                  idChecked: true,
                                  signatureCollected: true,
                                },
                                "Signature collected at delivery handoff."
                              ),
                              "Signature collected"
                            )
                          }
                          disabled={updatingId === order.id}
                        >
                          Mark signature collected
                        </Button>
                      ) : null}
                      {order.fulfillment === "delivery" &&
                      (!handoffVerification?.idChecked ||
                        !handoffVerification?.signatureCollected) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void handleHandoffVerificationAction(
                              order,
                              buildHandoffVerificationPayload(
                                order,
                                {
                                  idChecked: true,
                                  signatureCollected:
                                    order.fulfillment === "delivery",
                                },
                                order.fulfillment === "delivery"
                                  ? "ID checked and signature captured at delivery."
                                  : "ID checked at pickup handoff."
                              ),
                              "Handoff verification completed"
                            )
                          }
                          disabled={updatingId === order.id}
                        >
                          Complete handoff verification
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {order.notifications?.emailLastError || order.alerts?.emailLastError ? (
                  <p className="font-medium text-red-600 print:hidden">
                    Notification issue:{" "}
                    {order.notifications?.emailLastError ??
                      order.alerts?.emailLastError}
                  </p>
                ) : null}
                {order.cancellationReason ? (
                  <p className="text-red-600">Cancel reason: {order.cancellationReason}</p>
                ) : null}
                {order.refundNote ? <p>Refund note: {order.refundNote}</p> : null}
                {refundReconciliationView ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-zinc-800 print:hidden">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Refund reconciliation
                    </p>
                    <p className="text-sm">{refundReconciliationView.details.description}</p>
                    {refundReconciliationView.details.stripeInfo ? (
                      <p className="text-xs text-zinc-600">
                        Stripe: {refundReconciliationView.details.stripeInfo}
                      </p>
                    ) : null}
                    {refundReconciliationView.details.amountInfo ? (
                      <p className="text-xs text-zinc-600">
                        {refundReconciliationView.details.amountInfo}
                      </p>
                    ) : null}
                    {refundReconciliationView.details.errorInfo ? (
                      <p className="text-xs font-medium text-red-600">
                        Stripe error: {refundReconciliationView.details.errorInfo}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {firstMissedNotificationEvent ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 print:hidden">
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      Recovery suggested
                    </p>
                    <p className="text-sm">
                      Missed{" "}
                      {getNotificationEventLabel(
                        firstMissedNotificationEvent,
                        order.fulfillment ?? "pickup"
                      )}
                      . Resend to recover customer messaging.
                    </p>
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleResendFirstMissed(order)}
                        disabled={
                          resendingKey ===
                          `${order.id}:${firstMissedNotificationEvent}`
                        }
                      >
                        {resendingKey ===
                        `${order.id}:${firstMissedNotificationEvent}`
                          ? "Resending missed..."
                          : "Resend missed now"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {historyEntries.length > 0 ? (
                <div className={`${showItems ? "block" : "hidden sm:block"} space-y-2 print:hidden`}>
                  <p className="text-sm font-semibold text-zinc-900">Audit trail</p>
                  <div className="space-y-2 text-xs text-zinc-600">
                    {historyEntries.map((entry, index) => (
                      <div
                        key={`${order.id}-${index}-${String(entry.at)}`}
                        className="rounded-2xl bg-zinc-50 px-3 py-2"
                      >
                        <p className="font-medium text-zinc-800">
                          {getHistoryLabel(entry)}
                        </p>
                        <p>
                          {formatDateTime(entry.at)} - {entry.actorEmail ?? entry.actorUid}
                        </p>
                        {entry.reason ? <p>Reason: {entry.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={`${showItems ? "block" : "hidden sm:block"} space-y-2 print:hidden`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-900">
                    Notifications
                  </p>
                  {firstMissedNotificationEvent ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Missed candidate
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2 text-xs text-zinc-600">
                  {notificationEvents.map((eventKey) => {
                    const notificationState = getNotificationState(
                      order.notifications,
                      eventKey
                    );
                    const sentAt = getNotificationSentAt(order.notifications, eventKey);
                    const resendKey = `${order.id}:${eventKey}`;
                    const isMissed = missedNotificationCandidates.includes(eventKey);

                    const statusLabel = sentAt
                      ? "Sent"
                      : notificationState?.lastStatus === "failed"
                        ? "Failed"
                        : notificationState?.lastStatus === "skipped_duplicate"
                          ? "Skipped duplicate"
                          : isMissed
                            ? "Missed candidate"
                            : "Not sent";

                    return (
                      <div
                        key={`${order.id}-${eventKey}`}
                        className="rounded-2xl bg-zinc-50 px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-zinc-800">
                              {getNotificationEventLabel(
                                eventKey,
                                order.fulfillment ?? "pickup"
                              )}
                            </p>
                            <p>
                              {statusLabel}
                              {sentAt ? ` - ${formatDateTime(sentAt)}` : ""}
                            </p>
                            {notificationState?.lastError ? (
                              <p className="text-red-600">
                                Last error: {notificationState.lastError}
                              </p>
                            ) : null}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void handleResendNotification(order.id, eventKey)
                            }
                            disabled={resendingKey === resendKey}
                          >
                            {resendingKey === resendKey
                              ? "Resending..."
                              : "Resend"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="hidden flex-wrap gap-2 sm:flex print:hidden">
                {primaryAction ? (
                  <Button
                    onClick={() => void handlePrimaryAction(order)}
                    disabled={updatingId === order.id || completionBlockedByHandoff}
                  >
                    {completionBlockedByHandoff
                      ? "Verify ID before completing"
                      : isPendingConfirmation === pendingStatusKey &&
                          primaryAction.nextStatus ===
                            ADMIN_ORDER_STATUSES.COMPLETED
                        ? "Confirm completed"
                        : primaryAction.label}
                  </Button>
                ) : null}

                {canCancel ? (
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
                    Cancel order
                  </Button>
                ) : null}

                {refundActions.canMarkPending ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleRefundAction(order, "manual_pending")}
                    disabled={updatingId === order.id}
                  >
                    Mark refund pending
                  </Button>
                ) : null}

                {refundActions.canMarkRefunded ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleRefundAction(order, "refunded")}
                    disabled={updatingId === order.id}
                  >
                    {isPendingConfirmation === pendingRefundKey
                      ? "Confirm refunded"
                      : "Mark refunded"}
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {showMobileActionBar && activeMobileOrder ? (() => {
        const primaryAction = getPrimaryAction(activeMobileOrder);
        const canCancel = canCancelOrder(activeMobileOrder);
        const refundActions = getRefundActions(activeMobileOrder);
        const requiresHandoff = requiresAlcoholHandoffVerification(activeMobileOrder);
        const handoffPending = !activeMobileOrder.handoffVerification?.idChecked;
        const handoffSignaturePending =
          activeMobileOrder.fulfillment === "delivery" &&
          !activeMobileOrder.handoffVerification?.signatureCollected;
        const completionBlockedByHandoff =
          primaryAction?.nextStatus === ADMIN_ORDER_STATUSES.COMPLETED &&
          requiresHandoff &&
          !activeMobileOrder.handoffVerification?.idChecked;
        const normalizedStatus = getNormalizedStatus(activeMobileOrder);
        const pendingStatusKey = primaryAction
          ? `status:${primaryAction.nextStatus}`
          : "";
        const pendingRefundKey = "refund:refunded";

        if (
          !primaryAction &&
          !canCancel &&
          !(requiresHandoff && handoffPending) &&
          !refundActions.canMarkPending &&
          !refundActions.canMarkRefunded
        ) {
          return null;
        }

        return (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white p-3 sm:hidden print:hidden">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
              <span>Order #{orderNumberFromId(activeMobileOrder.id)}</span>
              <span>{ADMIN_STATUS_LABELS[normalizedStatus]}</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {primaryAction ? (
                <Button
                  onClick={() => void handlePrimaryAction(activeMobileOrder)}
                  disabled={
                    updatingId === activeMobileOrder.id || completionBlockedByHandoff
                  }
                >
                  {completionBlockedByHandoff
                    ? "Verify ID before completing"
                    : pendingAction?.orderId === activeMobileOrder.id &&
                        pendingAction.action === pendingStatusKey &&
                        primaryAction.nextStatus ===
                          ADMIN_ORDER_STATUSES.COMPLETED
                      ? "Tap again to confirm"
                      : primaryAction.label}
                </Button>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                {canCancel ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCancelTarget(activeMobileOrder);
                      setCancelReason("");
                      setCancelPreset("");
                      setCancelError(null);
                    }}
                    disabled={updatingId === activeMobileOrder.id}
                  >
                    Cancel order
                  </Button>
                ) : null}

                {requiresHandoff && handoffPending ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void handleHandoffVerificationAction(
                        activeMobileOrder,
                        buildHandoffVerificationPayload(
                          activeMobileOrder,
                          {
                            idChecked: true,
                            signatureCollected:
                              activeMobileOrder.fulfillment === "delivery",
                          },
                          activeMobileOrder.fulfillment === "delivery"
                            ? "ID checked and signature captured at delivery."
                            : "ID checked at pickup handoff."
                        ),
                        activeMobileOrder.fulfillment === "delivery"
                          ? "Complete handoff verification"
                          : "ID checked"
                      )
                    }
                    disabled={updatingId === activeMobileOrder.id}
                  >
                    {activeMobileOrder.fulfillment === "delivery"
                      ? "Complete handoff"
                      : "Mark ID checked"}
                  </Button>
                ) : null}

                {requiresHandoff &&
                !handoffPending &&
                handoffSignaturePending ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void handleHandoffVerificationAction(
                        activeMobileOrder,
                        buildHandoffVerificationPayload(
                          activeMobileOrder,
                          {
                            idChecked: true,
                            signatureCollected: true,
                          },
                          "Signature collected at delivery handoff."
                        ),
                        "Signature collected"
                      )
                    }
                    disabled={updatingId === activeMobileOrder.id}
                  >
                    Mark signature
                  </Button>
                ) : null}

                {refundActions.canMarkPending ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleRefundAction(activeMobileOrder, "manual_pending")}
                    disabled={updatingId === activeMobileOrder.id}
                  >
                    Refund pending
                  </Button>
                ) : null}

                {refundActions.canMarkRefunded ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleRefundAction(activeMobileOrder, "refunded")}
                    disabled={updatingId === activeMobileOrder.id}
                  >
                    {pendingAction?.orderId === activeMobileOrder.id &&
                    pendingAction.action === pendingRefundKey
                      ? "Confirm refund"
                      : "Mark refunded"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })() : null}

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-zinc-900">Cancel order</h3>
              <p className="text-sm text-zinc-600">
                Choose a reason for cancelling order #{orderNumberFromId(cancelTarget.id)}.
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-zinc-900">Reason</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CANCEL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setCancelPreset(preset);
                      setCancelReason(preset === "Other" ? "" : preset);
                    }}
                    className={`rounded-full border px-3 py-2 text-left text-xs font-semibold transition ${
                      cancelPreset === preset
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {cancelPreset === "Other" ? (
              <textarea
                className="mt-3 h-24 w-full rounded-2xl border border-zinc-200 p-3 text-sm text-zinc-700"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Cancellation reason"
              />
            ) : null}

            {cancelError ? <p className="mt-2 text-xs text-red-600">{cancelError}</p> : null}

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
                onClick={() => void handleCancelConfirm()}
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
