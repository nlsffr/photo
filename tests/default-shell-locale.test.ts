import assert from "node:assert/strict";
import test from "node:test";
import type { ReactElement, ReactNode } from "react";
// @ts-expect-error Native Node requires the explicit suffix.
import { loadAppModule } from "./helpers/load-app-module.ts";

test("bare content uses the stable English shell even when a visitor previously selected another language", async () => {
  for (const cookieLocale of ["fr", "de", "nl", undefined]) {
    const { default: RootLayout } = loadAppModule<{
      default: (props: { children: ReactNode }) => Promise<ReactElement<{
        locale: string; dictionary: { shell: { navigation: { home: string } } };
      }>>;
    }>("src/app/(default)/layout.tsx", {
      "../globals.css": {},
      "next/headers": { cookies: async () => ({ get: () => ({ value: cookieLocale }) }) },
      "@/components/SiteRootLayout": { SiteRootLayout: () => null },
    });
    const tree = await RootLayout({ children: "Fixture content" });
    assert.equal(tree.props.locale, "en", `previous selection: ${cookieLocale}`);
    assert.equal(tree.props.dictionary.shell.navigation.home, "Home");
  }
});
