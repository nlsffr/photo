export type SitemapBoundary = {
  date: string;
  createdAt: string;
  id: string;
};

const PARTITION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPartitionDate(value: string): boolean {
  if (!PARTITION_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export type SitemapPartition = SitemapBoundary & {
  cursor: string;
  path: string;
};

function normalizeBoundary(boundary: SitemapBoundary): SitemapBoundary {
  if (!isPartitionDate(boundary.date)) {
    throw new Error("Invalid sitemap partition date");
  }
  const parsed = Date.parse(boundary.createdAt);
  if (!Number.isFinite(parsed)) throw new Error("Invalid sitemap cursor date");
  const createdAt = new Date(parsed).toISOString();
  if (createdAt.slice(0, 10) !== boundary.date) {
    throw new Error("Sitemap cursor must belong to its UTC date bucket");
  }
  const id = boundary.id.trim();
  if (!id || id.length > 191) throw new Error("Invalid sitemap cursor id");
  return { date: boundary.date, createdAt, id };
}

export function encodeSitemapCursor(
  boundary: Pick<SitemapBoundary, "createdAt" | "id">,
): string {
  return Buffer.from(
    JSON.stringify([boundary.createdAt, boundary.id]),
    "utf8",
  ).toString("base64url");
}

export function decodeSitemapCursor(
  cursor: string,
): Pick<SitemapBoundary, "createdAt" | "id"> | null {
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(cursor)) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (!Array.isArray(decoded) || decoded.length !== 2) return null;
    const [createdAtValue, idValue] = decoded;
    if (typeof createdAtValue !== "string" || typeof idValue !== "string") {
      return null;
    }
    const timestamp = Date.parse(createdAtValue);
    if (!Number.isFinite(timestamp) || !idValue.trim() || idValue.length > 191) {
      return null;
    }
    const createdAt = new Date(timestamp).toISOString();
    return { createdAt, id: idValue };
  } catch {
    return null;
  }
}

export function buildSitemapPartitions(
  boundaries: SitemapBoundary[],
): SitemapPartition[] {
  return boundaries
    .map(normalizeBoundary)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .map((boundary) => {
      const cursor = encodeSitemapCursor(boundary);
      return {
        ...boundary,
        cursor,
        path: `/sitemaps/media/${boundary.date}/${cursor}`,
      };
    });
}
