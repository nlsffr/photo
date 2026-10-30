import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the production image includes the operator analytics report", async () => {
  const dockerfile = await readFile(
    new URL("../Dockerfile", import.meta.url),
    "utf8",
  );
  assert.match(
    dockerfile,
    /COPY --from=builder[^\n]*\/app\/scripts\/analytics-report\.mjs[^\n]*\.\/scripts\//,
  );
  assert.match(
    dockerfile,
    /mkdir -p \/ops-runtime[\s\S]*pnpm --dir \/ops-runtime add mysql2/,
  );
  assert.doesNotMatch(
    dockerfile,
    /pnpm --dir \/ops-runtime add mysql2[^\n]*--offline/,
  );
});

