/**
 * Process-local TTL cache (no extra deps).
 * Helps hot list endpoints when many users hit the same sort/cursor.
 * For multi-instance deploy, replace with Redis later.
 */

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const MAX_KEYS = 500;

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return undefined;
  if (Date.now() > e.expires) {
    store.delete(key);
    return undefined;
  }
  return e.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (store.size >= MAX_KEYS) {
    // drop oldest ~10%
    const n = Math.ceil(MAX_KEYS * 0.1);
    let i = 0;
    for (const k of store.keys()) {
      store.delete(k);
      if (++i >= n) break;
    }
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function cacheKey(parts: Record<string, string | number | boolean | undefined | null>): string {
  return Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k] ?? ""}`)
    .join("&");
}
