import type { CartItem } from "@/services/cart";

export type TotalsInput = {
  items: CartItem[];
  deliveryFee: number;
  tip: number;
};

export function calcSubtotal(items: CartItem[]) {
  return items.reduce((total, item) => total + item.price * item.qty, 0);
}

export function calcTotals({ items, deliveryFee, tip }: TotalsInput) {
  const subtotal = calcSubtotal(items);
  const total = subtotal + deliveryFee + tip;
  return {
    subtotal,
    deliveryFee,
    tip,
    total,
  };
}
