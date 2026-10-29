import assert from "node:assert/strict";
import test from "node:test";

async function loadRegistrationFlow() {
  try {
    // @ts-expect-error Native type stripping needs the explicit suffix.
    return await import("../src/lib/auth-registration-flow.ts");
  } catch (error) {
    assert.fail(`auth registration flow is unavailable: ${String(error)}`);
  }
}

type UserRow = { id: string; email: string; username: string; passwordHash: string };
type SessionRow = { id: string; userId: string; expiresAt: Date };

class FakeRegistrationDb {
  users: UserRow[] = [];
  sessions: SessionRow[] = [];
  private readonly failSessionInsert: boolean;

  constructor(failSessionInsert = false) {
    this.failSessionInsert = failSessionInsert;
  }

  async getConnection() {
    let stagedUsers = this.users.map((row) => ({ ...row }));
    let stagedSessions = this.sessions.map((row) => ({ ...row }));
    return {
      beginTransaction: async () => {},
      execute: async (sql: string, params: Record<string, unknown>) => {
        if (sql.includes("SELECT email, username")) {
          const match = stagedUsers.find(
            (row) => row.email === params.email || row.username === params.username,
          );
          return [[...(match ? [{ email: match.email, username: match.username }] : [])]];
        }
        if (sql.includes("INSERT INTO users")) {
          stagedUsers.push({
            id: String(params.id),
            email: String(params.email),
            username: String(params.username),
            passwordHash: String(params.hash),
          });
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("INSERT INTO sessions")) {
          if (this.failSessionInsert) throw new Error("session insert failed");
          stagedSessions.push({
            id: String(params.id),
            userId: String(params.uid),
            expiresAt: params.exp as Date,
          });
          return [{ affectedRows: 1 }];
        }
        throw new Error(`unexpected SQL in fake: ${sql}`);
      },
      commit: async () => {
        this.users = stagedUsers;
        this.sessions = stagedSessions;
      },
      rollback: async () => {
        stagedUsers = this.users.map((row) => ({ ...row }));
        stagedSessions = this.sessions.map((row) => ({ ...row }));
      },
      release: () => {},
    };
  }
}

const dependencies = {
  hashPassword: async () => "hash",
  randomId: () => "11111111-1111-4111-8111-111111111111",
  newSessionToken: () => "a".repeat(64),
  sessionExpiry: () => new Date("2026-11-28T00:00:00.000Z"),
};

test("registration commits the account and its initial session atomically", async () => {
  const { registerWithSession } = await loadRegistrationFlow();
  const db = new FakeRegistrationDb();

  const result = await registerWithSession(
    db,
    { email: "person@example.com", username: "person", password: "password123" },
    dependencies,
  );

  assert.equal(result.ok, true);
  assert.equal(db.users.length, 1);
  assert.equal(db.sessions.length, 1);
  assert.equal(db.sessions[0]?.userId, db.users[0]?.id);
});

test("a failed initial session insert leaves no half-created account", async () => {
  const { registerWithSession } = await loadRegistrationFlow();
  const db = new FakeRegistrationDb(true);

  const result = await registerWithSession(
    db,
    { email: "person@example.com", username: "person", password: "password123" },
    dependencies,
  );

  assert.deepEqual(result, { ok: false, error: "failed" });
  assert.equal(db.users.length, 0);
  assert.equal(db.sessions.length, 0);
});
