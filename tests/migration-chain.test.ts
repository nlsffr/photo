import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("fresh migration order defines URL lifecycle columns before sitemap indexes", async () => {
  const migrationsUrl = new URL("../migrations/", import.meta.url);
  const files = (await readdir(migrationsUrl))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const lifecycle = files.indexOf("009-public-url-lifecycle.sql");
  const sitemap = files.indexOf("012-sitemap-index.sql");
  assert.ok(lifecycle >= 0, "the URL lifecycle bootstrap migration must exist");
  assert.ok(sitemap > lifecycle, "URL lifecycle columns must precede sitemap indexes");

  const sql = await readFile(
    new URL("../migrations/009-public-url-lifecycle.sql", import.meta.url),
    "utf8",
  );
  assert.ok((sql.match(/ADD COLUMN IF NOT EXISTS url_version/g) ?? []).length === 2);
  assert.ok(
    (sql.match(/ADD COLUMN IF NOT EXISTS removed_from_index_at/g) ?? []).length === 2,
  );
  assert.match(sql, /idx_photos_url_version \(url_version\)/);
});

test("creator aggregates share the source identifier collation", async () => {
  const sql = await readFile(
    new URL("../migrations/013-creator-media-stats.sql", import.meta.url),
    "utf8",
  );

  assert.match(
    sql,
    /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/,
  );
});

test("premium migration preserves the subscription foreign-key index", async () => {
  const sql = await readFile(
    new URL("../migrations/017-telegram-stars-outbox.sql", import.meta.url),
    "utf8",
  );
  const replacement = sql.indexOf("CREATE INDEX IF NOT EXISTS idx_sub_user");
  const drop = sql.indexOf("DROP INDEX IF EXISTS uq_sub_user_active");

  assert.ok(replacement >= 0);
  assert.ok(drop > replacement, "the FK replacement index must exist before the unique key is dropped");
});
