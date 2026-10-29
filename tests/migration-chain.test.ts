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
