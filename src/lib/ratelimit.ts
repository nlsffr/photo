/**
 * In-memory rate limiter — anti-abuse without retaining identifiable data.
 *
 * Privacy stance:
 *  - The caller passes a *salted hash* of whatever coarse key it has (never a
 *    raw IP). We only ever hold the hash, in memory, for a sliding window, then
 *    it's gone. Nothing is written to disk, nothing is logged.
 *  - The salt is per-process and random, so the same client on two restarts
 *    hashes differently — buckets can't be correlated across time.
 *
 * This is the last line of app-level defence; the edge proxy + DDoS-Guard do
 * the heavy lifting.
 */

import { createHash, randomBytes } from "node:crypto";

// Per-process random salt — never persisted.
const SALT = randomBytes(16).toString("hex");

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Hash a coarse key with the ephemeral salt (so we never hold a raw value). */
export function anonKey(raw: string): string {
  return createHash("sha256").update(SALT).update(raw).digest("hex").slice(0, 24);
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key   already-anonymised key (use anonKey()).
 * @param limit max requests per window.
 * @param windowMs window length in ms.
 */
export function rateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  b.count += 1;
  const allowed = b.count <= limit;
  return { allowed, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

// Opportunistic cleanup so the map can't grow unbounded.
let lastSweep = Date.now();
export function sweep() {
  const now = Date.now();
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}
