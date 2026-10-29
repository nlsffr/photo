type MetricValue = number | string | null | undefined;

export type EngagementInput = {
  sourceViews?: MetricValue;
  sourceLikes?: MetricValue;
  localViews?: MetricValue;
  legacyViews?: MetricValue;
  legacyLikes?: MetricValue;
};

export type NormalizedEngagement = {
  sourceViews: number;
  sourceLikes: number;
  localViews: number;
  views: number;
  likes: number;
};

function metric(value: MetricValue): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function isPresent(value: MetricValue): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Keeps old rows readable during the additive migration while making the
 * imported and first-party counters explicit for all migrated rows.
 */
export function normalizeEngagement(
  input: EngagementInput,
): NormalizedEngagement {
  const hasSourceViews = isPresent(input.sourceViews);
  const hasSourceLikes = isPresent(input.sourceLikes);
  const hasLocalViews = isPresent(input.localViews);
  const sourceViews = hasSourceViews
    ? metric(input.sourceViews)
    : metric(input.legacyViews);
  const sourceLikes = hasSourceLikes
    ? metric(input.sourceLikes)
    : metric(input.legacyLikes);
  const localViews = hasLocalViews ? metric(input.localViews) : 0;

  return {
    sourceViews,
    sourceLikes,
    localViews,
    views: hasSourceViews || hasLocalViews
      ? sourceViews + localViews
      : metric(input.legacyViews),
    likes: hasSourceLikes ? sourceLikes : metric(input.legacyLikes),
  };
}

export type EngagementConnection = {
  beginTransaction(): Promise<void>;
  execute(sql: string, params: Array<string | null>): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
};

export type EngagementPool = {
  getConnection(): Promise<EngagementConnection>;
};

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object" || !("affectedRows" in header)) {
    return 0;
  }
  return Number((header as { affectedRows?: unknown }).affectedRows) || 0;
}

/** Atomically record one first-party view without writing an imported counter. */
export async function recordLocalPhotoView(
  pool: EngagementPool,
  photoId: string,
  userId: string | null,
): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const updated = await connection.execute(
      "UPDATE photos SET local_views_count = COALESCE(local_views_count, 0) + 1 WHERE id = ?",
      [photoId],
    );
    if (affectedRows(updated) !== 1) throw new Error("photo_not_found");

    const inserted = await connection.execute(
      "INSERT INTO media_views (photo_id, user_id) VALUES (?, ?)",
      [photoId, userId],
    );
    if (affectedRows(inserted) !== 1) throw new Error("view_event_not_recorded");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
