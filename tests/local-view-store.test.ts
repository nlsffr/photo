import assert from "node:assert/strict";
import test from "node:test";

async function loadStore() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/source-engagement.ts");
  } catch (error) {
    assert.fail(`local view store is unavailable: ${String(error)}`);
  }
}

type State = {
  localViews: number;
  events: Array<{ photoId: string; userId: string | null }>;
};

function transactionalPool(
  state: State,
  options: { photoExists?: boolean; failInsert?: boolean } = {},
) {
  const lifecycle: string[] = [];
  let pending: State | null = null;
  const connection = {
    async beginTransaction() {
      lifecycle.push("begin");
      pending = { localViews: state.localViews, events: [...state.events] };
    },
    async execute(sql: string, params: unknown[]) {
      if (!pending) throw new Error("write outside transaction");
      if (sql.startsWith("UPDATE photos")) {
        if (options.photoExists === false) return [{ affectedRows: 0 }];
        pending.localViews += 1;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("INSERT INTO media_views")) {
        if (options.failInsert) throw new Error("media_views unavailable");
        pending.events.push({
          photoId: String(params[0]),
          userId: params[1] == null ? null : String(params[1]),
        });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
    async commit() {
      lifecycle.push("commit");
      if (!pending) throw new Error("missing transaction");
      state.localViews = pending.localViews;
      state.events = pending.events;
      pending = null;
    },
    async rollback() {
      lifecycle.push("rollback");
      pending = null;
    },
    release() {
      lifecycle.push("release");
    },
  };
  return {
    lifecycle,
    async getConnection() {
      lifecycle.push("connection");
      return connection;
    },
  };
}

test("a local view commits its counter and event together", async () => {
  const { recordLocalPhotoView } = await loadStore();
  const state: State = { localViews: 3, events: [] };
  const pool = transactionalPool(state);

  await recordLocalPhotoView(pool, "photo-1", "user-1");

  assert.deepEqual(state, {
    localViews: 4,
    events: [{ photoId: "photo-1", userId: "user-1" }],
  });
  assert.deepEqual(pool.lifecycle, ["connection", "begin", "commit", "release"]);
});

test("a failed event insert rolls the counter back and releases the connection", async () => {
  const { recordLocalPhotoView } = await loadStore();
  const state: State = { localViews: 3, events: [] };
  const pool = transactionalPool(state, { failInsert: true });

  await assert.rejects(
    recordLocalPhotoView(pool, "photo-1", null),
    /media_views unavailable/,
  );

  assert.deepEqual(state, { localViews: 3, events: [] });
  assert.deepEqual(pool.lifecycle, ["connection", "begin", "rollback", "release"]);
});

test("an unknown photo cannot create an orphan view event", async () => {
  const { recordLocalPhotoView } = await loadStore();
  const state: State = { localViews: 0, events: [] };
  const pool = transactionalPool(state, { photoExists: false });

  await assert.rejects(recordLocalPhotoView(pool, "missing", null), /photo_not_found/);

  assert.deepEqual(state, { localViews: 0, events: [] });
  assert.deepEqual(pool.lifecycle, ["connection", "begin", "rollback", "release"]);
});
