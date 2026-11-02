import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native test loader needs the extension.
import { loadAppModule } from "./helpers/load-app-module.ts";

test("private editor sends guests to login and refuses other accounts", async () => {
  for (const kind of ["guest", "other", "owner"]) {
    const page = loadAppModule<{ default(): Promise<{ type: unknown }>; metadata: { robots: { index: boolean } } }>(
      "src/app/(default)/admin/seo/page.tsx", {
        "next/headers": { cookies: async () => ({ get: () => kind === "guest" ? undefined : { value: "fixture" } }) },
        "next/navigation": { redirect: (path: string) => { throw Error(`redirect:${path}`); }, notFound: () => { throw Error("notFound"); } },
        "@/lib/auth": { SESSION_COOKIE: "session" },
        "@/lib/auth-db": { getSessionUser: async () => ({ id: kind }) },
        "@/lib/seo-editor-access": { isSeoEditorId: (id: string) => id === "owner" },
        "@/components/SeoEditor": { SeoEditor: "fixture-editor" },
      },
    );
    assert.equal(page.metadata.robots.index, false);
    if (kind === "guest") await assert.rejects(page.default(), /redirect:\/connexion\?next=%2Fadmin%2Fseo/);
    else if (kind === "other") await assert.rejects(page.default(), /notFound/);
    else assert.equal((await page.default()).type, "fixture-editor");
  }
});

test("activation rejects cross-site calls before reading a token", async () => {
  let called = false;
  const route = loadAppModule<{ POST(request: Request): Promise<Response> }>("src/app/api/admin/seo/activate/route.ts", {
    "next/headers": {}, "@/lib/auth": {}, "@/lib/db-pool": {},
    "@/lib/seo-editor-activation": {}, "@/lib/ratelimit": {},
    "@/lib/seo-editor-access": { hasSeoWriteOrigin: () => false, readSeoEditorJson: () => { called = true; } },
  });
  const response = await route.POST(new Request("https://example.test/api/admin/seo/activate", { method: "POST" }));
  assert.equal(response.status, 403); assert.equal(called, false);
});

test("successful activation issues only the existing protected session cookie", async () => {
  const cookies: unknown[][] = [];
  const route = loadAppModule<{ POST(request: Request): Promise<Response> }>("src/app/api/admin/seo/activate/route.ts", {
    "next/headers": { cookies: async () => ({ set: (...args: unknown[]) => cookies.push(args) }) },
    "@/lib/auth": { SESSION_COOKIE: "fixture-session", SESSION_TTL_DAYS: 30 },
    "@/lib/db-pool": { getDbPool: () => ({}) },
    "@/lib/seo-editor-activation": { activateSeoEditor: async () => ({ ok: true, token: "private-session" }) },
    "@/lib/ratelimit": { rateLimitRequest: () => ({ allowed: true }), sweep: () => {} },
    "@/lib/seo-editor-access": { hasSeoWriteOrigin: () => true, readSeoEditorJson: async () => ({}), isSeoEditorId: () => true },
  });
  const env = process.env as Record<string, string | undefined>;
  const original = env.NODE_ENV; env.NODE_ENV = "production";
  try {
    const response = await route.POST(new Request("https://example.test/api/admin/seo/activate", { method: "POST" }));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
    assert.equal(cookies.length, 1);
    assert.equal((cookies[0][2] as { httpOnly: boolean }).httpOnly, true);
    assert.equal((cookies[0][2] as { secure: boolean }).secure, true);
    assert.equal((cookies[0][2] as { sameSite: string }).sameSite, "lax");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  } finally { if (original === undefined) delete env.NODE_ENV; else env.NODE_ENV = original; }
});
