import type { Timestamp } from "firebase-admin/firestore";

export const INVENTORY_RESERVATION_MINUTES = Math.max(
  5,
  Number.parseInt(process.env.CHECKOUT_RESERVATION_MINUTES ?? "20", 10) || 20
);

export type TimestampLike =
  | Timestamp
  | Date
  | {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    }
  | null
  | undefined;

export type ReservableProductSnapshot = {
  stock?: number;
  reservedStock?: number;
};

export type ReservableOrderItem = {
  productId: string;
  qty: number;
};

export type ReservationBackedOrder = {
  status?: string | null;
  inventoryReservationActive?: boolean | null;
  reservationExpiresAt?: TimestampLike;
  items?: ReservableOrderItem[] | null;
};

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getReservedStock(product: ReservableProductSnapshot) {
  return Math.max(0, Math.floor(toFiniteNumber(product.reservedStock)));
}

export function getAvailableStock(product: ReservableProductSnapshot) {
  const stock = Math.max(0, Math.floor(toFiniteNumber(product.stock)));
  return Math.max(stock - getReservedStock(product), 0);
}

export function buildReservationExpiry(now = new Date()) {
  return new Date(now.getTime() + INVENTORY_RESERVATION_MINUTES * 60_000);
}

export function toDate(value: TimestampLike) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (
    typeof value === "object" &&
    typeof value.seconds === "number" &&
    typeof value.nanoseconds === "number"
  ) {
    return new Date(value.seconds * 1000 + Math.floor(value.nanoseconds / 1_000_000));
  }
  return null;
}

export function isReservationExpired(order: ReservationBackedOrder, now = new Date()) {
  if (order.inventoryReservationActive !== true) return false;
  const expiresAt = toDate(order.reservationExpiresAt);
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}

export function applyReservedStock(currentReservedStock: number, qtyDelta: number) {
  return Math.max(0, currentReservedStock + qtyDelta);
}

export function buildReservationReleaseStock(currentReservedStock: number, qty: number) {
  return applyReservedStock(currentReservedStock, -Math.max(0, Math.floor(qty)));
}
