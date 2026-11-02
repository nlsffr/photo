import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const input = { page: "home", locale: "fr", title: "Fixture title", description: "Fixture description", revision: 0 };
type Route = { GET(): Promise<Response>; PUT(request: Request): Promise<Response> };
function route(options: { user?: { id: string } | null; allowed?: boolean; result?: object; revalidationFails?: boolean } = {}) {
  const writes: unknown[] = [], invalidated: string[] = [];
  const access = loadAppModule<Record<string, unknown>>("src/lib/seo-editor-access.ts", {
    "server-only": {}, "next/headers": {}, "./auth-db": {},
  });
  const api = loadAppModule<Route>("src/app/api/admin/seo/route.ts", {
    "@/lib/seo-editor-access": { ...access, getSeoEditorSessionUser: async () => options.user, isSeoEditorId: () => options.allowed ?? true },
    "@/lib/seo-editor-store": {
      listSeoEntries: async () => [],
      validateSeoSave: (value: unknown) => value && typeof value === "object" && Object.hasOwn(value, "title") ? value : null,
      saveSeoEntry: async (...values: unknown[]) => { writes.push(values); return options.result ?? { ok: true, entry: { ...input, revision: 1, source: "saved" } }; },
    },
    "next/cache": { revalidatePath: (path: string) => {
      invalidated.push(path);
      if (options.revalidationFails) throw new Error("sensitive framework failure");
    } },
  });
  return { ...api, writes, invalidated };
}
function request(body: unknown = input, origin = "https://fixture.example") {
  return new Request("https://fixture.example/api/admin/seo", { method: "PUT", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
}

test("SEO API denies missing sessions and non-owner accounts on both reads and writes", async () => {
  for (const [user, allowed, expected] of [[null, true, 401], [{ id: "someone" }, false, 403]] as const) {
    const api = route({ user, allowed });
    assert.equal((await api.GET()).status, expected);
    assert.equal((await api.PUT(request())).status, expected);
    assert.equal(api.writes.length, 0);
  }
});

test("SEO writes reject foreign or absent Origin, malformed JSON and oversized streamed bodies", async () => {
  const api = route({ user: { id: "owner" } });
  assert.equal((await api.PUT(request(input, "https://foreign.example"))).status, 403);
  const absent = new Request("https://fixture.example/api/admin/seo", { method: "PUT", body: JSON.stringify(input) });
  assert.equal((await api.PUT(absent)).status, 403);
  const malformed = new Request("https://fixture.example/api/admin/seo", { method: "PUT", headers: { origin: "https://fixture.example", "content-type": "application/json" }, body: "{" });
  assert.equal((await api.PUT(malformed)).status, 400);
  assert.equal((await api.PUT(request({ ...input, title: "x".repeat(17_000) }))).status, 413);
  assert.equal(api.writes.length, 0);
});

test("configured canonical origin wins over a reflected request host", async () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://canonical.example";
  try {
    const api = route({ user: { id: "owner" } });
    assert.equal((await api.PUT(request())).status, 403);
    assert.equal((await api.PUT(request(input, "https://canonical.example"))).status, 200);
    assert.equal(api.writes.length, 1);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = previous; }
});

test("invalid UTF-8, non-JSON bodies and invalid payloads never reach persistence", async () => {
  const api = route({ user: { id: "owner" } });
  const headers = { origin: "https://fixture.example", "content-type": "application/json" };
  const malformed = new Request("https://fixture.example/api/admin/seo", { method: "PUT", headers, body: new Uint8Array([0xff, 0xfe]) });
  assert.equal((await api.PUT(malformed)).status, 400);
  const wrongType = new Request("https://fixture.example/api/admin/seo", { method: "PUT", headers: { ...headers, "content-type": "text/plain" }, body: JSON.stringify(input) });
  assert.equal((await api.PUT(wrongType)).status, 415);
  assert.equal((await api.PUT(request({}))).status, 400);
  assert.equal(api.writes.length, 0);
});

test("production with no canonical origin fails closed", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousSite = env.NEXT_PUBLIC_SITE_URL, previousMode = env.NODE_ENV;
  delete env.NEXT_PUBLIC_SITE_URL;
  env.NODE_ENV = "production";
  try {
    const access = loadAppModule<{ hasSeoWriteOrigin(request: Request): boolean }>("src/lib/seo-editor-access.ts", { "server-only": {}, "next/headers": {}, "./auth-db": {} });
    assert.equal(access.hasSeoWriteOrigin(request()), false);
  } finally {
    if (previousSite === undefined) delete env.NEXT_PUBLIC_SITE_URL; else env.NEXT_PUBLIC_SITE_URL = previousSite;
    if (previousMode === undefined) delete env.NODE_ENV; else env.NODE_ENV = previousMode;
  }
});

test("save replies invalidate the affected renderer and its single public URL", async () => {
  const api = route({ user: { id: "owner" } });
  const response = await api.PUT(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entry.revision, 1);
  assert.deepEqual(api.invalidated, ["/fr", "/"]);
  assert.equal(api.writes.length, 1);
});

test("English edits also invalidate the unprefixed route and conflicts do not invalidate", async () => {
  const api = route({ user: { id: "owner" } });
  await api.PUT(request({ ...input, locale: "en", page: "models" }));
  assert.deepEqual(api.invalidated, ["/en/models", "/models"]);
  const conflict = route({ user: { id: "owner" }, result: { ok: false, error: "conflict" } });
  assert.equal((await conflict.PUT(request())).status, 409);
  assert.equal(conflict.invalidated.length, 0);
});

test("non-English discovery edits invalidate the same public page without changing saved copy", async () => {
  const api = route({ user: { id: "owner" } });
  const edited = { ...input, locale: "es", page: "models" };
  assert.equal((await api.PUT(request(edited))).status, 200);
  assert.deepEqual(api.invalidated, ["/es/models", "/models"]);
  assert.deepEqual(api.writes[0], [edited, "owner"]);
});

test("a post-commit invalidation failure still returns the saved revision without retrying writes", async () => {
  const api = route({ user: { id: "owner" }, revalidationFails: true });
  const response = await api.PUT(request({ ...input, locale: "en" }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.entry.revision, 1);
  assert.equal(payload.publicationPending, true);
  assert.equal(api.writes.length, 1);
  assert.doesNotMatch(JSON.stringify(payload), /sensitive|framework failure/);
});

test("SEO API reads are private and never cached", async () => {
  const api = route({ user: { id: "owner" } });
  const response = await api.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { entries: [] });
});

test("SEO owner allowlist uses exact account IDs and sessions", async () => {
  const previous = process.env.SEO_EDITOR_USER_IDS;
  process.env.SEO_EDITOR_USER_IDS = " owner-id , second-id ";
  const access = loadAppModule<{ isSeoEditorId(id: string): boolean; getSeoEditorUser(): Promise<unknown> }>("src/lib/seo-editor-access.ts", {
    "server-only": {}, "next/headers": { cookies: async () => ({ get: () => ({ value: "fixture-session" }) }) },
    "./auth-db": { getSessionUser: async () => ({ id: "owner-id" }) },
  });
  try {
    assert.equal(access.isSeoEditorId("owner-id"), true);
    assert.equal(access.isSeoEditorId("owner"), false);
    assert.equal(access.isSeoEditorId("owner-id@example.com"), false);
    assert.deepEqual(await access.getSeoEditorUser(), { id: "owner-id" });
    delete process.env.SEO_EDITOR_USER_IDS;
    assert.equal(access.isSeoEditorId("owner-id"), false);
    assert.equal(await access.getSeoEditorUser(), null);
  } finally { if (previous === undefined) delete process.env.SEO_EDITOR_USER_IDS; else process.env.SEO_EDITOR_USER_IDS = previous; }
});
