import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement } from "react";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

async function loadConfig() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/config.ts");
}

test("unprefixed localized pages redirect using the persisted or negotiated locale", async () => {
  const { localeRedirectTarget } = await loadConfig();

  assert.equal(localeRedirectTarget("/", null, "fr-FR,fr;q=0.9"), "/fr");
  assert.equal(localeRedirectTarget("/", null, "es-ES,es;q=0.9"), "/es");
  assert.equal(localeRedirectTarget("/trending-medias", "nl", "en"), "/nl/trending-medias");
  assert.equal(localeRedirectTarget("/models", "en", "fr"), "/en/models");
  assert.equal(
    localeRedirectTarget("/contact/support", "fr", "en"),
    "/fr/contact/support",
  );
});

test("prefixed, system and content-detail URLs are left alone", async () => {
  const { localeRedirectTarget } = await loadConfig();

  for (const pathname of [
    "/en",
    "/fr/models",
    "/de/models",
    "/api/healthz",
    "/_next/image",
    "/sitemap.xml",
    "/creator-handle",
    "/creator-handle/media-id",
    "/tag/portrait",
  ]) {
    assert.equal(localeRedirectTarget(pathname, "fr", "fr"), null, pathname);
  }
});

test("every declared localized route has a deterministic English and French URL", async () => {
  const { LOCALIZED_ROUTE_PATHS, localePath, localeRedirectTarget } =
    await loadConfig();

  for (const pathname of LOCALIZED_ROUTE_PATHS) {
    assert.equal(localeRedirectTarget(pathname, "fr", null), localePath("fr", pathname));
    assert.equal(localeRedirectTarget(pathname, "en", null), localePath("en", pathname));
  }
});

test("new locales redirect only discovery routes and fall back to English elsewhere", async () => {
  const {
    DISCOVERY_ROUTE_PATHS,
    LOCALIZED_ROUTE_PATHS,
    localeRedirectTarget,
    resolveLocalizedPage,
  } = await loadConfig();

  for (const locale of ["es", "de", "it", "pt", "nl"] as const) {
    for (const pathname of DISCOVERY_ROUTE_PATHS) {
      assert.equal(
        localeRedirectTarget(pathname, locale, null),
        `/${locale}${pathname === "/" ? "" : pathname}`,
      );
      assert.deepEqual(resolveLocalizedPage(locale, pathname), {
        kind: "static",
        pathname,
      });
    }
    for (const pathname of LOCALIZED_ROUTE_PATHS) {
      if (
        DISCOVERY_ROUTE_PATHS.includes(
          pathname as (typeof DISCOVERY_ROUTE_PATHS)[number],
        )
      ) {
        continue;
      }
      assert.equal(localeRedirectTarget(pathname, locale, null), `/en${pathname}`);
      assert.equal(resolveLocalizedPage(locale, pathname), null);
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

  for (const locale of ["es", "de", "it", "pt", "nl"] as const) {
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
