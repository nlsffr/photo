export interface RegistrationInput {
  email: string;
  username: string;
  password: string;
}

export interface RegisteredUser {
  id: string;
  email: string;
  username: string;
  isCreator: false;
}

export type RegistrationResult =
  | { ok: true; user: RegisteredUser; token: string }
  | {
      ok: false;
      error: "email_taken" | "username_taken" | "failed";
    };

interface RegistrationConnection {
  beginTransaction(): Promise<void>;
  execute(sql: string, params: Record<string, unknown>): Promise<unknown>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface RegistrationDatabase {
  getConnection(): Promise<RegistrationConnection>;
}

interface RegistrationDependencies {
  hashPassword(password: string): Promise<string>;
  randomId(): string;
  newSessionToken(): string;
  sessionExpiry(): Date;
}

type ExistingAccount = { email: string | null; username: string | null };

function firstResultRows(result: unknown): ExistingAccount[] {
  if (!Array.isArray(result) || !Array.isArray(result[0])) return [];
  return result[0] as ExistingAccount[];
}

function conflictFor(
  rows: ExistingAccount[],
  input: RegistrationInput,
): "email_taken" | "username_taken" | null {
  const row = rows[0];
  if (!row) return null;
  if (row.email?.toLowerCase() === input.email.toLowerCase()) {
    return "email_taken";
  }
  return "username_taken";
}

export async function registerWithSession(
  database: RegistrationDatabase,
  input: RegistrationInput,
  dependencies: RegistrationDependencies,
): Promise<RegistrationResult> {
  // Scrypt is deliberately completed before the transaction so it never holds
  // a MariaDB connection or row lock during the expensive password work.
  const passwordHash = await dependencies.hashPassword(input.password);
  const connection = await database.getConnection();
  let transactionOpen = false;

  try {
    await connection.beginTransaction();
    transactionOpen = true;
    const existing = await connection.execute(
      "SELECT email, username FROM users WHERE email = :email OR username = :username LIMIT 1",
      { email: input.email, username: input.username },
    );
    const conflict = conflictFor(firstResultRows(existing), input);
    if (conflict) {
      await connection.rollback();
      transactionOpen = false;
      return { ok: false, error: conflict };
    }

    const id = dependencies.randomId();
    const token = dependencies.newSessionToken();
    await connection.execute(
      `INSERT INTO users (id, email, username, password_hash)
       VALUES (:id, :email, :username, :hash)`,
      {
        id,
        email: input.email,
        username: input.username,
        hash: passwordHash,
      },
    );
    await connection.execute(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES (:id, :uid, :exp)",
      { id: token, uid: id, exp: dependencies.sessionExpiry() },
    );
    await connection.commit();
    transactionOpen = false;
    return {
      ok: true,
      token,
      user: {
        id,
        email: input.email,
        username: input.username,
        isCreator: false,
      },
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await connection.rollback();
      } catch {
        return { ok: false, error: "failed" };
      }
      transactionOpen = false;
    }

    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      try {
        const existing = await connection.execute(
          "SELECT email, username FROM users WHERE email = :email OR username = :username LIMIT 1",
          { email: input.email, username: input.username },
        );
        const conflict = conflictFor(firstResultRows(existing), input);
        if (conflict) return { ok: false, error: conflict };
      } catch {
        // Fall through to the generic failure without exposing DB details.
      }
    }
    return { ok: false, error: "failed" };
  } finally {
    connection.release();
  }
}
