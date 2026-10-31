import type { AnalyticsEventKind } from "./analytics-policy";

export type AnalyticsStoreInput = {
  visitorHash: string;
  kind: AnalyticsEventKind;
  path: string;
  referrerHost: string | null;
  source: string | null;
  countryCode?: string | null;
};

export interface AnalyticsConnection {
  beginTransaction(): Promise<void>;
  execute(sql: string, params?: unknown): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface AnalyticsPool {
  getConnection(): Promise<AnalyticsConnection>;
  execute?(sql: string, params?: unknown): Promise<unknown>;
}

export function analyticsUtcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function recordAnalyticsEventWithPool(
  pool: AnalyticsPool,
  input: AnalyticsStoreInput,
  now = new Date(),
): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.kind === "page_view") {
      await connection.execute(
        `INSERT INTO analytics_daily_visitors
         (day, visitor_hash, page_views, first_seen_at, last_seen_at,
          first_path, last_path, referrer_host, \`source\`, country_code, country_observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           page_views = page_views + 1,
           last_seen_at = VALUES(last_seen_at),
           last_path = VALUES(last_path),
           referrer_host = COALESCE(referrer_host, VALUES(referrer_host)),
           \`source\` = COALESCE(\`source\`, VALUES(\`source\`)),
           country_observed_at = IF(country_code IS NULL, VALUES(country_observed_at), country_observed_at),
           country_code = COALESCE(country_code, VALUES(country_code))`,
        [
          analyticsUtcDay(now),
          input.visitorHash,
          1,
          now,
          now,
          input.path,
          input.path,
          input.referrerHost,
          input.source,
          input.countryCode ?? null,
          input.countryCode ? now : null,
        ],
      );
    }

    await connection.execute(
      `INSERT INTO analytics_presence (visitor_hash, last_seen_at, last_path)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_seen_at = VALUES(last_seen_at),
         last_path = VALUES(last_path)`,
      [input.visitorHash, now, input.path],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function pruneAnalyticsPresenceWithPool(
  pool: AnalyticsPool,
  cutoff: Date,
): Promise<void> {
  if (!pool.execute) return;
  await pool.execute(
    `DELETE FROM analytics_presence WHERE last_seen_at < ? LIMIT 1000`,
    [cutoff],
  );
}

