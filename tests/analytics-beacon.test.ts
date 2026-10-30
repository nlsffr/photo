import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type BeaconCall = { url: string; body: unknown };
type FetchCall = { url: RequestInfo | URL; options?: RequestInit };

function pageView(t: TestContext, beaconResult?: boolean) {
  const beacons: BeaconCall[] = [];
  const fetches: FetchCall[] = [];
  const effects: Array<() => void> = [];
  function replaceGlobal(key: string, value: unknown) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  replaceGlobal("navigator", {
    ...(beaconResult === undefined ? {} : {
      sendBeacon: (url: string, body: unknown) => {
        beacons.push({ url, body });
        return beaconResult;
      },
    }),
  });
  replaceGlobal("document", { referrer: "https://www.google.com/" });
  replaceGlobal("fetch", async (url: RequestInfo | URL, options?: RequestInit) => {
    fetches.push({ url, options });
    return new Response(null, { status: 204 });
  });
  const { AnalyticsBeacon } = loadAppModule<{ AnalyticsBeacon: () => null }>(
    "src/components/AnalyticsBeacon.tsx",
    {
      react: { useEffect: (effect: () => void) => effects.push(effect) },
      "next/navigation": {
        usePathname: () => "/de/models",
        useSearchParams: () => new URLSearchParams("page=2&utm_source=telegram"),
      },
    },
  );
  AnalyticsBeacon();
  effects[0]();
  return { beacons, fetches };
}

const expectedEvent = {
  event: "page_view",
  path: "/de/models",
  source: "telegram",
  referrer: "https://www.google.com/",
};

test("page views use a JSON Blob beacon and do not also issue a fetch", async (t) => {
  const { beacons, fetches } = pageView(t, true);
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].url, "/api/analytics");
  const body = beacons[0].body;
  assert.ok(body instanceof Blob, "a string would select Beacon's no-cors mode");
  assert.equal(body.type, "application/json");
  assert.deepEqual(JSON.parse(await body.text()), expectedEvent);
  assert.equal(fetches.length, 0);
});

for (const beaconResult of [false, undefined]) {
  test(`page views fall back to keepalive JSON fetch when Beacon is ${beaconResult === false ? "not queued" : "unavailable"}`, (t) => {
    const { beacons, fetches } = pageView(t, beaconResult);
    assert.equal(beacons.length, beaconResult === false ? 1 : 0);
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].url, "/api/analytics");
    const options = fetches[0].options;
    assert.equal(options?.method, "POST");
    assert.equal(new Headers(options?.headers).get("content-type"), "application/json");
    assert.equal(options?.keepalive, true);
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.cache, "no-store");
    assert.deepEqual(JSON.parse(String(options?.body)), expectedEvent);
  });
}
