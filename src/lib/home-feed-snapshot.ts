import type { MediaType } from "./types";

type SnapshotIdentity = {
  seed: number;
  creator?: string;
  type?: MediaType;
  tag?: string;
  q?: string;
  isAi?: boolean;
};

type SnapshotEntry = {
  ids: string[];
  expiresAt: number;
};

type SnapshotStoreOptions = {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
};

export function homeFeedSnapshotKey(identity: SnapshotIdentity): string {
  return JSON.stringify({
    seed: identity.seed >>> 0,
    creator: identity.creator ?? "",
    type: identity.type ?? "",
    tag: identity.tag ?? "",
    q: identity.q ?? "",
    isAi: identity.isAi === undefined ? "" : identity.isAi ? 1 : 0,
  });
}

export function createHomeFeedSnapshotStore({
  maxEntries,
  ttlMs,
  now = Date.now,
}: SnapshotStoreOptions) {
  const entries = new Map<string, SnapshotEntry>();

  const removeExpired = () => {
    const current = now();
    for (const [key, entry] of entries) {
      if (current >= entry.expiresAt) entries.delete(key);
    }
  };

  return {
    get(key: string): string[] | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return [...entry.ids];
    },

    set(key: string, ids: readonly string[]): void {
      removeExpired();
      entries.delete(key);
      while (entries.size >= Math.max(1, maxEntries)) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(key, {
        ids: [...new Set(ids)],
        expiresAt: now() + Math.max(1, ttlMs),
      });
    },
  };
}

/**
 * One process serves production today; freeze up to 500 discovery sessions for
 * one hour so a changing candidate pool cannot shift offset pages.
 */
export const homeFeedSnapshots = createHomeFeedSnapshotStore({
  maxEntries: 500,
  ttlMs: 60 * 60_000,
});
