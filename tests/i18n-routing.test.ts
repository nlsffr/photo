// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES as ACTIVE_LOCALES } from "../src/lib/i18n/config.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement } from "react";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

async function loadConfig() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/config.ts");
}

test("bare pages keep their public URL regardless of the negotiated or saved language", async () => {
  const { localeRedirectTarget, LOCALIZED_ROUTE_PATHS } = await loadConfig();
  for (const pathname of LOCALIZED_ROUTE_PATHS) {
    for (const locale of ACTIVE_LOCALES) {
      assert.equal(localeRedirectTarget(pathname, locale, "fr-FR"), null, pathname);
    }
  }
});

test("only known historical locale URLs have a bare redirect target", async () => {
  const { localeRedirectTarget } = await loadConfig();
  for (const locale of ACTIVE_LOCALES) {
    assert.equal(localeRedirectTarget(`/${locale}`, "fr", "de"), locale === "en" ? "/" : null);
    assert.equal(localeRedirectTarget(`/${locale}/models`, "en", "fr"), locale === "en" ? "/models" : null);
    assert.equal(localeRedirectTarget(`/${locale}/aria-lune-v3/videos`, "en", "fr"), "/aria-lune-v3/videos");
  }
  for (const pathname of ["/api/healthz", "/_next/image", "/sitemap.xml", "/creator-handle", "/creator-handle/media-id", "/tag/portrait", "/fr/api/healthz", "/fr/en/models", "/fr/tag/portrait"]) {
    assert.equal(localeRedirectTarget(pathname, "fr", "fr"), null, pathname);
  }
});

test("public URLs localize only discoveries while private renderer addresses remain explicit", async () => {
  const { LOCALIZED_ROUTE_PATHS, isDiscoveryPath, localePath, internalLocalePath } = await loadConfig();
  for (const pathname of LOCALIZED_ROUTE_PATHS) {
    assert.equal(localePath("fr", pathname), isDiscoveryPath(pathname) ? `/fr${pathname === "/" ? "" : pathname}` : pathname);
    assert.equal(localePath("en", pathname), pathname);
    assert.equal(internalLocalePath("fr", pathname), `/fr${pathname === "/" ? "" : pathname}`);
    assert.equal(internalLocalePath("en", pathname), `/en${pathname === "/" ? "" : pathname}`);
  }
});

test("twelve-language discovery dispatch remains available behind internal renderers with functional English fallback", async () => {
  const { DISCOVERY_ROUTE_PATHS, LOCALIZED_ROUTE_PATHS, resolveLocalizedPage, supportedLocaleForPath } = await loadConfig();
  for (const locale of ACTIVE_LOCALES.filter(locale => locale !== "en" && locale !== "fr")) {
    for (const pathname of DISCOVERY_ROUTE_PATHS) {
      assert.equal(supportedLocaleForPath(locale, pathname), locale);
      assert.deepEqual(resolveLocalizedPage(locale, pathname), { kind: "static", pathname });
    }
    for (const pathname of LOCALIZED_ROUTE_PATHS) {
      if (DISCOVERY_ROUTE_PATHS.includes(pathname as (typeof DISCOVERY_ROUTE_PATHS)[number])) continue;
      assert.equal(supportedLocaleForPath(locale, pathname), "en");
      assert.equal(resolveLocalizedPage(locale, pathname), null);
      assert.deepEqual(resolveLocalizedPage("en", pathname), { kind: "static", pathname });
    }
  }
});

test("each new locale wrapper forwards the exact catch-all path and locale", async () => {
  type Route = {
    default: (props: {
      params: Promise<{ path?: string[] }>;
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<ReactElement<{ locale: string; pathname: string }>>;
    generateMetadata: (props: {
      params: Promise<{ path?: string[] }>;
      searchParams: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<{ title: string }>;
  };

  for (const locale of ACTIVE_LOCALES.filter(locale => locale !== "en" && locale !== "fr")) {
    const route = loadAppModule<Route>(
      `src/app/(${locale})/${locale}/[[...path]]/page.tsx`,
      {
        "@/features/i18n/LocalizedPage": {
          LocalizedPage: () => null,
          localizedPageMetadata: async (actualLocale: string, pathname: string) => ({
            title: `${actualLocale}:${pathname}`,
          }),
        },
      },
    );
    const props = {
      params: Promise.resolve({ path: ["trending-medias"] }),
      searchParams: Promise.resolve({}),
    };
    const tree = await route.default(props);

    assert.equal(isValidElement(tree), true);
    assert.equal(tree.props.locale, locale);
    assert.equal(tree.props.pathname, "/trending-medias");
    assert.deepEqual(await route.generateMetadata(props), {
      title: `${locale}:/trending-medias`,
    });
  }
});
