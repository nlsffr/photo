import assert from "node:assert/strict";
import test from "node:test";

async function loadPolicy() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    return await import("../src/lib/db-pool-policy.ts");
  } catch (error) {
    assert.fail(`database pool policy is unavailable: ${String(error)}`);
  }
}

test("idle pool eviction closes MariaDB sessions gracefully", async () => {
  const { databasePoolPolicy } = await loadPolicy();

  const policy = databasePoolPolicy({ DB_POOL_SIZE: "10" });

  assert.equal(policy.gracefulEnd, true);
  assert.deepEqual(policy, {
    connectionLimit: 10,
    waitForConnections: true,
    namedPlaceholders: true,
    maxIdle: 4,
    idleTimeout: 30_000,
    enableKeepAlive: false,
    gracefulEnd: true,
  });
});

test("pool size stays bounded for invalid and oversized configuration", async () => {
  const { databasePoolPolicy } = await loadPolicy();

  assert.equal(databasePoolPolicy({ DB_POOL_SIZE: "invalid" }).connectionLimit, 10);
  assert.equal(databasePoolPolicy({ DB_POOL_SIZE: "0" }).connectionLimit, 10);
  assert.equal(databasePoolPolicy({ DB_POOL_SIZE: "500" }).connectionLimit, 32);
});
