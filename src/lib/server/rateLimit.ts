import type { NextRequest } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

type RateLimitRequest = Pick<Request, "headers" | "url" | "method"> & {
  nextUrl?: { pathname?: string };
};

function getPathname(request: RateLimitRequest) {
  const pathnameFromNext = request.nextUrl?.pathname;
  if (pathnameFromNext) return pathnameFromNext;

  try {
    return new URL(request.url).pathname;
  } catch {
    return "unknown";
  }
}

function pruneExpiredBuckets(now: number) {
  if (buckets.size < 1000) return;
  for (const [bucketKey, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) {
      buckets.delete(bucketKey);
    }
  }
}

export function getClientKey(request: Pick<Request, "headers">) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  const connecting = request.headers.get("cf-connecting-ip");
  if (connecting) {
    return connecting.trim();
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

export function rateLimit(
  key: string,
  request: RateLimitRequest | NextRequest,
  options: { limit?: number; windowMs?: number } = {}
): Response | null {
  const limit = options.limit ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  pruneExpiredBuckets(now);

  const bucketKey = `${key}:${request.method}:${getPathname(request)}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1000)
    );
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    });
  }

  bucket.count += 1;
  return null;
}

export function __resetRateLimitBucketsForTests() {
  buckets.clear();
}
