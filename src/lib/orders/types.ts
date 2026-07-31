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
  lineItemId?: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
  category?: string;
  size?: string;
  pack?: string;
  fulfillmentStatus?:
    | "pending"
    | "fulfilled"
    | "unavailable"
    | "replaced"
    | "refund_pending"
    | "refunded";
  exceptionReason?: string | null;
  replacement?: {
    productId: string;
    name: string;
    price: number;
    size?: string;
    pack?: string;
    qty: number;
    image?: string | null;
    category?: string;
  } | null;
  refund?: {
    amount: number;
    status: "pending" | "completed";
    note?: string | null;
    markedAt?: unknown;
    markedBy?: string | null;
  } | null;
};

export type DeliveryInfo = {
  address: string;
  miles?: number;
  eligible?: boolean;
  lat?: number;
  lng?: number;
  placeId?: string | null;
  instructions?: string | null;
};

export type OrderCustomer = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type OrderNotificationSendStatus =
  | "sent"
  | "failed"
  | "skipped_duplicate";

export type OrderNotificationStateRecord = {
  sentAt?: unknown;
  provider?: string | null;
  messageId?: string | null;
  lastStatus?: OrderNotificationSendStatus | null;
  lastError?: string | null;
  lastAttemptAt?: unknown;
  lastManualResendAt?: unknown;
  lastManualProvider?: string | null;
  lastManualMessageId?: string | null;
  resendCount?: number;
};

export type OrderNotifications = {
  orderReceived?: OrderNotificationStateRecord | null;
  paymentConfirmed?: OrderNotificationStateRecord | null;
  orderUpdated?: OrderNotificationStateRecord | null;
  readyForPickup?: OrderNotificationStateRecord | null;
  outForDelivery?: OrderNotificationStateRecord | null;
  completed?: OrderNotificationStateRecord | null;
  cancelled?: OrderNotificationStateRecord | null;
  refundMarked?: OrderNotificationStateRecord | null;
  adminNewOrderAlert?: OrderNotificationStateRecord | null;
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

export type RefundReconciliationState =
  | "not_checked"
  | "not_marked_refunded"
  | "stripe_refunded"
  | "manual_marked_without_stripe_refund"
  | "manual_marked_without_payment_intent"
  | "stripe_check_failed";

export type OrderRefundReconciliation = {
  state: RefundReconciliationState;
  manualStatus?: OrderRefundStatus | null;
  manualMarkedRefundedAt?: unknown;
  manualMarkedByUid?: string | null;
  manualMarkedByEmail?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  stripeAmountRefunded?: number | null;
  stripeAmountCaptured?: number | null;
  stripeCurrency?: string | null;
  stripeRefundCount?: number | null;
  stripeRefundIds?: string[];
  stripeLastCheckedAt?: unknown;
  stripeLastError?: string | null;
};

export type OrderHandoffVerification = {
  idChecked: boolean;
  signatureCollected?: boolean;
  note?: string | null;
  verifiedAt?: unknown;
  verifiedByUid?: string | null;
  verifiedByEmail?: string | null;
};

export type OrderAdminHistoryEntry = {
  at?: unknown;
  actorUid: string;
  actorEmail?: string | null;
  action:
    | "status_change"
    | "cancel"
    | "refund_marked"
    | "note_added"
    | "handoff_verified"
    | "item_marked_unavailable"
    | "item_replaced"
    | "partial_refund_marked_pending"
    | "partial_refund_marked_completed";
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  itemName?: string | null;
  productId?: string | null;
  lineItemId?: string | null;
  replacementProductId?: string | null;
  replacementName?: string | null;
  amount?: number | null;
  note?: string | null;
};

export type OrderInventoryException = {
  hasException: boolean;
  status: "open" | "resolved";
  summary?: string | null;
  updatedAt?: unknown;
  updatedBy?: string | null;
};

export type OrderAdjustments = {
  refundPendingTotal?: number;
  refundCompletedTotal?: number;
  replacementDifference?: number;
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
  deliveryInstructions?: string | null;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  tip: number;
  tax: number;
  total: number;
  ageVerified?: boolean;
  checkoutAttemptKey?: string | null;
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
  alerts?: {
    emailSentAt?: unknown;
    emailLastError?: string | null;
  } | null;
  refundStatus?: OrderRefundStatus | null;
  refundNote?: string | null;
  refundedAt?: unknown;
  refundReconciliation?: OrderRefundReconciliation | null;
  handoffVerification?: OrderHandoffVerification | null;
  inventoryException?: OrderInventoryException | null;
  adjustments?: OrderAdjustments | null;
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
