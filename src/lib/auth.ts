/**
 * Password hashing + session tokens — using only Node's built-in crypto.
 *
 * Passwords: scrypt (memory-hard KDF, in the standard library, no native build).
 * Stored as  scrypt$N$r$p$salt$hash  (all hex), so parameters travel with the
 * hash and can be upgraded later without breaking old rows.
 *
 * Sessions: 32 random bytes, hex-encoded → 64-char opaque token. This IS the
 * cookie value and the sessions table primary key; nothing derivable from it.
 */

import {
  scrypt as scryptCb,
  randomBytes,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

// Promisified scrypt that keeps the options-accepting overload (promisify's
// inferred type drops it, so we type it explicitly).
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

// scrypt cost parameters. N must be a power of two; 2^15 is a good 2020s default.
const N = 32768;
const r = 8;
const p = 1;
const KEYLEN = 32;
const SALT_LEN = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = (await scrypt(password, salt, KEYLEN, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2,
  })) as Buffer;
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = (await scrypt(password, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
      maxmem: 128 * Number(nStr) * Number(rStr) * 2,
    })) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** A fresh opaque session token (also the DB primary key + cookie value). */
export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export const SESSION_COOKIE = "lumen_session";
export const SESSION_TTL_DAYS = 30;

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ---- validation helpers (shared by the register route + could be reused) ----

export function validateUsername(u: string): string | null {
  if (u.length < 3) return "Le nom d’utilisateur doit faire au moins 3 caractères.";
  if (u.length > 32) return "Le nom d’utilisateur est trop long (max 32).";
  if (!/^[a-zA-Z0-9_.-]+$/.test(u))
    return "Seuls lettres, chiffres, «_», «.» et «-» sont autorisés.";
  return null;
}

export function validateEmail(e: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Adresse e-mail invalide.";
  if (e.length > 255) return "Adresse e-mail trop longue.";
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";
  if (pw.length > 200) return "Le mot de passe est trop long.";
  return null;
}
