import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Routes = {
  GET(request: NextRequest): Promise<Response>;
  POST(request: NextRequest): Promise<Response>;
};
type Db = { execute(sql: string, params: unknown[]): Promise<unknown[]> };
const fixture = {
  id: "fixture-comment",
  body: "Fixture comment",
  created_at: "2026-10-31T12:00:00.000Z",
  username: "fixture_user",
  email: "test@example.invalid",
  internal_note: "private fixture field",
};

function routes(getDbPool: () => Db | null, authenticated = false) {
  return loadAppModule<Routes>("src/app/api/comments/route.ts", {
    "@/lib/db-pool": { getDbPool },
    "@/lib/auth-db": {
      getSessionUser: async () => authenticated ? { id: "fixture-user", username: "fixture_user" } : null,
    },
    "next/headers": {
      cookies: async () => ({ get: () => authenticated ? { value: "fixture-session" } : undefined }),
    },
  });
}

function request(method = "GET") {
  return new NextRequest("https://example.invalid/api/comments?photoId=fixture-photo", {
    method,
    ...(method === "POST" ? {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: "fixture-photo", body: "Fixture comment" }),
    } : {}),
  });
}

test("public comments project only the public contract, even when a row contains private fields", async () => {
  const route = routes(() => ({ execute: async () => [[fixture], []] }));
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [{
      id: fixture.id,
      body: fixture.body,
      created_at: fixture.created_at,
      username: fixture.username,
    }],
  });
});

test("the public comments query does not select account email addresses", async () => {
  let query = "";
  const route = routes(() => ({ execute: async (sql) => {
    query = sql;
    return [[fixture], []];
  } }));
  await route.GET(request());
  assert.doesNotMatch(query, /\bemail\b/i);
});

for (const failure of ["no pool", "query fails", "pool fails"] as const) {
  test(`unavailable comments return 503 when ${failure}`, async () => {
    const route = routes(() => {
      if (failure === "no pool") return null;
      if (failure === "pool fails") throw new Error("fixture pool failure");
      return { execute: async () => { throw new Error("fixture database failure"); } };
    });
    const response = await route.GET(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "comments_unavailable" });
  });
}

test("a visible media with no comments still has a genuine empty result", async () => {
  const route = routes(() => ({ execute: async () => [[{ id: null }], []] }));
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [] });
});

function assertVisibilityGates(sql: string) {
  for (const alias of ["p", "owner"]) {
    assert.match(sql, new RegExp(`${alias}\\.removed_from_index_at IS NULL`));
    assert.match(sql, new RegExp(`${alias}\\.is_hidden = 0`));
  }
}

test("missing or excluded media return 404 and the GET keeps all visibility gates", async () => {
  let query = "";
  const route = routes(() => ({ execute: async (sql, params) => {
    query = sql;
    assert.deepEqual(params, ["fixture-photo"]);
    return [[], []];
  } }));
  const response = await route.GET(request());
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "photo_not_found" });
  assertVisibilityGates(query);
  assert.match(query, /cm\.is_hidden = 0/);
});

test("POST still requires a session before accessing the database", async () => {
  const route = routes(() => { throw new Error("database must not be accessed"); });
  const response = await route.POST(request("POST"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "auth_required" });
});

test("authenticated POST keeps the media exclusions and rejects an absent insert target", async () => {
  let query = "";
  const route = routes(() => ({ execute: async (sql) => {
    query = sql;
    return [{ affectedRows: 0 }, []];
  } }), true);
  const response = await route.POST(request("POST"));
  assert.equal(response.status, 404);
  assertVisibilityGates(query);
});

type View = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

// Drive the real component's hooks and effect cleanup without a browser or network.
function commentsView() {
  const state: unknown[] = [];
  const effects: { dependencies?: unknown[]; cleanup?: () => void }[] = [];
  let stateCursor = 0;
  let effectCursor = 0;
  let pendingEffects: (() => void)[] = [];
  const { Comments } = loadAppModule<{ Comments(props: { photoId: string }): View }>(
    "src/components/Comments.tsx",
    {
      react: {
        useState: (initial: unknown) => {
          const slot = stateCursor++;
          if (!(slot in state)) state[slot] = initial;
          return [state[slot], (next: unknown) => {
            state[slot] = typeof next === "function" ? next(state[slot]) : next;
          }];
        },
        useEffect: (effect: () => (() => void) | undefined, dependencies: unknown[]) => {
          const slot = effectCursor++;
          const previous = effects[slot];
          if (previous?.dependencies?.length === dependencies.length &&
            dependencies.every((value, index) => Object.is(value, previous.dependencies![index]))) return;
          pendingEffects.push(() => {
            previous?.cleanup?.();
            effects[slot] = { dependencies, cleanup: effect() };
          });
        },
      },
      "next/link": { __esModule: true, default: "a" },
      "next/navigation": { usePathname: () => "/fr/photo/fixture-photo" },
      "./Session": { useSession: () => ({ user: null }) },
    },
  );
  return {
    render(photoId = "fixture-photo") {
      stateCursor = 0;
      effectCursor = 0;
      const tree = Comments({ photoId });
      const pending = pendingEffects;
      pendingEffects = [];
      pending.forEach((effect) => effect());
      return tree;
    },
    cleanup() { effects.forEach((effect) => effect.cleanup?.()); },
  };
}

function findButton(node: ReactNode, label: string): View | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButton(child, label);
      if (match) return match;
    }
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === "button" && node.props.children === label) return node as View;
  return findButton(node.props.children, label);
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const markup = (view: View) => renderToStaticMarkup(createElement("div", null, view));

test("the UI never falls back to an account email address", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [{ ...fixture, username: null }] });
  const view = commentsView();
  t.after(() => { view.cleanup(); globalThis.fetch = originalFetch; });
  view.render();
  await settle();
  const html = markup(view.render());
  assert.doesNotMatch(html, /test@example\.invalid/);
  assert.match(html, /Fixture comment/);
  assert.match(html, /Utilisateur/);
});

test("a failed HTTP load shows an error and retry instead of claiming there are no comments", async (t) => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => ++attempts === 1
    ? Response.json({ error: "comments_unavailable" }, { status: 503 })
    : Response.json({ items: [] });
  const view = commentsView();
  t.after(() => { view.cleanup(); globalThis.fetch = originalFetch; });
  assert.doesNotMatch(markup(view.render()), /Aucun commentaire/);
  await settle();
  const failed = view.render();
  assert.match(markup(failed), /Impossible de charger les commentaires/);
  assert.doesNotMatch(markup(failed), /Aucun commentaire/);
  const retry = findButton(failed, "Réessayer");
  assert.ok(retry?.props.onClick, "the failure offers a usable retry button");
  retry.props.onClick();
  view.render();
  await settle();
  const recovered = markup(view.render());
  assert.match(recovered, /Aucun commentaire/);
  assert.doesNotMatch(recovered, /Impossible de charger les commentaires/);
  assert.equal(attempts, 2);
});

test("a network failure is distinct from an empty comments list", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("fixture offline"); };
  const view = commentsView();
  t.after(() => { view.cleanup(); globalThis.fetch = originalFetch; });
  view.render();
  await settle();
  const html = markup(view.render());
  assert.match(html, /Impossible de charger les commentaires/);
  assert.doesNotMatch(html, /Aucun commentaire/);
});

test("a late response for the previous photo cannot replace the current comments", async (t) => {
  const originalFetch = globalThis.fetch;
  let finishPrevious!: (response: Response) => void;
  globalThis.fetch = async (url) => String(url).includes("photoId=previous")
    ? new Promise<Response>((resolve) => { finishPrevious = resolve; })
    : Response.json({ items: [{ ...fixture, body: "Current photo comment" }] });
  const view = commentsView();
  t.after(() => { view.cleanup(); globalThis.fetch = originalFetch; });
  view.render("previous");
  view.render("current");
  await settle();
  finishPrevious(Response.json({ items: [{ ...fixture, body: "Stale photo comment" }] }));
  await settle();
  const html = markup(view.render("current"));
  assert.match(html, /Current photo comment/);
  assert.doesNotMatch(html, /Stale photo comment/);
});
