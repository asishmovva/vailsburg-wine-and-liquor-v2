"use client";

import { buildOrderTimeline } from "@/lib/orders/buildOrderTimeline";
import type { OrderRecord } from "@/lib/orders/types";

function formatTimelineTime(value?: Date | null) {
  if (!value) return "";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OrderTimeline({ order }: { order: OrderRecord }) {
  const steps = buildOrderTimeline(order);

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const showConnector = index < steps.length - 1;
        const circleClasses = step.current
          ? step.tone === "destructive"
            ? "border-red-500 bg-red-500"
            : "border-zinc-900 bg-zinc-900"
          : step.completed
            ? step.tone === "destructive"
              ? "border-red-500 bg-white"
              : "border-emerald-500 bg-white"
            : "border-zinc-300 bg-white";

        const labelClasses = step.current
          ? "text-zinc-900"
          : step.completed
            ? "text-zinc-700"
            : "text-zinc-500";

        return (
          <div key={step.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${circleClasses}`}
              />
              {showConnector ? (
                <span
                  className={`mt-1 block min-h-8 w-px flex-1 ${
                    step.completed ? "bg-zinc-900/30" : "bg-zinc-200"
                  }`}
                />
              ) : null}
            </div>
            <div className="min-w-0 pb-4">
              <p className={`text-sm font-medium ${labelClasses}`}>{step.label}</p>
              {step.timestamp ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {formatTimelineTime(step.timestamp)}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
