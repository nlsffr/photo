import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type UploadRoute = { POST(request: Request): Promise<Response> };

for (const contentType of ["multipart/form-data; boundary=fixture", "application/json", "application/octet-stream"]) {
  test(`unavailable upload refuses ${contentType} without reading or storing data`, async () => {
    let bodyReads = 0;
    let dataAccesses = 0;
    const route = loadAppModule<UploadRoute>("src/app/api/media/upload/route.ts", {
      "@/lib/photos": { getCreator: async () => { dataAccesses++; return null; } },
      "@/lib/db-pool": { getDbPool: () => {
        dataAccesses++;
        throw new Error("unavailable upload must not access storage");
      } },
    });
    const request = new Proxy(new Request("https://example.invalid/api/media/upload", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: "fixture body that must remain unread",
    }), {
      get(target, property) {
        if (["formData", "json", "text", "arrayBuffer", "blob", "bytes", "body", "clone"].includes(String(property))) {
          bodyReads++;
          throw new Error("unavailable upload must not read the body");
        }
        return Reflect.get(target, property, target);
      },
    });

    const response = await route.POST(request);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "upload_unavailable" });
    assert.equal(bodyReads, 0, "the upload body must remain unread");
    assert.equal(dataAccesses, 0, "no lookup, write or storage access is allowed");
  });
}

function page(locale: "fr" | "en", authenticated: boolean, loading = false) {
  const { default: AddMediaPage } = loadAppModule<{ default(): React.ReactNode }>(
    "src/app/(default)/add/page.tsx",
    {
      react: {
        useState: (initial: unknown) => [initial, () => {}],
        useEffect: () => {},
        useCallback: (callback: unknown) => callback,
      },
      "next/link": { __esModule: true, default: "a" },
      "@/components/LocaleProvider": { useLocale: () => ({ locale, t: (key: string) => key }) },
      "@/components/Session": { useSession: () => ({ user: authenticated ? { id: "fixture-user" } : null, loading }) },
    },
  );
  return renderToStaticMarkup(createElement(AddMediaPage));
}

for (const locale of ["fr", "en"] as const) {
  for (const authenticated of [false, true]) {
    test(`${locale} upload page explains unavailability for ${authenticated ? "members" : "guests"} without an upload form`, () => {
      const html = page(locale, authenticated);
      assert.match(html, locale === "fr" ? /envoi de médias est indisponible/ : /Media uploads are unavailable/);
      assert.doesNotMatch(html, /<form\b|<input\b|type="submit"|addMedia\.(intro|guestBody|uploadSuccess)/);
      assert.match(html, /<h1\b/);
      if (!authenticated) {
        assert.ok(html.includes(`/${locale}/connexion?next=%2F${locale}%2Fadd`), "the account link keeps the current language and return path");
      }
    });
  }
}

test("upload unavailability remains visible while the account session loads", () => {
  const html = page("en", false, true);
  assert.match(html, /Media uploads are unavailable/);
  assert.doesNotMatch(html, /<form\b|<input\b|type="submit"/);
});
