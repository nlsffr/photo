import "server-only";

import { getDbPool } from "./db-pool";
import type { AnalyticsEvent } from "./analytics-policy";
import {
  pruneAnalyticsPresenceWithPool,
  recordAnalyticsEventWithPool,
  type AnalyticsPool,
} from "./analytics-store";

export async function recordAnalyticsEvent(
  visitorHash: string,
  event: AnalyticsEvent,
  now = new Date(),
): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  await recordAnalyticsEventWithPool(
    pool as unknown as AnalyticsPool,
    {
      visitorHash,
      kind: event.kind,
      path: event.path,
      referrerHost: event.referrerHost,
      source: event.source,
    },
    now,
  );
  return true;
}

export async function pruneStaleAnalyticsPresence(
  now = new Date(),
): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await pruneAnalyticsPresenceWithPool(
    pool as unknown as AnalyticsPool,
    oneDayAgo,
  );
}

