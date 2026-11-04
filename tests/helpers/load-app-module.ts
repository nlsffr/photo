import { readFileSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const root = resolve(dirname(new URL(import.meta.url).pathname), "../..");

/** Executes real route modules; only external data and browser boundaries are replaced. */
export function loadAppModule<T>(
  path: string,
  replacements: Record<string, unknown> = {},
): T {
  const cache = new Map<string, { exports: unknown }>();
  function load(filename: string): unknown {
    const cached = cache.get(filename);
    if (cached) return cached.exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const output = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      // TypeScript preserves ESM for .mjs despite module:CommonJS; this harness executes CommonJS.
      fileName: filename.replace(/\.mjs$/, ".js"),
      transformers: { before: [context => sourceFile => {
        const visit: ts.Visitor = node => {
          if (ts.isPropertyAccessExpression(node) && node.name.text === "url"
            && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
            && node.expression.name.text === "meta") return ts.factory.createStringLiteral(pathToFileURL(filename).href);
          return ts.visitEachChild(node, visit, context);
        };
        return ts.visitNode(sourceFile, visit) as ts.SourceFile;
      }] },
    }).outputText;
    function localRequire(specifier: string): unknown {
      if (Object.hasOwn(replacements, specifier))
        return replacements[specifier];
      const base = specifier.startsWith("@/")
        ? resolve(root, "src", specifier.slice(2))
        : specifier.startsWith(".")
          ? resolve(dirname(filename), specifier)
          : null;
      if (!base) return nativeRequire(specifier);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) =>
        existsSync(candidate) && statSync(candidate).isFile(),
      );
      if (!resolved) throw new Error(`Module not found: ${base}`);
      return load(resolved);
    }
    new Function("require", "module", "exports", output)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    );
    return loadedModule.exports;
  }
  return load(resolve(root, path)) as T;
}
