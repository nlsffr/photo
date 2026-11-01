import { createHash } from "node:crypto";

type SqlParams = Record<string, string | Date>;
interface ActivationConnection {
  beginTransaction(): Promise<void>;
  execute(sql: string, params: SqlParams): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}
export interface ActivationDatabase {
  execute(sql: string, params: SqlParams): Promise<unknown>;
  getConnection(): Promise<ActivationConnection>;
}
interface ActivationDependencies {
  isAllowed(id: string): boolean;
  hashPassword(password: string): Promise<string>;
  newSessionToken(): string;
  sessionExpiry(): Date;
}
type ActivationInput = { token: string; password: string };
type ActivationResult = { ok: true; token: string } | { ok: false; error: "invalid" | "unavailable" };

export function validActivationInput(input: unknown): input is ActivationInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return Object.keys(value).every(key => key === "token" || key === "password") &&
    typeof value.token === "string" && /^[a-f0-9]{64}$/.test(value.token) &&
    typeof value.password === "string" && value.password.length >= 12 && value.password.length <= 200;
}

function rows(result: unknown): Array<{ user_id: string }> {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
}
function changed(result: unknown): boolean {
  return Array.isArray(result) && result[0]?.affectedRows === 1;
}

const FIND_INVITE = `SELECT i.user_id FROM seo_editor_invites i
  JOIN users u ON u.id=i.user_id
  WHERE i.token_hash=:hash AND i.used_at IS NULL AND i.expires_at>NOW()
    AND u.password_hash IS NULL`;

export async function activateSeoEditor(
  database: ActivationDatabase,
  input: unknown,
  dependencies: ActivationDependencies,
): Promise<ActivationResult> {
  if (!validActivationInput(input)) return { ok: false, error: "invalid" };
  const hash = createHash("sha256").update(input.token).digest("hex");
  let connection: ActivationConnection | undefined;
  let transactionOpen = false;
  try {
    // Invalid invitation guesses must not trigger the expensive password hash.
    const candidate = rows(await database.execute(FIND_INVITE, { hash }))[0];
    if (!candidate || !dependencies.isAllowed(candidate.user_id)) return { ok: false, error: "invalid" };
    const passwordHash = await dependencies.hashPassword(input.password);
    connection = await database.getConnection();
    await connection.beginTransaction();
    transactionOpen = true;
    const locked = rows(await connection.execute(`${FIND_INVITE} AND i.user_id=:id FOR UPDATE`, { hash, id: candidate.user_id }))[0];
    if (!locked || !dependencies.isAllowed(locked.user_id)) {
      await connection.rollback(); transactionOpen = false;
      return { ok: false, error: "invalid" };
    }
    const updated = await connection.execute(
      "UPDATE users SET password_hash=:password WHERE id=:id AND password_hash IS NULL",
      { password: passwordHash, id: locked.user_id },
    );
    const consumed = await connection.execute(
      "UPDATE seo_editor_invites SET used_at=NOW() WHERE token_hash=:hash AND used_at IS NULL AND expires_at>NOW()",
      { hash },
    );
    if (!changed(updated) || !changed(consumed)) {
      await connection.rollback(); transactionOpen = false;
      return { ok: false, error: "invalid" };
    }
    const token = dependencies.newSessionToken();
    await connection.execute(
      "INSERT INTO sessions (id,user_id,expires_at) VALUES (:token,:id,:expiry)",
      { token, id: locked.user_id, expiry: dependencies.sessionExpiry() },
    );
    await connection.commit(); transactionOpen = false;
    return { ok: true, token };
  } catch {
    if (transactionOpen && connection) {
      try { await connection.rollback(); } catch { /* Keep the response free of connection details. */ }
    }
    return { ok: false, error: "unavailable" };
  } finally {
    connection?.release();
  }
}
