import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import type { ReactNode } from "react";
import type { SeoEditorEntry } from "../src/lib/seo-editor-contract";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const pages = ["home", "models", "trending", "mostLiked", "rankings", "influencers"] as const;
const languages = ["en", "fr", "es", "de", "it", "pt", "nl"] as const;
const fixtures = (): SeoEditorEntry[] => pages.flatMap((page) => languages.map((locale) => ({
  page, locale, title: `Fixture ${page} ${locale}`, description: `Synthetic description ${page} ${locale}`,
  revision: 7, updatedAt: "2026-11-01T10:00:00Z", source: "saved" as const,
})));

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
function text(tree: ReactNode): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return React.isValidElement<{ children?: ReactNode }>(tree) ? text(tree.props.children) : "";
}
function view() {
  const state: unknown[] = [];
  const effects: Array<{ dependencies: unknown[]; cleanup?: () => void }> = [];
  let cursor = 0, effectCursor = 0;
  let pending: Array<() => void> = [];
  const { SeoEditor } = loadAppModule<{ SeoEditor: () => ReactNode }>("src/components/SeoEditor.tsx", {
    "next/link": { __esModule: true, default: "a" },
    react: {
      ...React,
      useId: () => "seo-test",
      useState(initial: unknown) {
        const slot = cursor++;
        if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
        return [state[slot], (next: unknown) => {
          state[slot] = typeof next === "function" ? next(state[slot]) : next;
        }];
      },
      useRef(initial: unknown) {
        const slot = cursor++;
        if (!(slot in state)) state[slot] = { current: initial };
        return state[slot];
      },
      useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
        const slot = effectCursor++;
        const prior = effects[slot];
        if (prior && dependencies.every((value, index) => Object.is(value, prior.dependencies[index]))) return;
        pending.push(() => {
          prior?.cleanup?.();
          effects[slot] = { dependencies, cleanup: effect() };
        });
      },
    },
  });
  let tree: ReactNode;
  function render() {
    cursor = effectCursor = 0;
    tree = SeoEditor();
    const current = pending;
    pending = [];
    current.forEach((effect) => effect());
    return tree;
  }
  function field(name: string) {
    const found = nodes(tree).find((node) => node.props.name === name);
    assert.ok(found, `field ${name}`);
    return found;
  }
  function button(label: string) {
    const found = nodes(tree).find((node) => node.type === "button" && text(node.props.children as ReactNode) === label);
    assert.ok(found, `button ${label}`);
    return found;
  }
  return {
    render, field, button, text: () => text(tree), nodes: () => nodes(tree),
    change(name: string, value: string) { (field(name).props.onChange as (event: unknown) => void)({ target: { value } }); render(); },
    async click(label: string) { await (button(label).props.onClick as () => unknown)(); render(); },
    async submit() {
      const form = nodes(tree).find((node) => node.type === "form");
      assert.ok(form);
      await (form.props.onSubmit as (event: unknown) => unknown)({ preventDefault() {} });
      render();
    },
    cleanup() { effects.forEach((effect) => effect.cleanup?.()); },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("editor preview sets the selected form language before opening the bare public page", async (t) => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let cookie = "";
  const opened: unknown[][] = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: { get cookie() { return cookie; }, set cookie(value: string) { cookie = value; } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { protocol: "https:" }, open: (...args: unknown[]) => opened.push([...args, cookie]) } });
  t.after(() => {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument); else Reflect.deleteProperty(globalThis, "document");
  });
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => { methods.push(init?.method ?? "GET"); return Response.json({ entries: fixtures() }); });
  const editor = view(); editor.render(); await settle(); editor.render();
  await editor.click("Deutsch");
  const title = editor.field("title").props.value;
  await editor.click("Ouvrir la page publiée ↗");
  assert.deepEqual(opened, [["/", "_blank", "noopener,noreferrer", "lfh_locale=de;path=/;max-age=31536000;samesite=lax;secure"]]);
  assert.equal(editor.field("title").props.value, title);
  assert.deepEqual(methods, ["GET"]);
  editor.cleanup();
});

test("editor loads all page/language choices and exposes labeled native controls", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ entries: fixtures() }));
  const editor = view(); editor.render(); await settle(); editor.render();
  assert.equal(editor.nodes().filter((node) => node.type === "option").length, 6);
  assert.equal(editor.nodes().filter((node) => node.type === "button" && typeof node.props["aria-pressed"] === "boolean").length, 7);
  assert.equal(editor.field("title").props.maxLength, 300);
  assert.equal(editor.field("description").props.maxLength, 2000);
  for (const name of ["title", "description", "page"]) {
    const field = editor.field(name);
    assert.ok(editor.nodes().some((node) => node.type === "label" && node.props.htmlFor === field.props.id));
  }
  assert.ok(editor.text().includes("Aperçu du site"));
  assert.equal(editor.button("Enregistrer sur le site").props.disabled, true);
  editor.cleanup();
});

test("failed saves preserve the draft even while switching language", async (t) => {
  const calls: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    calls.push(init ?? {});
    return init?.method === "PUT" ? Response.json({}, { status: 503 }) : Response.json({ entries: fixtures() });
  });
  const editor = view(); editor.render(); await settle(); editor.render();
  editor.change("title", "My synthetic draft");
  await editor.submit();
  assert.equal(editor.field("title").props.value, "My synthetic draft");
  assert.equal(editor.button("Enregistrer sur le site").props.disabled, false);
  await editor.click("English"); await editor.click("Français");
  assert.equal(editor.field("title").props.value, "My synthetic draft");
  assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
  editor.cleanup();
});

test("save uses current revision and undo creates another revision with previous text", async (t) => {
  const writes: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    if (init?.method !== "PUT") return Response.json({ entries: fixtures() });
    const payload = JSON.parse(String(init.body)); writes.push(payload);
    return Response.json({ entry: { ...payload, revision: Number(payload.revision) + 1, updatedAt: "2026-11-01T11:00:00Z", source: "saved" } });
  });
  const editor = view(); editor.render(); await settle(); editor.render();
  editor.change("title", "Changed synthetic title"); await editor.submit();
  assert.equal(writes[0].revision, 7);
  assert.equal(editor.field("title").props.value, "Changed synthetic title");
  assert.ok(editor.text().includes("Enregistré sur le site"));
  await editor.click("Annuler le dernier enregistrement");
  assert.equal(writes[1].revision, 8);
  assert.equal(writes[1].title, "Fixture home fr");
  assert.equal(editor.field("title").props.value, "Fixture home fr");
  assert.equal(editor.button("Annuler le dernier enregistrement").props.disabled, true);
  editor.cleanup();
});

test("a committed save with pending publication retains the new revision and never reports failure", async (t) => {
  const writes: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    if (init?.method !== "PUT") return Response.json({ entries: fixtures() });
    const payload = JSON.parse(String(init.body)); writes.push(payload);
    return Response.json({ entry: { ...payload, revision: Number(payload.revision) + 1, updatedAt: "2026-11-01T11:00:00Z", source: "saved" }, publicationPending: writes.length === 1 });
  });
  const editor = view(); editor.render(); await settle(); editor.render();
  editor.change("title", "First committed synthetic title"); await editor.submit();
  assert.equal(editor.field("title").props.value, "First committed synthetic title");
  assert.ok(editor.text().includes("Enregistré sur le serveur. L’actualisation de la page peut prendre quelques instants."));
  assert.equal(editor.nodes().some((node) => node.props.role === "alert"), false);
  assert.equal(editor.text().includes("Publié le"), false);
  assert.ok(editor.text().includes("Enregistré le"));
  editor.change("title", "Second committed synthetic title"); await editor.submit();
  assert.deepEqual(writes.map((write) => write.revision), [7, 8]);
  assert.ok(editor.text().includes("Publié le"));
  editor.cleanup();
});

test("conflict never forces a write and explicit reload keeps the draft with the new revision", async (t) => {
  let gets = 0; const writes: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const payload = JSON.parse(String(init.body)); writes.push(payload);
      return writes.length === 1 ? Response.json({}, { status: 409 }) : Response.json({ entry: { ...payload, revision: 10, updatedAt: "2026-11-01T11:00:00Z", source: "saved" } });
    }
    gets++;
    return Response.json({ entries: fixtures().map((entry) => gets > 1 ? { ...entry, revision: 9, title: "Another synthetic version" } : entry) });
  });
  const editor = view(); editor.render(); await settle(); editor.render();
  editor.change("title", "Preserved synthetic draft"); await editor.submit();
  assert.equal(writes.length, 1);
  assert.equal(editor.field("title").props.value, "Preserved synthetic draft");
  assert.equal(editor.button("Enregistrer sur le site").props.disabled, true);
  await editor.click("Charger la version actuelle");
  assert.equal(editor.field("title").props.value, "Preserved synthetic draft");
  assert.equal(writes.length, 1);
  await editor.submit();
  assert.equal(writes[1].revision, 9);
  editor.cleanup();
});

test("auth return path accepts internal destinations and rejects external or ambiguous paths", () => {
  const { safeAuthReturnPath } = loadAppModule<{ safeAuthReturnPath: (value: unknown, fallback: string) => string }>("src/lib/auth-return-path.ts");
  for (const value of ["/admin/seo", "/fr/premium?plan=monthly", "/"]) assert.equal(safeAuthReturnPath(value, "/fr"), value);
  for (const value of [null, "https://example.invalid", "//example.invalid", "/\\example.invalid", "/%5cexample.invalid", "/%2fexample.invalid", "/a/..//example.invalid", "/%0aexample.invalid", " /admin/seo", "/bad%escape"]) assert.equal(safeAuthReturnPath(value, "/fr"), "/fr");
});

test("empty draft fields block submission and expose an accessible error", async (t) => {
  const writes: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT") writes.push(init.body);
    return Response.json({ entries: fixtures() });
  });
  const editor = view(); editor.render(); await settle(); editor.render();
  editor.change("title", "   "); await editor.submit();
  assert.equal(writes.length, 0);
  assert.equal(editor.field("title").props["aria-invalid"], true);
  assert.ok(editor.nodes().some((node) => node.props.role === "alert"));
  editor.cleanup();
});

test("client errors never expose server details or accept a stale success response", async (t) => {
  const client = loadAppModule<{
    loadSeoEditorEntries: () => Promise<SeoEditorEntry[]>;
    saveSeoEditorEntry: (value: SeoEditorEntry) => Promise<SeoEditorEntry>;
  }>("src/lib/seo-editor-client.ts");
  for (const [status, message] of [[401, "session"], [403, "accès"], [409, "autre version"]] as const) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ error: "private server detail" }, { status }));
    await assert.rejects(client.loadSeoEditorEntries(), (error) => error instanceof Error && error.message.includes(message) && !error.message.includes("private"));
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({ entry: fixtures()[0] }));
  await assert.rejects(client.saveSeoEditorEntry(fixtures()[0]), /incomplète/);
  t.mock.method(globalThis, "fetch", async () => Response.json({ entries: fixtures().slice(1) }));
  await assert.rejects(client.loadSeoEditorEntries(), /incomplète/);
});

test("successful login returns to the validated admin destination", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { search: "?next=%2Fadmin%2Fseo" } } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true }));
  const destinations: string[] = [];
  const { AuthForm } = loadAppModule<{ AuthForm: (props: { mode: "login" }) => ReactNode }>("src/components/AuthForm.tsx", {
    react: { ...React, useState: (initial: unknown) => [initial, () => {}] },
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { useRouter: () => ({ push: (path: string) => destinations.push(path), refresh() {} }) },
    "./Session": { useSession: () => ({ refresh: async () => {} }) },
    "./LocaleProvider": { useLocale: () => ({ locale: "fr", t: (key: string) => key }) },
  });
  const form = nodes(AuthForm({ mode: "login" })).find((node) => node.type === "form");
  assert.ok(form);
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
  assert.deepEqual(destinations, ["/admin/seo"]);
});
