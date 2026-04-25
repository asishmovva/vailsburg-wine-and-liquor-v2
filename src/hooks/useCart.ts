"use client";

import { useEffect, useState } from "react";
import {
  addToCart,
  clearCart,
  getCartState,
  getTotalQty,
  initCartStore,
  removeFromCart,
  subscribe,
  updateCartQty,
  type AddToCartResult,
  type CartItemInput,
} from "@/services/cart";

export function useCart() {
  const [state, setState] = useState(getCartState());

  useEffect(() => {
    const sync = () => setState(getCartState());
    initCartStore();
    sync();
    const unsubscribe = subscribe(sync);
    sync();
    return unsubscribe;
  }, []);

  const totalQty = getTotalQty(state.items);

  const addItem = (input: CartItemInput): AddToCartResult => addToCart(input);
  const updateQty = (productId: string, qty: number, stock: number) =>
    updateCartQty(productId, qty, stock);
  const removeItem = (productId: string) => removeFromCart(productId);
  const clear = () => clearCart();

  return {
    ...state,
    totalQty,
    addItem,
    updateQty,
    removeItem,
    clear,
  };
}
