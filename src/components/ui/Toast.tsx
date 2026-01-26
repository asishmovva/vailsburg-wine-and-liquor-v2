"use client";

import { useEffect, useState } from "react";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

const DEFAULT_DURATION = 2500;
const listeners = new Set<() => void>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

let toasts: ToastItem[] = [];

function emit() {
  listeners.forEach((listener) => listener());
}

function getToasts() {
  return toasts;
}

function removeToast(id: string) {
  toasts = toasts.filter((toastItem) => toastItem.id !== id);
  const timeout = timeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    timeouts.delete(id);
  }
  emit();
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const toastBase = (options: ToastOptions) => {
  const id = createId();
  const toastItem: ToastItem = {
    id,
    title: options.title,
    description: options.description,
    variant: options.variant ?? "success",
  };

  toasts = [...toasts, toastItem];
  emit();

  const duration = options.duration ?? DEFAULT_DURATION;
  const timeout = setTimeout(() => removeToast(id), duration);
  timeouts.set(id, timeout);

  return id;
};

export const toast = Object.assign(toastBase, {
  success: (title: string, description?: string) =>
    toastBase({ title, description, variant: "success" }),
  error: (title: string, description?: string) =>
    toastBase({ title, description, variant: "error" }),
  dismiss: (id: string) => removeToast(id),
});

export function ToastViewport() {
  const [items, setItems] = useState(getToasts());

  useEffect(() => {
    const listener = () => setItems(getToasts());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[92vw] -translate-x-1/2 flex-col gap-2 md:bottom-auto md:left-auto md:right-4 md:top-4 md:w-auto md:max-w-sm md:translate-x-0">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg ${
            item.variant === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="space-y-1">
            <p className="font-semibold">{item.title}</p>
            {item.description ? (
              <p className="text-xs opacity-80">{item.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => removeToast(item.id)}
            className="rounded-full border border-transparent px-2 py-1 text-xs font-medium text-current hover:border-current"
            aria-label="Dismiss"
          >
            Close
          </button>
        </div>
      ))}
    </div>
  );
}
