import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import React from "react";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const same = (a: unknown[] | undefined, b: unknown[] | undefined) => Boolean(a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i])));

function hookHarness() {
  let cursor = 0;
  const cells: unknown[] = [];
  let effects: Array<() => void> = [];
  const hooks = { ...React,
    useState: (initial: unknown) => { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === "function" ? initial() : initial; return [cells[i], (value: unknown) => { cells[i] = typeof value === "function" ? value(cells[i]) : value; }]; },
    useRef: (initial: unknown) => { const i = cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; },
    useCallback: (callback: unknown, deps: unknown[]) => { const i = cursor++; const old = cells[i] as { deps: unknown[]; callback: unknown } | undefined; if (!old || !same(old.deps, deps)) cells[i] = { deps, callback }; return (cells[i] as { callback: unknown }).callback; },
    useEffect: (callback: () => void | (() => void), deps: unknown[]) => { const i = cursor++; const old = cells[i] as { deps: unknown[]; cleanup?: () => void } | undefined; if (!old || !same(old.deps, deps)) { const next = { deps, cleanup: undefined as (() => void) | undefined }; cells[i] = next; effects.push(() => { old?.cleanup?.(); next.cleanup = callback() || undefined; }); } },
  };
  return { hooks,
    render<T>(component: () => T) { cursor = 0; const result = component(); const next = effects; effects = []; next.forEach(effect => effect()); return result; },
    close() { for (const cell of cells) (cell as { cleanup?: () => void } | null)?.cleanup?.(); },
  };
}

type Snapshot = { isPremium: boolean; ready: boolean; refresh: () => Promise<void>; setPremium: (value: boolean) => void };
const status = (id: string, isPremium: boolean) => Response.json({ isPremium, user: { id, email: "member@example.test" } });
function setup(t: TestContext, initial: () => Promise<Response>) {
  const hooks = hookHarness();
  const old = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document };
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  Object.assign(globalThis, { window, document });
  let user: { id: string } | null = { id: "member-a" }, loading = false, transport = initial;
  globalThis.fetch = async () => transport();
  const { PremiumProvider } = loadAppModule<{ PremiumProvider: (props: { children: React.ReactNode }) => React.ReactElement<{ value: Snapshot }> }>("src/components/Premium.tsx", {
    react: hooks.hooks,
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "./Session": { useSession: () => ({ user, loading }) },
  });
  t.after(() => { hooks.close(); Object.assign(globalThis, old); });
  return {
    render: () => hooks.render(() => PremiumProvider({ children: null })).props.value,
    transport: (next: typeof transport) => { transport = next; },
    session: (id: string | null, pending = false) => { user = id ? { id } : null; loading = pending; },
    event: (type: "focus" | "pageshow" | "visibilitychange") => { (type === "visibilitychange" ? document : window).dispatchEvent(new Event(type)); },
    document,
  };
}

test("an unverified or failed entitlement never authorizes a legacy advertisement", async t => {
  const ui = setup(t, async () => { throw new TypeError("network"); });
  assert.equal(ui.render().ready, false);
  await flush();
  assert.equal(ui.render().ready, false);
});

test("a confirmed Premium entitlement survives a failed refresh without showing ads", async t => {
  const ui = setup(t, async () => status("member-a", true)); ui.render(); await flush();
  assert.equal(ui.render().isPremium, true);
  ui.transport(async () => new Response(null, { status: 503 }));
  await ui.render().refresh();
  const value = ui.render();
  assert.equal(value.isPremium, true);
  assert.equal(value.ready, false);
});

test("a session change immediately hides legacy slots before the new entitlement resolves", async t => {
  const ui = setup(t, async () => status("member-a", false)); ui.render(); await flush();
  assert.equal(ui.render().ready, true);
  ui.session("member-b"); ui.transport(() => new Promise(() => {}));
  assert.equal(ui.render().ready, false);
});

test("a normal in-flight same-session recheck does not revoke an already verified ad policy", async t => {
  const ui = setup(t, async () => status("member-a", false)); ui.render(); await flush();
  assert.equal(ui.render().ready, true);
  ui.transport(() => new Promise(() => {})); ui.event("focus");
  assert.equal(ui.render().ready, true);
});

test("an old session response cannot overwrite the current Premium entitlement", async t => {
  let finish!: (value: Response) => void;
  const ui = setup(t, () => new Promise(resolve => { finish = resolve; })); ui.render();
  ui.session("member-b"); ui.transport(async () => status("member-b", true)); ui.render(); await flush();
  assert.equal(ui.render().isPremium, true);
  finish(status("member-a", false)); await flush();
  assert.equal(ui.render().isPremium, true);
  assert.equal(ui.render().ready, true);
});

test("a mismatched session payload cannot classify the current member as non-Premium", async t => {
  const ui = setup(t, async () => status("other-member", false)); ui.render(); await flush();
  assert.equal(ui.render().ready, false);
});

test("a pending pre-payment status cannot undo the explicit confirmed entitlement", async t => {
  let finish!: (value: Response) => void;
  const ui = setup(t, () => new Promise(resolve => { finish = resolve; }));
  ui.render().setPremium(true);
  finish(status("member-a", false)); await flush();
  assert.equal(ui.render().isPremium, true);
  assert.equal(ui.render().ready, true);
});

for (const type of ["focus", "pageshow", "visibilitychange"] as const) {
  test(`returning through ${type} rechecks an entitlement activated in another tab`, async t => {
    const ui = setup(t, async () => status("member-a", false)); ui.render(); await flush();
    assert.equal(ui.render().isPremium, false);
    ui.transport(async () => status("member-a", true)); ui.event(type); await flush();
    assert.equal(ui.render().isPremium, true);
  });
}

test("a new explicit non-Premium status still expires the previous Premium entitlement", async t => {
  const ui = setup(t, async () => status("member-a", true)); ui.render(); await flush();
  ui.transport(async () => status("member-a", false)); await ui.render().refresh();
  assert.equal(ui.render().isPremium, false);
  assert.equal(ui.render().ready, true);
});

test("logging out clears the old member entitlement and resolves the guest without a status request", async t => {
  const ui = setup(t, async () => status("member-a", true)); ui.render(); await flush();
  let requests = 0; ui.transport(async () => { requests++; return status("member-a", true); }); ui.session(null); ui.render();
  assert.equal(ui.render().isPremium, false);
  assert.equal(ui.render().ready, true);
  assert.equal(requests, 0);
});
