import type { Duplex } from "node:stream";
import mysql from "mysql2";

export const dynamic = "force-dynamic";

const DEADLINE_MS = 1_500;
const CACHE_MS = 1_000;
type ProbeConnection = mysql.Connection & { stream: Duplex };
let inFlight: Promise<boolean> | undefined;
let cached: { ready: boolean; expiresAt: number } | undefined;

function probeDatabase(): Promise<boolean> {
  const uri = process.env.DATABASE_URL;
  if (!uri) return Promise.resolve(false);

  return new Promise((resolve) => {
    let connection: ProbeConnection | undefined;
    let settled = false;
    let querySucceeded = false;
    const deadline = setTimeout(() => finish(false), DEADLINE_MS);

    function removeListeners() {
      connection?.removeListener("error", unavailable);
      connection?.stream.removeListener("close", closed);
    }
    function finish(ready: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (!ready && connection) {
        connection.destroy();
        // mysql2 3.23 destroy() half-closes; force cancellation of a stalled peer.
        if (!connection.stream.destroyed) connection.stream.destroy();
      }
      if (!connection) removeListeners();
      resolve(ready);
    }
    function unavailable() { finish(false); }
    function closed() {
      removeListeners();
      finish(querySucceeded);
    }

    try {
      // Own this short-lived connection, so a deadline never damages the app pool.
      connection = mysql.createConnection({
        uri,
        connectTimeout: DEADLINE_MS,
        ssl: process.env.DB_SSL === "true"
          ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
          : undefined,
      }) as ProbeConnection;
      connection.on("error", unavailable);
      connection.stream.once("close", closed);
      void connection.promise().query("SET STATEMENT max_statement_time=1 FOR SELECT 1")
        .then(() => {
          if (settled) return;
          querySucceeded = true;
          return connection!.promise().end();
        }).catch(unavailable);
    } catch {
      unavailable();
    }
  });
}

function databaseReady(): Promise<boolean> {
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.ready);
  if (!inFlight) {
    inFlight = probeDatabase().then((ready) => {
      cached = { ready, expiresAt: Date.now() + CACHE_MS };
      return ready;
    }).finally(() => { inFlight = undefined; });
  }
  return inFlight;
}

export async function GET() {
  const ready = await databaseReady();
  return Response.json(
    { ready, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
