const DEFAULT_ANALYTICS_ORIGIN = "https://leakfanhub.com";

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAllowedAnalyticsOrigin(
  requestUrl: string,
  headers: Headers,
  configuredSiteUrl = DEFAULT_ANALYTICS_ORIGIN,
): boolean {
  const fetchSite = headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return false;

  const suppliedOrigin = headers.get("origin");
  if (!suppliedOrigin) return false;
  const origin = normalizedOrigin(suppliedOrigin);
  if (!origin) return false;

  const allowed = new Set<string>();
  const requestOrigin = normalizedOrigin(requestUrl);
  const siteOrigin = normalizedOrigin(configuredSiteUrl);
  if (requestOrigin) allowed.add(requestOrigin);
  if (siteOrigin) allowed.add(siteOrigin);
  return allowed.has(origin);
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const limit = Math.max(1, Math.floor(maxBytes));
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error("analytics_payload_too_large");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("analytics_invalid_json");

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("analytics_payload_too_large");
        throw new Error("analytics_payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("analytics_invalid_json");
  }
}

