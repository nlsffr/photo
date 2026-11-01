/** Only return to an unambiguous path on this site after authentication. */
export function safeAuthReturnPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (/^[\/]{2}|[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid" || url.pathname.startsWith("//")) return fallback;
    return value;
  } catch {
    return fallback;
  }
}
