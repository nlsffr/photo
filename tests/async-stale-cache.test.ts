import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { createAsyncTtlCacheWithStale } from "../src/lib/async-ttl-cache.ts";

test("expired values stay available while one refresh runs", async () => {
  let now = 0;
  let calls = 0;
  let finish!: (value: string) => void;
  const load = createAsyncTtlCacheWithStale(
    async () => {
      calls++;
      if (calls === 1) return "first";
      return new Promise<string>((resolve) => { finish = resolve; });
    },
    100,
    () => now,
  );
  assert.deepEqual(await Promise.all([load(), load()]), ["first", "first"]);
  assert.equal(calls, 1);
  now = 101;
  assert.deepEqual(await Promise.all([load(), load()]), ["first", "first"]);
  assert.equal(calls, 2);
  finish("updated");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(await load(), "updated");
});

test("a failed refresh retains the valid value and backs off before retrying", async () => {
  let now = 0;
  let calls = 0;
  const load = createAsyncTtlCacheWithStale(
    async () => {
      calls++;
      if (calls === 2) throw new Error("database unavailable");
      return calls === 1 ? "valid" : "recovered";
    },
    100,
    () => now,
  );
  assert.equal(await load(), "valid");
  now = 101;
  assert.equal(await load(), "valid");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(await load(), "valid");
  assert.equal(calls, 2);
  now += 5_001;
  assert.equal(await load(), "valid");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(await load(), "recovered");
});

test("a cold failure is exposed and a later call can recover", async () => {
  let calls = 0;
  const load = createAsyncTtlCacheWithStale(async () => {
    if (++calls === 1) throw new Error("not ready");
    return "ready";
  }, 100);
  await assert.rejects(load(), /not ready/);
  assert.equal(await load(), "ready");
});

test("a successful recovery clears the failure backoff", async () => {
  let now = 0;
  let calls = 0;
  const load = createAsyncTtlCacheWithStale(async () => {
    if (++calls === 1) throw new Error("not ready");
    return calls;
  }, 100, () => now);
  await assert.rejects(load(), /not ready/);
  assert.equal(await load(), 2);
  now = 101;
  assert.equal(await load(), 2);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(await load(), 3);
});
