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
  statusNote?: string | null;
  notifications?: OrderNotifications | null;
  fulfillmentStatus?: string | null;
  stripe?: {
    paymentIntentId?: string | null;
    checkoutSessionId?: string | null;
  } | null;
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
