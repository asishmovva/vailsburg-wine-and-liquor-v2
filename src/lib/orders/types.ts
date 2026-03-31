export type OrderFulfillment = "delivery" | "pickup";

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
  pos?: {
    pushStatus?: string | null;
  } | null;
};

export type OrderListRecord = {
  orderId: string;
  status?: string;
  total?: number;
  fulfillment?: OrderFulfillment;
  createdAt?: unknown;
  updatedAt?: unknown;
  items?: OrderItem[];
};
