import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
import type { SeoEditorEntry, SeoLocale, SeoPageKey } from "../src/lib/seo-editor-contract";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
test("editor defaults equal the current fully resolved metadata in every localized layout", () => {
  const { getSeoDefault } = loadAppModule<{ getSeoDefault(locale: SeoLocale, page: SeoPageKey): SeoEditorEntry }>("src/lib/seo-editor-defaults.ts");
  const { getDictionary } = loadAppModule<{ getDictionary(locale: SeoLocale): { pages: Record<SeoPageKey, { meta: { title: string; description: string } }> } }>("src/lib/i18n/dictionaries.ts");
  for (const locale of ["en", "fr", "es", "de", "it", "pt", "nl"] as const) {
    const source = readFileSync(resolve(`src/app/(${locale})/layout.tsx`), "utf8");
    const ast = ts.createSourceFile("layout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let template: string | undefined;
    function visit(node: ts.Node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "template" && ts.isStringLiteral(node.initializer)) template = node.initializer.text;
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(typeof template, "string");
    for (const page of ["home", "models", "trending", "mostLiked", "rankings", "influencers"] as const) {
      const copy = getDictionary(locale).pages[page].meta, entry = getSeoDefault(locale, page);
      assert.equal(hash(entry.title), hash(page === "home" ? copy.title : template!.replace(/%s/g, copy.title)), `${locale}/${page} title hash`);
      assert.equal(hash(entry.description), hash(copy.description), `${locale}/${page} description hash`);
      assert.equal(entry.revision, 0);
      assert.equal(entry.updatedAt, null);
      assert.equal(entry.source, "default");
    }
  }
});
