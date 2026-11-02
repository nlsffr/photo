import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
// @ts-expect-error Node native type stripping needs a suffix.
import { loadAppModule } from "./helpers/load-app-module.ts";

type GridProps = { initialModels: never[]; initialHasMore: boolean; initialNextOffset: number | null; sort: "followers" | "views"; initialPage?: number; locale?: string };
function render(props: Partial<GridProps> = {}) {
  const { ModelsGrid } = loadAppModule<{ ModelsGrid: (props: GridProps) => ReturnType<typeof createElement> }>("src/components/ModelsGrid.tsx", {
    "next/link": ({ children, href, rel, className }: Record<string, unknown>) => createElement("a", { href, rel, className }, children as string),
    "./CreatorCard": { CreatorCard: () => null },
    "./LocaleProvider": { useLocale: () => ({ locale: "en", t: (key: string) => key }) },
  });
  return renderToStaticMarkup(createElement(ModelsGrid, { initialModels: [], initialHasMore: true, initialNextOffset: 60, sort: "followers", ...props }));
}

test("the first models page has a real next-page link in server HTML alongside load more", () => {
  const html = render();
  assert.match(html, /<nav\b/);
  assert.match(html, /<a\b[^>]*href="\/models\?page=2"/);
  assert.doesNotMatch(html, /rel="prev"/);
  assert.match(html, /<button\b[^>]*aria-controls="models-grid"/);
});

test("middle and final model pages keep sequential links and the selected sort", () => {
  const middle = render({ initialPage: 2, initialNextOffset: 120, sort: "views" });
  assert.match(middle, /href="\/models\?sort=views"/);
  assert.match(middle, /href="\/models\?sort=views&amp;page=3"/);
  const last = render({ initialPage: 3, initialHasMore: false, initialNextOffset: null });
  assert.match(last, /href="\/models\?page=2"/);
  assert.doesNotMatch(last, /rel="next"/);
});

test("models navigation never emits a next URL beyond the provider offset bound", () => {
  const html = render({ initialPage: 16667, initialNextOffset: 1_000_020 });
  assert.match(html, /href="\/models\?page=16666"/);
  assert.doesNotMatch(html, /page=16668/);
});
