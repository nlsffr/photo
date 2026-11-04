function allowedOrigin(url: URL): boolean {
  return !url.username && !url.password && (url.origin === "https://leakfanhub.com"
    || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)));
}
export function adsDocumentParentOrigin(request: Request, url: URL): string | null {
  if (!["http:", "https:"].includes(url.protocol)) return null;
  // Next can expose an internal localhost URL behind Nginx. Only our fixed
  // public Host or an exact local QA host may select the document's parent.
  const host = request.headers.get("host");
  if (host === null) return allowedOrigin(url) ? url.origin : null;
  if (["leakfanhub.com", "leakfanhub.com:443"].includes(host.toLowerCase())) return "https://leakfanhub.com";
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)
    || !/^(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/.test(host)) return null;
  try { const local = new URL("http://" + host); return allowedOrigin(local) ? local.origin : null; } catch { return null; }
}
