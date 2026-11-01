import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native test runner requires the extension.
import { activateSeoEditor, validActivationInput } from "../src/lib/seo-editor-activation.ts";

const token = "a".repeat(64);
function fixture(options: { found?: boolean; allowed?: boolean; locked?: boolean; updateRows?: number; fail?: boolean } = {}) {
  const state = { hashed: 0, committed: 0, rolledBack: 0, released: 0, statements: [] as string[] };
  const connection = {
    beginTransaction: async () => {},
    execute: async (sql: string) => {
      state.statements.push(sql);
      if (options.fail) throw new Error("do not expose connection secrets");
      if (sql.trim().startsWith("SELECT")) return [options.locked === false ? [] : [{ user_id: "owner" }], []];
      return [{ affectedRows: options.updateRows ?? 1 }, []];
    },
    commit: async () => { state.committed++; },
    rollback: async () => { state.rolledBack++; },
    release: () => { state.released++; },
  };
  const database = {
    execute: async () => [options.found === false ? [] : [{ user_id: "owner" }], []],
    getConnection: async () => connection,
  };
  const dependencies = {
    isAllowed: (id: string) => options.allowed !== false && id === "owner",
    hashPassword: async () => { state.hashed++; return "hashed-value"; },
    newSessionToken: () => "b".repeat(64),
    sessionExpiry: () => new Date("2026-12-01T00:00:00Z"),
  };
  return { state, database, dependencies };
}

test("activation rejects malformed tokens and weak input without database or hashing", async () => {
  assert.equal(validActivationInput({ token, password: "long-password-example" }), true);
  for (const input of [{ token: "short", password: "long-password-example" }, { token, password: "short" }, { token, password: "a".repeat(201) }, { token, password: 123 }]) {
    assert.equal(validActivationInput(input), false);
    const f = fixture();
    assert.deepEqual(await activateSeoEditor(f.database, input, f.dependencies), { ok: false, error: "invalid" });
    assert.equal(f.state.hashed, 0);
    assert.equal(f.state.statements.length, 0);
  }
});

test("unknown or unauthorized invitations do not perform expensive hashing", async () => {
  for (const options of [{ found: false }, { allowed: false }]) {
    const f = fixture(options);
    assert.deepEqual(await activateSeoEditor(f.database, { token, password: "long-password-example" }, f.dependencies), { ok: false, error: "invalid" });
    assert.equal(f.state.hashed, 0);
    assert.equal(f.state.committed, 0);
  }
});

test("activation atomically initializes a password, consumes the invitation and creates the session", async () => {
  const f = fixture();
  const result = await activateSeoEditor(f.database, { token, password: "long-password-example" }, f.dependencies);
  assert.deepEqual(result, { ok: true, token: "b".repeat(64) });
  assert.equal(f.state.committed, 1);
  assert.equal(f.state.released, 1);
  assert.match(f.state.statements[0], /FOR UPDATE/);
  assert.match(f.state.statements.join("\n"), /password_hash IS NULL/);
  assert.match(f.state.statements.join("\n"), /INSERT INTO sessions/);
});

test("consumed invitations and compare-and-set races rollback without a session", async () => {
  for (const options of [{ locked: false }, { updateRows: 0 }]) {
    const f = fixture(options);
    assert.deepEqual(await activateSeoEditor(f.database, { token, password: "long-password-example" }, f.dependencies), { ok: false, error: "invalid" });
    assert.equal(f.state.committed, 0);
    assert.equal(f.state.rolledBack, 1);
    assert.equal(f.state.released, 1);
    assert.equal(f.state.statements.some(sql => sql.includes("INSERT INTO sessions")), false);
  }
});

test("database failures stay generic and release the transaction", async () => {
  const f = fixture({ fail: true });
  assert.deepEqual(await activateSeoEditor(f.database, { token, password: "long-password-example" }, f.dependencies), { ok: false, error: "unavailable" });
  assert.equal(f.state.committed, 0);
  assert.equal(f.state.rolledBack, 1);
  assert.equal(f.state.released, 1);
});
