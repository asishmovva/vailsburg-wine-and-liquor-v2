export type SypramOrderItem = {
  sku?: string;
  upc?: string;
  quantity: number;
  unitPrice: number;
  description?: string;
};

export type SypramCustomerInfo = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type SypramOrderInfo = {
  orderId: string;
  fulfillment: "delivery" | "pickup";
  subtotal: number;
  tax: number;
  total: number;
  deliveryFee: number;
  tip: number;
  taxableSubtotal?: number;
  address?: string | null;
};

export type SypramOrderPayload = {
  customerInfo: SypramCustomerInfo;
  orderInfo: SypramOrderInfo;
  items: SypramOrderItem[];
  idempotencyKey?: string;
};

export type SypramOrderResponse = {
  StatusVal?: boolean;
  StatusMsg?: string;
  posOrderId?: string;
  POSOrderId?: string;
  receiptNo?: string;
  ReceiptNo?: string;
};
