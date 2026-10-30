import assert from "node:assert/strict";
import test from "node:test";

async function loadAsyncOnce() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/async-once.ts");
  } catch (error) {
    assert.fail(`async once helper is unavailable: ${String(error)}`);
  }
}

test("concurrent callers wait for the same initialization", async () => {
  const { createAsyncOnce } = await loadAsyncOnce();
  let calls = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ensure = createAsyncOnce(async () => {
    calls += 1;
    await pending;
    return "ready";
  });

  const first = ensure();
  const second = ensure();
  assert.equal(calls, 1);
  release?.();

  assert.deepEqual(await Promise.all([first, second]), ["ready", "ready"]);
  assert.equal(await ensure(), "ready");
  assert.equal(calls, 1);
});
