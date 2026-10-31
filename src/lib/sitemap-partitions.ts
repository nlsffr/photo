import { createHmac, timingSafeEqual } from "node:crypto";

type SitemapKeyset = {
  createdAt: string;
  id: string;
};

export type SitemapCursor = SitemapKeyset & { upper?: SitemapKeyset | null };
export type SitemapBoundary = SitemapCursor & { date: string };

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
  const lower = { date: boundary.date, createdAt, id };
  if (boundary.upper === undefined) return lower;
  if (boundary.upper === null) return { ...lower, upper: null };
  const upper = normalizeBoundary({ date: boundary.date, ...boundary.upper });
  if (upper.createdAt < createdAt || (upper.createdAt === createdAt && upper.id <= id)) {
    throw new Error("Invalid sitemap upper boundary");
  }
  return { ...lower, upper: { createdAt: upper.createdAt, id: upper.id } };
}

function signingKey(): string {
  return process.env.SESSION_SECRET?.trim() || process.env.ANALYTICS_HASH_SECRET?.trim() || "";
}

function cursorSignature(values: unknown[], secret: string): string {
  if (secret.length < 16) throw new Error("sitemap_signing_key_not_configured");
  return createHmac("sha256", secret).update("sitemap-range-v1\0").update(JSON.stringify(values)).digest("base64url");
}

export function encodeSitemapCursor(
  boundary: SitemapCursor,
  secret = signingKey(),
): string {
  const values: Array<string | null> = [boundary.createdAt, boundary.id];
  if (boundary.upper !== undefined) {
    values.push(boundary.upper?.createdAt ?? null, boundary.upper?.id ?? null);
    values.push(cursorSignature(values, secret));
  }
  return Buffer.from(
    JSON.stringify(values),
    "utf8",
  ).toString("base64url");
}

export function decodeSitemapCursor(
  cursor: string,
  secret = signingKey(),
): SitemapCursor | null {
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(cursor)) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (!Array.isArray(decoded) || ![2, 5].includes(decoded.length)) return null;
    if (decoded.length === 5) {
      const signature = decoded[4];
      if (typeof signature !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
      const expected = cursorSignature(decoded.slice(0, 4), secret);
      if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    }
    const [createdAtValue, idValue] = decoded;
    if (typeof createdAtValue !== "string" || typeof idValue !== "string") {
      return null;
    }
    const timestamp = Date.parse(createdAtValue);
    if (!Number.isFinite(timestamp) || !idValue.trim() || idValue.length > 191) {
      return null;
    }
    const createdAt = new Date(timestamp).toISOString();
    let upper: SitemapKeyset | null | undefined;
    if (decoded.length === 5) {
      const [, , upperCreated, upperId] = decoded;
      if (upperCreated === null && upperId === null) upper = null;
      else if (typeof upperCreated === "string" && typeof upperId === "string") {
        upper = { createdAt: upperCreated, id: upperId };
      } else return null;
    }
    const normalized = normalizeBoundary({
      date: createdAt.slice(0, 10), createdAt, id: idValue,
      ...(decoded.length === 5 ? { upper } : {}),
    });
    return {
      createdAt: normalized.createdAt,
      id: normalized.id,
      ...(normalized.upper !== undefined ? { upper: normalized.upper } : {}),
    };
  } catch {
    return null;
  }
}

export function toMariaDbUtcTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Invalid sitemap timestamp");
  return new Date(timestamp).toISOString().replace("T", " ").replace("Z", "");
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
        path: `/sitemaps/media/stable/${boundary.date}/${cursor}`,
      };
    });
}
