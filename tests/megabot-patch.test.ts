import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const PATCHER = new URL(
  "../ops/patch-megabot-source-engagement.py",
  import.meta.url,
).pathname;

const fixture = `PASSWORD = "must-not-appear-in-diff"
SQL = """
INSERT INTO photos (
  width, height, views_count, likes_count, is_ai, file_size, source_id -- INLINE_SECRET=never-print-this
) VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  views_count = VALUES(views_count),
  likes_count = VALUES(likes_count)
"""
`;

const insertOnlyFixture = `PASSWORD = "must-not-appear-in-diff"
SQL = """
INSERT INTO photos (id, creator_id, title, description, image_url, video_url, type,
  duration_sec, width, height, views_count, likes_count, is_ai, file_size, source_id)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""
`;

test("MegaBot patch preview is secret-free and does not edit the worker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "megabot-patch-"));
  const target = join(directory, "megabot.py");
  await writeFile(target, fixture);

  const result = spawnSync("python3", [PATCHER, target], { encoding: "utf-8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /source_views_count/);
  assert.doesNotMatch(result.stdout, /must-not-appear-in-diff/);
  assert.doesNotMatch(result.stdout, /never-print-this/);
  assert.equal(await readFile(target, "utf-8"), fixture);
});

test("MegaBot patch changes only counter identifiers and preserves a backup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "megabot-patch-"));
  const target = join(directory, "megabot.py");
  await writeFile(target, fixture);
  await chmod(target, 0o600);
  const before = await stat(target);

  const result = spawnSync("python3", [PATCHER, target, "--write"], {
    encoding: "utf-8",
  });
  const patched = await readFile(target, "utf-8");
  const after = await stat(target);
  const backup = await stat(`${target}.before-source-engagement`);

  assert.equal(result.status, 0, result.stderr);
  assert.match(patched, /source_views_count, source_likes_count/);
  assert.match(patched, /source_views_count = VALUES\(source_views_count\)/);
  assert.match(patched, /source_likes_count = VALUES\(source_likes_count\)/);
  assert.match(patched, /VALUES \(\?, \?, \?, \?, \?, \?, \?\)/);
  assert.match(patched, /must-not-appear-in-diff/);
  assert.equal(after.mode & 0o777, 0o600);
  assert.equal(after.uid, before.uid);
  assert.equal(after.gid, before.gid);
  assert.equal(backup.mode & 0o777, 0o600);
  assert.deepEqual(
    (await readdir(directory)).filter((name) => name.includes(".tmp")),
    [],
  );
  assert.equal(
    await readFile(`${target}.before-source-engagement`, "utf-8"),
    fixture,
  );
});

test("MegaBot patch supports an insert-only worker without update clauses", async () => {
  const directory = await mkdtemp(join(tmpdir(), "megabot-patch-"));
  const target = join(directory, "megabot.py");
  await writeFile(target, insertOnlyFixture);

  const result = spawnSync("python3", [PATCHER, target, "--write"], {
    encoding: "utf-8",
  });
  const patched = await readFile(target, "utf-8");

  assert.equal(result.status, 0, result.stderr);
  assert.match(patched, /source_views_count, source_likes_count/);
  assert.doesNotMatch(patched, /source_views_count\s*=\s*VALUES/);
  assert.doesNotMatch(result.stdout, /must-not-appear-in-diff/);
  assert.equal(
    await readFile(`${target}.before-source-engagement`, "utf-8"),
    insertOnlyFixture,
  );
});

test("MegaBot patcher creates restrictive owned files and fsyncs atomically", async () => {
  const source = await readFile(PATCHER, "utf8");

  assert.match(source, /os\.O_CREAT\s*\|\s*os\.O_EXCL/);
  assert.match(source, /os\.fchmod/);
  assert.match(source, /os\.fchown/);
  assert.match(source, /os\.fsync/);
  assert.match(source, /tempfile\.mkstemp/);
  assert.doesNotMatch(source, /temporary\.write_text/);
});
