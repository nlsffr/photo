/**
 * Auth data access — users + sessions in MariaDB.
 *
 * Self-contained (its own lazily-created pool on DATABASE_URL) so it doesn't
 * depend on the read-only DataProvider. Server-only.
 */

import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { randomUUID } from "node:crypto";
import { getDbPool as getPool } from "./db-pool";
import {
  registerWithSession,
  type RegistrationDatabase,
} from "./auth-registration-flow";
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

export function isAuthDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

type RegisterResult =
  | { ok: true; user: SessionUser; token: string }
  | { ok: false; error: "email_taken" | "username_taken" | "no_db" | "failed" };

export async function registerUser(input: {
  email: string;
  username: string;
  password: string;
}): Promise<RegisterResult> {
  const db = getPool();
  if (!db) return { ok: false, error: "no_db" };
  return registerWithSession(db as unknown as RegistrationDatabase, input, {
    hashPassword,
    randomId: randomUUID,
    newSessionToken,
    sessionExpiry,
  });
}

// A symbol keeps the sensitive credential proof outside user and JSON output.
export const VERIFIED_CREDENTIAL_HASH = Symbol("verifiedCredentialHash");
type LoginResult =
  | { ok: true; user: SessionUser; [VERIFIED_CREDENTIAL_HASH]: string }
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
    [VERIFIED_CREDENTIAL_HASH]: row.password_hash,
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      isCreator: Boolean(row.is_creator),
    },
  };
}

/** Create a session row and return its token (the cookie value). */
export async function createSession(userId: string, expectedPasswordHash?: string): Promise<string | null> {
  const db = getPool();
  if (!db) return null;
  if (expectedPasswordHash !== undefined && (typeof expectedPasswordHash !== "string" || !expectedPasswordHash || expectedPasswordHash.length > 255)) return null;
  const token = newSessionToken();
  const params = { id: token, uid: userId, exp: sessionExpiry() };
  const insert = "INSERT INTO sessions (id, user_id, expires_at) VALUES (:id, :uid, :exp)";
  if (expectedPasswordHash === undefined) {
    const [result] = await db.execute<ResultSetHeader>(insert, params);
    return result.affectedRows === 1 ? token : null;
  }
  // Reset and credential login lock the same user first. A preceding login is
  // revoked by reset; a late login must still match the hash after reset commits.
  const connection = await db.getConnection();
  let transactionOpen = false;
  try {
    await connection.beginTransaction(); transactionOpen = true;
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT password_hash FROM users WHERE id=:uid FOR UPDATE", { uid: userId },
    );
    if (rows[0]?.password_hash !== expectedPasswordHash) {
      await connection.rollback(); transactionOpen = false; return null;
    }
    const [result] = await connection.execute<ResultSetHeader>(insert, params);
    if (result.affectedRows !== 1) {
      await connection.rollback(); transactionOpen = false; return null;
    }
    await connection.commit(); transactionOpen = false;
    return token;
  } catch (error) {
    if (transactionOpen) { try { await connection.rollback(); } catch { /* Preserve the original failure. */ } }
    throw error;
  } finally { connection.release(); }
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
