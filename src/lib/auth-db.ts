/**
 * Auth data access — users + sessions in MariaDB.
 *
 * Self-contained (its own lazily-created pool on DATABASE_URL) so it doesn't
 * depend on the read-only DataProvider. Server-only.
 */

import "server-only";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { randomUUID } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  sessionExpiry,
} from "./auth";

export interface SessionUser {
  id: string;
  email: string;
  username: string | null;
  isCreator: boolean;
}

let pool: mysql.Pool | null = null;

/** Lazily build a pool. Returns null when no DB is configured. */
function getPool(): mysql.Pool | null {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  pool = mysql.createPool({
    uri: url,
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
        : undefined,
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    waitForConnections: true,
    namedPlaceholders: true,
  });
  return pool;
}

export function isAuthDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

type RegisterResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: "email_taken" | "username_taken" | "no_db" | "failed" };

export async function registerUser(input: {
  email: string;
  username: string;
  password: string;
}): Promise<RegisterResult> {
  const db = getPool();
  if (!db) return { ok: false, error: "no_db" };

  // Pre-check for friendlier errors than a raw duplicate-key exception.
  const [existing] = await db.execute<RowDataPacket[]>(
    "SELECT email, username FROM users WHERE email = :email OR username = :username LIMIT 1",
    { email: input.email, username: input.username },
  );
  const clash = existing[0] as { email: string | null; username: string | null } | undefined;
  if (clash) {
    if (clash.email === input.email) return { ok: false, error: "email_taken" };
    return { ok: false, error: "username_taken" };
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  try {
    await db.execute(
      `INSERT INTO users (id, email, username, password_hash)
       VALUES (:id, :email, :username, :hash)`,
      { id, email: input.email, username: input.username, hash: passwordHash },
    );
  } catch (e) {
    // Race on the unique index between the pre-check and insert.
    const code = (e as { code?: string }).code;
    if (code === "ER_DUP_ENTRY") {
      const [again] = await db.execute<RowDataPacket[]>(
        "SELECT email FROM users WHERE email = :email LIMIT 1",
        { email: input.email },
      );
      return again[0]
        ? { ok: false, error: "email_taken" }
        : { ok: false, error: "username_taken" };
    }
    return { ok: false, error: "failed" };
  }

  return {
    ok: true,
    user: { id, email: input.email, username: input.username, isCreator: false },
  };
}

type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: "invalid_credentials" | "no_db" };

/** identifier = email OR username. */
export async function verifyCredentials(
  identifier: string,
  password: string,
): Promise<LoginResult> {
  const db = getPool();
  if (!db) return { ok: false, error: "no_db" };

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, email, username, password_hash, is_creator
     FROM users
     WHERE (email = :id OR username = :id) AND password_hash IS NOT NULL
     LIMIT 1`,
    { id: identifier },
  );
  const row = rows[0] as
    | {
        id: string;
        email: string;
        username: string | null;
        password_hash: string;
        is_creator: number;
      }
    | undefined;
  if (!row) return { ok: false, error: "invalid_credentials" };

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return { ok: false, error: "invalid_credentials" };

  return {
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      isCreator: Boolean(row.is_creator),
    },
  };
}

/** Create a session row and return its token (the cookie value). */
export async function createSession(userId: string): Promise<string | null> {
  const db = getPool();
  if (!db) return null;
  const token = newSessionToken();
  await db.execute(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (:id, :uid, :exp)",
    { id: token, uid: userId, exp: sessionExpiry() },
  );
  return token;
}

/** Resolve a session token to the user, or null if missing/expired. */
export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const db = getPool();
  if (!db || !token) return null;
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT u.id, u.email, u.username, u.is_creator
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = :token AND s.expires_at > NOW()
     LIMIT 1`,
    { token },
  );
  const row = rows[0] as
    | { id: string; email: string; username: string | null; is_creator: number }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    isCreator: Boolean(row.is_creator),
  };
}

export async function destroySession(token: string): Promise<void> {
  const db = getPool();
  if (!db || !token) return;
  await db.execute("DELETE FROM sessions WHERE id = :token", { token });
}
