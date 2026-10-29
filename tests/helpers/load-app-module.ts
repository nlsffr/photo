import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
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
      fileName: filename,
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
        existsSync(candidate),
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
