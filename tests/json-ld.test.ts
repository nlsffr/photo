import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
const modulePromise = import("../src/lib/json-ld.ts");
test("escapes script-breaking less-than characters in JSON-LD", async () => {
  const { serializeJsonLd } = await modulePromise;
  assert.equal(serializeJsonLd({ name: "</script>" }), '{"name":"\\u003c/script>"}');
});
