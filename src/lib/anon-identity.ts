/**
 * Anonymous identity — no email, no phone, no server-side account, no tracking.
 *
 * How it works:
 *  - On first use, the browser generates a random 256-bit secret entirely
 *    client-side (Web Crypto). Nothing is sent to a server to "register".
 *  - A public "identity handle" is derived from the secret via SHA-256, so the
 *    server (if/when it stores content) only ever sees an opaque handle, never
 *    anything that ties back to a real person.
 *  - The secret lives ONLY in the user's browser (localStorage). Losing it =
 *    losing the identity (by design — there is no recovery-by-email backdoor).
 *  - Users can export their secret (a recovery phrase) and re-import it on
 *    another device. That's the only way in — no central account database.
 *
 * This is the anonymity-first equivalent of "sign in", closer to how a crypto
 * wallet works than a traditional account.
 */

const SECRET_KEY = "lumen:anon:secret:v1";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Generate a fresh 256-bit secret (client-side only). */
export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Extremely unlikely fallback (no Web Crypto at all). Not for prod use —
    // prod is a secure context where crypto is always present.
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 2654435761) & 0xff;
  }
  return toHex(bytes);
}

/**
 * Non-cryptographic fallback hash (FNV-1a, 128-bit split) for when
 * crypto.subtle is unavailable — which is the case on plain HTTP origins
 * (browsers only expose SubtleCrypto in "secure contexts": HTTPS or localhost).
 * In production the site is served over HTTPS/Tor, so the real SHA-256 path is
 * used; this fallback just keeps the app working over http://<lan-ip> in dev.
 */
function fallbackHandle(secretHex: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < secretHex.length; i++) {
    const c = secretHex.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000199) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2).slice(0, 32);
}

/** Derive the public, opaque identity handle from a secret. */
export async function deriveHandle(secretHex: string): Promise<string> {
  // crypto.subtle is only present in secure contexts (HTTPS / localhost).
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return fallbackHandle(secretHex);
  }
  try {
    const bytes = fromHex(secretHex);
    const buf = new ArrayBuffer(bytes.length);
    new Uint8Array(buf).set(bytes);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return toHex(new Uint8Array(digest).slice(0, 16));
  } catch {
    return fallbackHandle(secretHex);
  }
}

/** Load the local secret, generating one on first use. Browser only. */
export function loadOrCreateSecret(): string {
  if (typeof window === "undefined") return "";
  let secret = localStorage.getItem(SECRET_KEY);
  if (!secret) {
    secret = generateSecret();
    localStorage.setItem(SECRET_KEY, secret);
  }
  return secret;
}

/** Import an existing secret (from another device). Returns false if invalid. */
export function importSecret(secretHex: string): boolean {
  const clean = secretHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) return false;
  localStorage.setItem(SECRET_KEY, clean);
  return true;
}

/** Wipe the local identity entirely (leaves no trace). */
export function forgetIdentity(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SECRET_KEY);
}
