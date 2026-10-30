export function createAsyncTtlCache<T>(
  loader: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): () => Promise<T> {
  const loadByKey = createAsyncTtlCacheMap(
    async () => loader(),
    ttlMs,
    now,
    1,
  );

  return () => loadByKey("singleton");
}

export function createAsyncTtlCacheMap<Key, Value>(
  loader: (key: Key) => Promise<Value>,
  ttlMs: number,
  now: () => number = Date.now,
  maxKeys = 500,
): (key: Key) => Promise<Value> {
  const safeTtlMs = Math.max(0, ttlMs);
  const safeMaxKeys = Math.max(1, Math.floor(maxKeys));
  const cached = new Map<Key, { value: Value; expiresAt: number }>();
  const inFlight = new Map<Key, Promise<Value>>();

  return async (key: Key) => {
    const currentTime = now();
    const cachedEntry = cached.get(key);
    if (cachedEntry && currentTime < cachedEntry.expiresAt) {
      return cachedEntry.value;
    }
    if (cachedEntry) cached.delete(key);

    const pending = inFlight.get(key);
    if (pending) return pending;

    const load = loader(key)
      .then((value) => {
        if (!cached.has(key) && cached.size >= safeMaxKeys) {
          const oldest = cached.keys().next();
          if (!oldest.done) cached.delete(oldest.value);
        }
        cached.set(key, { value, expiresAt: now() + safeTtlMs });
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, load);
    return load;
  };
}
