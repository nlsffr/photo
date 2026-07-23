/**
 * Server-only bootstrap: wires the real data provider when a database is
 * configured, otherwise leaves the EmptyDataProvider in place (so the app
 * builds and runs with no DB — just empty).
 *
 * Import this once from server code. It's a no-op in the browser.
 */

import "server-only";
import { setDataProvider } from "./data-provider";

let initialised = false;

export async function ensureDataProvider() {
  if (initialised) return;
  initialised = true;

  if (!process.env.DATABASE_URL) {
    // No DB configured — stay on the empty provider (clean empty states).
    return;
  }

  try {
    const { MariaDBProvider } = await import("./providers/mariadb");
    setDataProvider(new MariaDBProvider());
  } catch (err) {
    // Never crash the whole app if the DB is misconfigured; log and stay empty.
    console.error("[bootstrap] MariaDB provider init failed:", err);
  }
}
