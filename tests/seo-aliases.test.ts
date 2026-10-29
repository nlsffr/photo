import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
const modulePromise = import("../src/lib/creator-names.ts");
test("returns only deduplicated explicit real creator names", async () => {
  const { verifiedCreatorNames } = await modulePromise;
  assert.deepEqual(verifiedCreatorNames("alice", "Alice Example", ["A. Example", "Alice Example", " A. Example "]), ["alice", "Alice Example", "A. Example"]);
});
