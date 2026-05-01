type AnalyticsCacheEntry<T> = {
  value: T;
  expiresAtMs: number;
};

const analyticsCache = new Map<string, AnalyticsCacheEntry<unknown>>();

function getNowMs() {
  return Date.now();
}

function pruneExpired(nowMs: number) {
  for (const [key, entry] of analyticsCache.entries()) {
    if (entry.expiresAtMs <= nowMs) {
      analyticsCache.delete(key);
    }
  }
}

export function withAnalyticsCache<T>({
  key,
  ttlMs,
  compute,
}: {
  key: string;
  ttlMs: number;
  compute: () => Promise<T>;
}): Promise<{
  value: T;
  cacheHit: boolean;
  expiresAtMs: number;
}> {
  const nowMs = getNowMs();
  pruneExpired(nowMs);
  const cached = analyticsCache.get(key) as AnalyticsCacheEntry<T> | undefined;
  if (cached && cached.expiresAtMs > nowMs) {
    return Promise.resolve({
      value: cached.value,
      cacheHit: true,
      expiresAtMs: cached.expiresAtMs,
    });
  }

  const expiresAtMs = nowMs + Math.max(0, ttlMs);
  return compute().then((value) => {
    analyticsCache.set(key, {
      value,
      expiresAtMs,
    });
    return { value, cacheHit: false, expiresAtMs };
  });
}

export function __resetAnalyticsCacheForTests() {
  analyticsCache.clear();
}
