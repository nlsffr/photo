/** Share one asynchronous initialization result with every concurrent caller. */
export function createAsyncOnce<T>(initializer: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) pending = initializer();
    return pending;
  };
}
