import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, chmod, readFile, stat, access, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { prepareSeoEditor } from "../ops/prepare-seo-editor.mjs";

function connection(existing = []) {
  return {
    calls: [], committed: 0, rolledBack: 0, started: 0,
    async beginTransaction() { this.started++; },
    async execute(sql, params) {
      this.calls.push({ sql, params });
      return sql.startsWith("SELECT") ? [existing] : [{ affectedRows: 1 }];
    },
    async commit() { this.committed++; },
    async rollback() { this.rolledBack++; },
  };
}

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "prepare-seo-editor-test-"));
  await chmod(directory, 0o700);
  try { await run(join(directory, "access.json"), directory); }
  finally { await rm(directory, { force: true, recursive: true }); }
}

const options = { email: "fixture-editor@example.test", siteUrl: "https://fixture.example" };

test("new account and hashed one-time invitation commit together into an exclusive private file", async () => {
  await fixture(async (outputFile) => {
    const db = connection();
    const before = Date.now();
    const result = await prepareSeoEditor({ ...options, outputFile }, db);
    const saved = JSON.parse(await readFile(outputFile, "utf8"));
    const url = new URL(saved.activationURL);
    const token = url.hash.slice(1);
    assert.equal(url.origin + url.pathname, "https://fixture.example/admin/seo/activate");
    assert.equal(url.search, "");
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(saved.editorUserId, result.editorUserId);
    assert.equal(result.activationRequired, true);
    assert.equal((await stat(outputFile)).mode & 0o777, 0o600);
    assert.ok(Date.parse(saved.expiresAt) >= before + 24 * 60 * 60 * 1000);
    assert.ok(Date.parse(saved.expiresAt) <= Date.now() + 24 * 60 * 60 * 1000);
    const user = db.calls.find(({ sql }) => sql.startsWith("INSERT INTO users"));
    assert.match(user.sql, /password_hash, username\) VALUES \(\?, \?, NULL, NULL\)/);
    assert.equal(user.params[1], options.email);
    const invite = db.calls.find(({ sql }) => sql.startsWith("INSERT INTO seo_editor_invites"));
    assert.equal(invite.params[0], createHash("sha256").update(token).digest("hex"));
    assert.equal(invite.params[1], result.editorUserId);
    assert.equal(JSON.stringify(db.calls).includes(token), false);
    assert.equal(JSON.stringify(result).includes(token), false);
    assert.equal(db.committed, 1);
    assert.equal(db.rolledBack, 0);
  });
});

test("existing password accounts keep their credentials and receive only the login URL", async () => {
  await fixture(async (outputFile) => {
    const db = connection([{ id: "existing-user", password_hash: "existing-hash" }]);
    const result = await prepareSeoEditor({ ...options, outputFile }, db);
    const saved = JSON.parse(await readFile(outputFile, "utf8"));
    assert.equal(result.editorUserId, "existing-user");
    assert.equal(result.activationRequired, false);
    assert.equal(saved.loginURL, "https://fixture.example/en/connexion?next=%2Fadmin%2Fseo");
    assert.equal(saved.activationURL, undefined);
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /FOR UPDATE/);
    assert.equal(db.committed, 1);
  });
});

test("passwordless existing accounts reuse the same ID without another users row", async () => {
  await fixture(async (outputFile) => {
    const db = connection([{ id: "existing-user", password_hash: null }]);
    await prepareSeoEditor({ ...options, outputFile }, db);
    assert.equal(db.calls.filter(({ sql }) => sql.startsWith("INSERT INTO users")).length, 0);
    assert.equal(db.calls.find(({ sql }) => sql.startsWith("INSERT INTO seo_editor_invites")).params[1], "existing-user");
  });
});

test("existing output, non-private directory and invalid site never start a transaction", async () => {
  await fixture(async (outputFile, directory) => {
    const db = connection();
    await writeFile(outputFile, "keep", { mode: 0o600 });
    await assert.rejects(prepareSeoEditor({ ...options, outputFile }, db));
    assert.equal(await readFile(outputFile, "utf8"), "keep");
    const other = join(directory, "other.json");
    await chmod(directory, 0o755);
    await assert.rejects(prepareSeoEditor({ ...options, outputFile: other }, db));
    await chmod(directory, 0o700);
    for (const siteUrl of ["http://fixture.example", "https://user:secret@fixture.example", "https://fixture.example?x=1", "https://fixture.example/#fragment"]) {
      await assert.rejects(prepareSeoEditor({ ...options, outputFile: other, siteUrl }, db));
    }
    await assert.rejects(prepareSeoEditor({ ...options, outputFile: "relative.json" }, db));
    assert.equal(db.started, 0);
  });
});

test("a failed invite rolls back its new account and removes only the empty reserved file", async () => {
  await fixture(async (outputFile) => {
    const db = connection();
    const execute = db.execute.bind(db);
    db.execute = async (sql, params) => {
      if (sql.startsWith("INSERT INTO seo_editor_invites")) throw Error("secret driver detail");
      return execute(sql, params);
    };
    await assert.rejects(prepareSeoEditor({ ...options, outputFile }, db));
    assert.equal(db.committed, 0);
    assert.equal(db.rolledBack, 1);
    await assert.rejects(access(outputFile));
  });
});

test("CLI errors contain only safe status codes and never echo arguments or credentials", () => {
  const result = spawnSync(process.execPath, ["ops/prepare-seo-editor.mjs", "--email", "private-argument", "--output", "/private-output.json"], {
    encoding: "utf8", env: { ...process.env, NEXT_PUBLIC_SITE_URL: "https://fixture.example", DATABASE_URL: "mysql://private-user:private-password@invalid.example/catalog" },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), { ok: false, error: "PREPARATION_FAILED" });
  assert.doesNotMatch(result.stderr, /private-argument|private-output|private-user|private-password/);
});
