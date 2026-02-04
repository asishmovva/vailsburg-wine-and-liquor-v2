import "server-only";

import type { NextRequest } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  req: NextRequest,
  options: { limit?: number; windowMs?: number } = {}
): Response | null {
  const limit = options.limit ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  const bucketKey = `${key}:${req.nextUrl.pathname}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (bucket.count >= limit) {
    return new Response("Too many requests", { status: 429 });
  }

  bucket.count += 1;
  return null;
}
