"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
  type Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type CartItem = {
  productId: string;
  qty: number;
  price: number;
  name: string;
  image: string;
  category: string;
  size: string;
  pack: string;
  stock: number;
  updatedAt: number;
};

export type CartState = {
  items: CartItem[];
  loading: boolean;
  error: string | null;
  mode: "guest" | "user";
};

export type CartItemInput = Omit<CartItem, "updatedAt" | "qty"> & { qty?: number };
export type AddToCartResult = "added" | "throttled" | "invalid";

type Listener = () => void;

const LOCAL_STORAGE_KEY = "vailsburg_cart_v1";
const UPDATE_DEBOUNCE_MS = 300;
const ADD_COOLDOWN_MS = 600;

const listeners = new Set<Listener>();
let initialized = false;
let currentUser: User | null = null;
let cartUnsubscribe: (() => void) | null = null;
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
const lastAddAt = new Map<string, number>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(next: Partial<CartState>) {
  state = { ...state, ...next };
  emit();
}

function safeParse(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readLocalCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(window.localStorage.getItem(LOCAL_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => ({
      productId: String(item.productId ?? ""),
      qty: Number(item.qty ?? 0),
      price: Number(item.price ?? 0),
      name: String(item.name ?? ""),
      image: String(item.image ?? ""),
      category: String(item.category ?? ""),
      size: String(item.size ?? ""),
      pack: String(item.pack ?? ""),
      stock: Number(item.stock ?? 0),
      updatedAt: Number(item.updatedAt ?? 0),
    }))
    .filter((item) => item.productId && item.qty > 0);
}

function writeLocalCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
}

function clearLocalCart() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_STORAGE_KEY);
}

const initialItems = typeof window !== "undefined" ? readLocalCart() : [];

let state: CartState = {
  items: initialItems,
  loading: true,
  error: null,
  mode: "guest",
};

function mapDocsToCart(snapshot: QuerySnapshot<DocumentData>) {
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Partial<CartItem> & {
      updatedAt?: Timestamp | null;
    };
    return {
      productId: docSnap.id,
      qty: Number(data.qty ?? 0),
      price: Number(data.price ?? 0),
      name: String(data.name ?? ""),
      image: String(data.image ?? ""),
      category: String(data.category ?? ""),
      size: String(data.size ?? ""),
      pack: String(data.pack ?? ""),
      stock: Number(data.stock ?? 0),
      updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
    } satisfies CartItem;
  });
}

async function mergeGuestCartToUser(userId: string) {
  if (!db) return;
  const guestItems = readLocalCart();
  if (guestItems.length === 0) return;

  const cartRef = collection(db, "users", userId, "cartItems");
  const existingSnap = await getDocs(cartRef);
  const existingItems = mapDocsToCart(existingSnap);

  const merged = new Map<string, CartItem>();

  existingItems.forEach((item) => merged.set(item.productId, item));

  guestItems.forEach((guest) => {
    const existing = merged.get(guest.productId);
    if (!existing) {
      merged.set(guest.productId, guest);
      return;
    }

    const updatedAt = Math.max(existing.updatedAt, guest.updatedAt);
    const base = existing.updatedAt >= guest.updatedAt ? existing : guest;
    const combinedQty = existing.qty + guest.qty;
    const maxQty = Math.max(base.stock, existing.stock, guest.stock);
    const qty = Math.min(combinedQty, maxQty);

    const mergedItem: CartItem = {
      ...base,
      qty,
      stock: maxQty,
      updatedAt,
    };

    if (mergedItem.qty > 0) {
      merged.set(guest.productId, mergedItem);
    }
  });

  const batch = writeBatch(db);
  merged.forEach((item) => {
    batch.set(doc(cartRef, item.productId), {
      ...item,
      qty: item.qty,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  clearLocalCart();
}

function handleCartSnapshot(userId: string) {
  if (!db) return;
  const cartRef = collection(db, "users", userId, "cartItems");
  cartUnsubscribe = onSnapshot(
    cartRef,
    (snapshot) => {
      const items = mapDocsToCart(snapshot);
      setState({ items, loading: false, mode: "user", error: null });
    },
    (error) => {
      setState({ error: error.message, loading: false });
    }
  );
}

function stopCartSnapshot() {
  if (cartUnsubscribe) {
    cartUnsubscribe();
    cartUnsubscribe = null;
  }
}

export function initCartStore() {
  if (initialized) return;
  initialized = true;

  if (!auth) {
    setState({ loading: false, items: [], mode: "guest" });
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (!user) {
      stopCartSnapshot();
      const nextItems = state.items.length ? state.items : readLocalCart();
      updateStateItems(nextItems, "guest");
      setState({ error: null });
      return;
    }

    setState({ loading: true, mode: "user", error: null });
    try {
      await mergeGuestCartToUser(user.uid);
    } catch (error) {
      setState({ error: (error as Error).message });
    }

    stopCartSnapshot();
    handleCartSnapshot(user.uid);
  });
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCartState() {
  return state;
}

function updateStateItems(items: CartItem[], mode: "guest" | "user") {
  setState({ items, loading: false, mode });
  if (mode === "guest") {
    writeLocalCart(items);
  }
}

function scheduleWrite(
  productId: string,
  task: () => Promise<void>
) {
  const existing = pendingWrites.get(productId);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    task().catch(() => undefined);
    pendingWrites.delete(productId);
  }, UPDATE_DEBOUNCE_MS);
  pendingWrites.set(productId, timeout);
}

async function writeCartItem(userId: string, item: CartItem) {
  if (!db) return;
  const ref = doc(db, "users", userId, "cartItems", item.productId);
  await setDoc(ref, {
    ...item,
    updatedAt: serverTimestamp(),
  });
}

async function deleteCartItem(userId: string, productId: string) {
  if (!db) return;
  await deleteDoc(doc(db, "users", userId, "cartItems", productId));
}

export function addToCart(input: CartItemInput): AddToCartResult {
  const qtyToAdd = input.qty ?? 1;
  if (!input.productId || qtyToAdd <= 0 || input.stock <= 0) return "invalid";

  const now = Date.now();
  const lastAdd = lastAddAt.get(input.productId) ?? 0;
  if (now - lastAdd < ADD_COOLDOWN_MS) {
    return "throttled";
  }
  lastAddAt.set(input.productId, now);

  const existing = state.items.find((item) => item.productId === input.productId);
  const nextQty = Math.min(
    (existing?.qty ?? 0) + qtyToAdd,
    input.stock
  );

  if (nextQty <= 0) return "invalid";

  const nextItem: CartItem = {
    productId: input.productId,
    qty: nextQty,
    price: input.price,
    name: input.name,
    image: input.image,
    category: input.category,
    size: input.size,
    pack: input.pack,
    stock: input.stock,
    updatedAt: Date.now(),
  };

  const items = existing
    ? state.items.map((item) =>
        item.productId === input.productId ? nextItem : item
      )
    : [...state.items, nextItem];

  updateStateItems(items, state.mode);

  if (state.mode === "user" && currentUser) {
    scheduleWrite(input.productId, () => writeCartItem(currentUser!.uid, nextItem));
  }

  return "added";
}

export function updateCartQty(productId: string, qty: number, stock: number) {
  if (qty <= 0) {
    removeFromCart(productId);
    return;
  }

  const nextQty = Math.min(qty, stock);
  const items = state.items.map((item) =>
    item.productId === productId
      ? { ...item, qty: nextQty, updatedAt: Date.now(), stock }
      : item
  );

  const updatedItem = items.find((item) => item.productId === productId);
  updateStateItems(items, state.mode);

  if (state.mode === "user" && currentUser && updatedItem) {
    scheduleWrite(productId, () => writeCartItem(currentUser!.uid, updatedItem));
  }
}

export function removeFromCart(productId: string) {
  const items = state.items.filter((item) => item.productId !== productId);
  updateStateItems(items, state.mode);

  if (state.mode === "user" && currentUser) {
    deleteCartItem(currentUser.uid, productId).catch(() => undefined);
  }
}

export function clearCart() {
  if (state.mode === "guest") {
    updateStateItems([], "guest");
    return;
  }

  const itemsToDelete = state.items;
  updateStateItems([], "user");

  if (state.mode === "user" && currentUser && db) {
    const batch = writeBatch(db);
    itemsToDelete.forEach((item) => {
      batch.delete(doc(db, "users", currentUser!.uid, "cartItems", item.productId));
    });
    batch.commit().catch(() => undefined);
  }
}

export function getTotalQty(items: CartItem[]) {
  return items.reduce((total, item) => total + item.qty, 0);
}
