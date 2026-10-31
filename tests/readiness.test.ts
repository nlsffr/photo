import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer, type Socket } from "node:net";
import mysql, { type Connection, type ConnectionOptions } from "mysql2";
import test, { after } from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const originalUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "mysql://fixture:fixture@database.invalid/fixture";
after(() => {
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

class FakeSocket extends EventEmitter {
  destroyed = false;
  destroyCalls = 0;
  close() {
    this.destroyed = true;
    queueMicrotask(() => this.emit("close"));
  }
  destroy() {
    this.destroyCalls++;
    this.close();
  }
}

class FakeConnection extends EventEmitter {
  stream = new FakeSocket();
  destroyCalls = 0;
  endCalls = 0;
  queryCalls = 0;
  queryResult: () => Promise<unknown> = async () => [[{ ready: 1 }]];
  endResult: () => Promise<void> = async () => { this.stream.close(); };
  destroy() { this.destroyCalls++; }
  promise() {
    return {
      query: () => { this.queryCalls++; return this.queryResult(); },
      end: () => { this.endCalls++; return this.endResult(); },
    };
  }
}

function route(createConnection: (options: ConnectionOptions) => unknown) {
  return loadAppModule<{ GET: () => Promise<Response> }>("src/app/api/readyz/route.ts", {
    mysql2: { createConnection },
  });
}

test("missing configuration and connection failure are unavailable without exposing details", async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let attempts = 0;
  const absent = await route(() => { attempts++; throw new Error("should not connect"); }).GET();
  assert.equal(absent.status, 503);
  assert.equal(attempts, 0);
  process.env.DATABASE_URL = saved;
  const failed = await route(() => { throw new Error("mysql://private-user:private-password@host/db"); }).GET();
  assert.equal(failed.status, 503);
  assert.deepEqual(Object.keys(await failed.json()).sort(), ["ready", "timestamp"]);
  assert.equal(failed.headers.get("cache-control"), "no-store");
});

test("successful probes close gracefully, coalesce and leave the application pool alone", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const conn = new FakeConnection();
  let finish!: (value: unknown) => void;
  conn.queryResult = () => new Promise((resolve) => { finish = resolve; });
  let attempts = 0;
  const shared = globalThis as typeof globalThis & { __photoMariaDBPool?: unknown };
  const oldPool = shared.__photoMariaDBPool;
  let poolEnds = 0;
  const applicationPool = { end: () => { poolEnds++; } };
  shared.__photoMariaDBPool = applicationPool;
  try {
    const handler = route(() => { attempts++; return conn; });
    const waiting = Array.from({ length: 20 }, () => handler.GET());
    assert.equal(attempts, 1);
    finish([[{ ready: 1 }]]);
    const responses = await Promise.all(waiting);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).ready, true);
    }
    assert.equal(conn.queryCalls, 1);
    assert.equal(conn.endCalls, 1);
    assert.equal(conn.destroyCalls, 0);
    assert.equal(conn.stream.destroyCalls, 0);
    assert.equal(conn.listenerCount("error"), 0);
    assert.equal(conn.stream.listenerCount("close"), 0);
    assert.equal((await handler.GET()).status, 200);
    assert.equal(attempts, 1);
    assert.equal(poolEnds, 0);
    assert.equal(shared.__photoMariaDBPool, applicationPool);
    t.mock.timers.tick(10_000);
    assert.equal(conn.destroyCalls, 0, "the probe deadline must be cleared after success");
  } finally {
    shared.__photoMariaDBPool = oldPool;
  }
});

test("query errors destroy only the dedicated connection and return no private detail", async () => {
  const conn = new FakeConnection();
  conn.queryResult = async () => { throw new Error("secret connection detail"); };
  const response = await route(() => conn).GET();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ready, false);
  assert.equal(conn.destroyCalls, 1);
  assert.equal(conn.stream.destroyCalls, 1);
  assert.equal(conn.endCalls, 0);
  assert.equal(conn.listenerCount("error"), 0);
  assert.equal(conn.stream.listenerCount("close"), 0);
});

test("a stalled query has one hard deadline, releases its socket and can recover", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const stalled = new FakeConnection();
  let rejectLate!: (reason: Error) => void;
  stalled.queryResult = () => new Promise((_, reject) => { rejectLate = reject; });
  const recovered = new FakeConnection();
  let attempts = 0;
  const handler = route(() => ++attempts === 1 ? stalled : recovered);
  const pending = Array.from({ length: 30 }, () => handler.GET());
  t.mock.timers.tick(1_500);
  const responses = await Promise.all(pending);
  assert.ok(responses.every((response) => response.status === 503));
  assert.equal(attempts, 1);
  assert.equal(stalled.stream.destroyed, true);
  assert.equal(stalled.destroyCalls, 1);
  assert.equal(stalled.stream.destroyCalls, 1);
  rejectLate(new Error("late network failure"));
  await Promise.resolve();
  assert.equal((await handler.GET()).status, 503);
  assert.equal(attempts, 1, "failed requests must not create another probe immediately");
  t.mock.timers.tick(1_001);
  assert.equal((await handler.GET()).status, 200);
  assert.equal(attempts, 2);
});

test("cleanup itself is deadline bounded if a server does not close after QUIT", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const conn = new FakeConnection();
  conn.endResult = () => new Promise(() => {});
  const waiting = route(() => conn).GET();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(conn.endCalls, 1);
  t.mock.timers.tick(1_500);
  assert.equal((await waiting).status, 503);
  assert.equal(conn.stream.destroyed, true);
  assert.equal(conn.listenerCount("error"), 0);
});

test("a real TCP server with no MySQL greeting cannot leave the readiness socket alive", async () => {
  const sockets: Socket[] = [];
  const server = createServer((socket) => { sockets.push(socket); socket.pause(); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `mysql://fixture@127.0.0.1:${address.port}/fixture`;
  let connection!: Connection & { stream: Socket };
  const start = Date.now();
  try {
    const handler = route((options) => {
      // Verify the global deadline rather than mysql2's separate connection timer.
      connection = mysql.createConnection({ ...options, connectTimeout: 60_000 }) as typeof connection;
      return connection;
    });
    const response = await handler.GET();
    assert.equal(response.status, 503);
    assert.ok(Date.now() - start < 3_000);
    assert.equal(connection.stream.destroyed, true);
  } finally {
    process.env.DATABASE_URL = saved;
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
