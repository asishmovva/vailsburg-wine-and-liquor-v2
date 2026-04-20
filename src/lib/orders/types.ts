export type OrderFulfillment = "delivery" | "pickup";

export type OrderStatusTone =
  | "success"
  | "warning"
  | "neutral"
  | "destructive"
  | "info";

export type CustomerStatusView = {
  key: string;
  label: string;
  tone: OrderStatusTone;
  hint: string;
};

export type OrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
  category?: string;
};

export type DeliveryInfo = {
  address: string;
  miles?: number;
  eligible?: boolean;
};

export type OrderCustomer = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type OrderNotifications = {
  orderReceivedSentAt?: unknown;
  readySentAt?: unknown;
  outForDeliverySentAt?: unknown;
  cancelledSentAt?: unknown;
  emailLastError?: string | null;
};

export type OrderRefundStatus =
  | "not_requested"
  | "requested"
  | "manual_pending"
  | "refunded";

export type OrderAdminHistoryEntry = {
  at?: unknown;
  actorUid: string;
  actorEmail?: string | null;
  action: "status_change" | "cancel" | "refund_marked" | "note_added";
  from?: string | null;
  to?: string | null;
  reason?: string | null;
};

export type OrderRecord = {
  id: string;
  orderId?: string;
  status?: string;
  normalizedStatus?: string;
  customerStatus?: CustomerStatusView | null;
  paymentMethodLabel?: string | null;
  fulfillment: OrderFulfillment;
  delivery?: DeliveryInfo | null;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  tip: number;
  tax: number;
  total: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  paidAt?: unknown;
  email?: string | null;
  phone?: string | null;
  customer?: OrderCustomer | null;
  cancellationReason?: string | null;
  cancelReason?: string | null;
  cancelledAt?: unknown;
  cancelledBy?: string | null;
  statusNote?: string | null;
  notifications?: OrderNotifications | null;
  fulfillmentStatus?: string | null;
  stripe?: {
    paymentIntentId?: string | null;
    checkoutSessionId?: string | null;
  } | null;
  refundStatus?: OrderRefundStatus | null;
  refundNote?: string | null;
  refundedAt?: unknown;
  adminHistory?: OrderAdminHistoryEntry[] | null;
  paid?: boolean;
  pos?: {
    pushStatus?: string | null;
  } | null;
};

export type OrderListRecord = {
  id?: string;
  orderId: string;
  status?: string;
  normalizedStatus?: string;
  customerStatus?: CustomerStatusView | null;
  paymentMethodLabel?: string | null;
  total?: number;
  fulfillment?: OrderFulfillment;
  createdAt?: unknown;
  updatedAt?: unknown;
  items?: OrderItem[];
};
