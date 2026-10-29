import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rankings reuse active creator aggregates instead of scanning every photo", async () => {
  const provider = await readFile(
    new URL("../src/lib/providers/mariadb.ts", import.meta.url),
    "utf8",
  );
  const rankings = provider.slice(provider.indexOf("async getRankings"));

  assert.match(
    rankings,
    /LEFT JOIN creator_media_stats stats ON stats\.creator_id = c\.id/,
  );
  assert.match(rankings, /COALESCE\(stats\.total_views, 0\) AS views/);
  assert.match(rankings, /COALESCE\(stats\.total_likes, 0\) AS likes/);
  assert.match(
    rankings,
    /COALESCE\(stats\.photo_count, 0\) > 0 OR COALESCE\(c\.followers_count,\s*0\) > 0/,
  );
  assert.doesNotMatch(rankings, /JOIN photos/);
  assert.doesNotMatch(rankings, /SUM\(/);
  assert.doesNotMatch(rankings, /GROUP BY/);
});
