import { NextResponse } from "next/server";
import {
  __resetRateLimitBucketsForTests,
  rateLimit,
} from "@/lib/server/rateLimit";

export type AdminRateLimitAction = "read" | "mutate" | "heavy";

const ACTION_LIMITS: Record<
  AdminRateLimitAction,
  { limit: number; windowMs: number; message: string }
> = {
  read: {
    limit: 180,
    windowMs: 60_000,
    message: "Too many admin read requests. Please wait and try again.",
  },
  mutate: {
    limit: 90,
    windowMs: 60_000,
    message: "Too many admin update requests. Please wait and try again.",
  },
  heavy: {
    limit: 24,
    windowMs: 60_000,
    message: "Too many admin export/sync requests. Please wait and try again.",
  },
};

export function adminRateLimit(
  action: AdminRateLimitAction,
  uid: string,
  request: Request,
  options?: {
    scope?: string;
    limit?: number;
    windowMs?: number;
    message?: string;
  }
) {
  const defaults = ACTION_LIMITS[action];
  const scope = options?.scope ?? "global";
  const limited = rateLimit(`admin:${action}:${scope}:${uid}`, request, {
    limit: options?.limit ?? defaults.limit,
    windowMs: options?.windowMs ?? defaults.windowMs,
  });
  if (!limited) return null;

  const retryAfter = limited.headers.get("Retry-After");
  return NextResponse.json(
    {
      error: options?.message ?? defaults.message,
      code: "rate_limited",
      action,
    },
    {
      status: 429,
      headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
    }
  );
}

export function __resetAdminRateLimitBucketsForTests() {
  __resetRateLimitBucketsForTests();
}
