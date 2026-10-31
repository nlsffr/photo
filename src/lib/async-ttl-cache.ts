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

/** Keep a valid index available while its replacement is built. */
export function createAsyncTtlCacheWithStale<T>(
  loader: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): () => Promise<T> {
  let cached: { value: T; expiresAt: number } | undefined;
  let inFlight: Promise<T> | undefined;
  let retryAfter = 0;

  function refresh(): Promise<T> {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(loader).then((value) => {
      cached = { value, expiresAt: now() + Math.max(0, ttlMs) };
      retryAfter = 0;
      return value;
    }).catch((error: unknown) => {
      retryAfter = now() + 5_000;
      throw error;
    }).finally(() => { inFlight = undefined; });
    return inFlight;
  }

  return () => {
    if (!cached) return refresh();
    if (now() >= cached.expiresAt && now() >= retryAfter) {
      void refresh().catch(() => {});
    }
    return Promise.resolve(cached.value);
  };
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
