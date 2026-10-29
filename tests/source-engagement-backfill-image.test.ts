import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the runtime image includes the replayable engagement backfill", async () => {
  const [dockerfile, script] = await Promise.all([
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(
      new URL("../ops/backfill-source-engagement.mjs", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    dockerfile,
    /COPY --from=builder --chown=nextjs:nodejs \/app\/ops\/backfill-source-engagement\.mjs \.\/ops\/backfill-source-engagement\.mjs/,
  );
  assert.match(dockerfile, /FROM deps AS ops-deps/);
  assert.match(
    dockerfile,
    /pnpm --dir \/ops-runtime add mysql2@3\.23\.1 --prod --offline/,
  );
  assert.match(
    dockerfile,
    /COPY --from=ops-deps --chown=nextjs:nodejs \/ops-runtime\/node_modules \.\/node_modules/,
  );
  assert.match(script, /mysql\.createConnection\(databaseUrl\)/);
  assert.doesNotMatch(script, /uri:\s*databaseUrl/);
});
