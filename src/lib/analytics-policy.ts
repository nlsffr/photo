import { createHash, randomBytes } from "node:crypto";

export const ANALYTICS_VISITOR_COOKIE = "lfh_visitor";
export const ANALYTICS_VISITOR_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const ANALYTICS_PRESENCE_WINDOW_MS = 5 * 60 * 1000;

export type AnalyticsEventKind = "page_view" | "heartbeat";

export type AnalyticsEvent = {
  kind: AnalyticsEventKind;
  path: string;
  referrerHost: string | null;
  source: string | null;
};

const BOT_PATTERN =
  /(?:bot|crawl|spider|slurp|headless|lighthouse|pagespeed|curl|wget|python-requests|go-http-client|facebookexternalhit|preview)/i;

const INTERNAL_PATH =
  /^\/(?:api(?:\/|$)|_next(?:\/|$)|favicon(?:\.|\/|$)|icon(?:\/|$)|apple-icon(?:\/|$)|robots\.txt$|sitemap(?:s|\.xml)(?:\/|$))/i;

const ASSET_EXTENSION =
  /\.(?:avif|bmp|css|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|pdf|png|svg|txt|webm|webp|woff2?|xml)$/i;

export function isAnalyticsBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BOT_PATTERN.test(userAgent);
}

export function normalizeAnalyticsPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.length > 2_000 ||
    /[\u0000-\u001f\u007f\\]/.test(raw) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)
  ) {
    return null;
  }

  let pathname: string;
  try {
    pathname = new URL(raw, "https://analytics.invalid").pathname;
  } catch {
    return null;
  }

  if (
    pathname.length > 512 ||
    INTERNAL_PATH.test(pathname) ||
    ASSET_EXTENSION.test(pathname)
  ) {
    return null;
  }
  return pathname || "/";
}

export function normalizeAnalyticsReferrerHost(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return hostname ? hostname.slice(0, 255) : null;
  } catch {
    return null;
  }
}

export function normalizeAnalyticsSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .slice(0, 64);
  return normalized || null;
}

export function parseAnalyticsPayload(value: unknown): AnalyticsEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.event !== "page_view" && body.event !== "heartbeat") return null;
  const path = normalizeAnalyticsPath(body.path);
  if (!path) return null;
  return {
    kind: body.event,
    path,
    referrerHost: normalizeAnalyticsReferrerHost(body.referrer),
    source: normalizeAnalyticsSource(body.source),
  };
}

export function createAnalyticsVisitorToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidAnalyticsVisitorToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashAnalyticsVisitorToken(
  token: string,
  secret: string,
): string {
  if (!isValidAnalyticsVisitorToken(token)) {
    throw new Error("invalid_analytics_visitor_token");
  }
  if (secret.length < 16) throw new Error("analytics_hash_secret_too_short");
  return createHash("sha256")
    .update(secret)
    .update("\0")
    .update(token)
    .digest("hex");
}

export function analyticsPresenceCutoff(now = new Date()): Date {
  return new Date(now.getTime() - ANALYTICS_PRESENCE_WINDOW_MS);
}

