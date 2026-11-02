import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import type { ReactNode } from "react";
// @ts-expect-error Native test loader needs the extension.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}

test("language choices are buttons that persist the preference before reloading the same query and fragment", (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let cookie = "";
  const reloadCookies: string[] = [];
  const location = { href: "https://example.test/models?page=2#items", protocol: "https:",
    pathname: "/models", search: "?page=2", hash: "#items", reload: () => reloadCookies.push(cookie) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { get cookie() { return cookie; }, set cookie(value: string) { cookie = value; } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
  });
  const { LanguageSwitcher } = loadAppModule<{ LanguageSwitcher(props: object): ReactNode }>("src/components/LocaleProvider.tsx", {
    react: { ...React, useState: () => [true, () => {}], useContext: () => ({ locale: "fr", t: (key: string) => key }) },
    "next/navigation": { usePathname: () => "/fr/models" },
  });
  const choices = nodes(LanguageSwitcher({})).filter((node) => node.type === "button" && node.props.lang);
  assert.equal(choices.length, 7);
  assert.equal(nodes(LanguageSwitcher({})).filter((node) => node.type === "a").length, 0);
  for (const choice of choices) {
    assert.equal(choice.props.type, "button");
    (choice.props.onClick as () => void)();
    assert.equal(cookie, `lfh_locale=${choice.props.lang};path=/;max-age=31536000;samesite=lax;secure`);
    assert.equal(reloadCookies.at(-1), cookie);
    assert.equal(location.href, "https://example.test/models?page=2#items");
  }
  assert.equal(reloadCookies.length, 7);
  location.protocol = "http:";
  (choices[0].props.onClick as () => void)();
  assert.ok(!cookie.includes(";secure"));
});
