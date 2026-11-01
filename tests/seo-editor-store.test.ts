import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
import type { SeoEditorEntry, SeoEditorSave } from "../src/lib/seo-editor-contract";

const initial: SeoEditorSave = { page: "home", locale: "fr", title: "Fixture title", description: "Fixture description", revision: 0 };
type StoredRow = { page_key: string; locale: string; title: string; description: string; revision: number; updated_at: Date };
class FakeSeoDb {
  rows: StoredRow[] = [];
  history: Record<string, unknown>[] = [];
  failHistory = false;
  loseCompareAndSwap = false;
  private async run(sql: string, params: Record<string, unknown>, rows: StoredRow[], history: Record<string, unknown>[]) {
    if (sql.includes("SELECT")) return [rows.filter((row) => !params.page || (row.page_key === params.page && row.locale === params.locale))];
    if (sql.includes("INSERT INTO seo_page_history")) {
      if (this.failHistory) throw new Error("synthetic history error");
      history.push({ ...params }); return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO seo_page_settings")) {
      rows.push({ page_key: String(params.page), locale: String(params.locale), title: String(params.title), description: String(params.description), revision: 1, updated_at: params.now as Date });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("UPDATE seo_page_settings")) {
      const row = rows.find((item) => item.page_key === params.page && item.locale === params.locale && item.revision === params.revision);
      if (!row || this.loseCompareAndSwap) return [{ affectedRows: 0 }];
      Object.assign(row, { title: params.title, description: params.description, revision: row.revision + 1, updated_at: params.now });
      return [{ affectedRows: 1 }];
    }
    throw new Error("unexpected fixture query");
  }
  async execute(sql: string, params: Record<string, unknown> = {}) { return this.run(sql, params, this.rows, this.history); }
  async getConnection() {
    let rows = this.rows.map((row) => ({ ...row })), history = this.history.map((row) => ({ ...row }));
    return {
      beginTransaction: async () => {},
      execute: (sql: string, params: Record<string, unknown>) => this.run(sql, params, rows, history),
      commit: async () => { this.rows = rows; this.history = history; },
      rollback: async () => { rows = []; history = []; },
      release: () => {},
    };
  }
}
type Store = {
  validateSeoSave(value: unknown): SeoEditorSave | null;
  saveSeoEntry(input: SeoEditorSave, userId: string): Promise<{ ok: true; entry: SeoEditorEntry } | { ok: false; error: string }>;
  readSeoOverride(locale: string, page: string): Promise<SeoEditorEntry | null>;
  listSeoEntries(): Promise<SeoEditorEntry[]>;
};
function store(db: FakeSeoDb | null) {
  return loadAppModule<Store>("src/lib/seo-editor-store.ts", {
    "server-only": {}, "./db-pool": { getDbPool: () => db },
    "./seo-editor-defaults": { getSeoDefault: (locale: string, page: string) => ({ locale, page, title: "Default fixture", description: "Default description", revision: 0, updatedAt: null, source: "default" }) },
  });
}

test("SEO edits reject unknown targets, extra fields, invalid revisions, empty, long and control text", () => {
  const { validateSeoSave } = store(null);
  for (const invalid of [null, [], { ...initial, page: "../admin" }, { ...initial, locale: "xx" }, { ...initial, revision: -1 }, { ...initial, revision: 1.5 }, { ...initial, revision: Number.MAX_SAFE_INTEGER }, { ...initial, title: " " }, { ...initial, description: "" }, { ...initial, title: "x".repeat(301) }, { ...initial, description: "x".repeat(2001) }, { ...initial, title: "header\r\ninjected" }, { ...initial, extra: true }]) assert.equal(validateSeoSave(invalid), null);
  assert.deepEqual(validateSeoSave(initial), initial);
});

test("server and client share UTF-16 limits for characters outside the BMP", () => {
  const { validateSeoSave } = store(null);
  const { isSeoEditorEntry } = loadAppModule<{ isSeoEditorEntry(value: unknown): boolean }>("src/lib/seo-editor-client.ts");
  const character = String.fromCodePoint(0x1f600);
  for (const [count, accepted] of [[150, true], [151, false]] as const) {
    const input = { ...initial, title: character.repeat(count) };
    assert.equal(validateSeoSave(input) !== null, accepted);
    assert.equal(isSeoEditorEntry({ ...input, revision: 1, source: "saved", updatedAt: null }), accepted);
  }
});

test("first save commits the override and a full previous/next audit record", async () => {
  const db = new FakeSeoDb(), api = store(db);
  const saved = await api.saveSeoEntry(initial, "owner-id");
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.entry.revision, 1);
  assert.equal(saved.entry.source, "saved");
  assert.equal(db.rows.length, 1);
  assert.equal(db.history.length, 1);
  assert.equal(db.history[0].previousTitle, "Default fixture");
  assert.equal(db.history[0].nextTitle, initial.title);
  assert.equal(db.history[0].actor, "owner-id");
  assert.equal((await api.readSeoOverride("fr", "home"))?.revision, 1);
});

test("stale saves never overwrite the newer override or append history", async () => {
  const db = new FakeSeoDb(), api = store(db);
  await api.saveSeoEntry(initial, "owner-id");
  const result = await api.saveSeoEntry({ ...initial, title: "Stale fixture" }, "owner-id");
  assert.deepEqual(result, { ok: false, error: "conflict" });
  assert.equal(db.rows[0].title, initial.title);
  assert.equal(db.history.length, 1);
});

test("a current edit increments its revision once and stores its previous values", async () => {
  const db = new FakeSeoDb(), api = store(db);
  await api.saveSeoEntry(initial, "owner-id");
  const update = { ...initial, revision: 1, title: "Second fixture" };
  const result = await api.saveSeoEntry(update, "owner-id");
  assert.equal(result.ok, true);
  assert.equal(db.rows[0].revision, 2);
  assert.equal(db.history[1].previousTitle, initial.title);
  assert.equal(db.history[1].nextTitle, update.title);
  assert.equal(db.history[1].previousRevision, 1);
  assert.equal(db.history[1].nextRevision, 2);
  await api.saveSeoEntry({ ...update, revision: 2 }, "owner-id");
  assert.equal(db.rows[0].revision, 2);
  assert.equal(db.history.length, 2);
});

test("failed history or failed compare-and-swap cannot publish a partial edit", async () => {
  const db = new FakeSeoDb(), api = store(db);
  await api.saveSeoEntry(initial, "owner-id");
  db.failHistory = true;
  await assert.rejects(api.saveSeoEntry({ ...initial, title: "Next", revision: 1 }, "owner-id"));
  assert.equal(db.rows[0].revision, 1);
  assert.equal(db.history.length, 1);
  db.failHistory = false; db.loseCompareAndSwap = true;
  assert.deepEqual(await api.saveSeoEntry({ ...initial, title: "Next", revision: 1 }, "owner-id"), { ok: false, error: "conflict" });
  assert.equal(db.rows[0].revision, 1);
  assert.equal(db.history.length, 1);
});

test("SQL-looking text is stored as a value without changing any other target", async () => {
  const db = new FakeSeoDb(), api = store(db);
  const value = "'; DROP TABLE users; -- <script>fixture</script>";
  await api.saveSeoEntry({ ...initial, title: value }, "owner-id");
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].title, value);
  const entries = await api.listSeoEntries();
  assert.equal(entries.length, 42);
  assert.equal(entries.filter((entry) => entry.source === "saved").length, 1);
});

test("no configured database leaves public defaults available but cannot save", async () => {
  const api = store(null);
  assert.equal(await api.readSeoOverride("fr", "home"), null);
  assert.equal((await api.listSeoEntries()).length, 42);
  assert.deepEqual(await api.saveSeoEntry(initial, "owner-id"), { ok: false, error: "unavailable" });
});

test("missing settings table permits only the public fallback; other read errors propagate", async () => {
  const db = new FakeSeoDb(), api = store(db);
  db.execute = async () => { throw { code: "ER_NO_SUCH_TABLE", errno: 1146 }; };
  assert.equal(await api.readSeoOverride("fr", "home"), null);
  await assert.rejects(api.listSeoEntries());
  const error = Object.assign(new Error("synthetic connection error"), { code: "ECONNRESET" });
  db.execute = async () => { throw error; };
  await assert.rejects(api.readSeoOverride("fr", "home"), (actual) => actual === error);
});

test("a competing initial insert reports conflict and rolls back without history", async () => {
  const db = new FakeSeoDb(), api = store(db), original = db.getConnection.bind(db);
  db.getConnection = async () => {
    const connection = await original(), execute = connection.execute;
    return { ...connection, execute: async (sql: string, params: Record<string, unknown>) => {
      if (sql.includes("INSERT INTO seo_page_settings")) throw { code: "ER_DUP_ENTRY", errno: 1062 };
      return execute(sql, params);
    } };
  };
  assert.deepEqual(await api.saveSeoEntry(initial, "owner-id"), { ok: false, error: "conflict" });
  assert.equal(db.rows.length, 0);
  assert.equal(db.history.length, 0);
});
