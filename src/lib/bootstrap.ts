/**
 * Server-only bootstrap: wires the real data provider when a database is
 * configured, otherwise leaves the EmptyDataProvider in place (so the app
 * builds and runs with no DB — just empty).
 *
 * Import this once from server code. It's a no-op in the browser.
 */

import "server-only";
import { setDataProvider } from "./data-provider";
import { log } from "./logger";
import { createAsyncOnce } from "./async-once";

export const ensureDataProvider = createAsyncOnce(async () => {
  // Preview mode: in-memory demo data (rights-free placeholders) for design work.
  if (process.env.DEMO_DATA === "1") {
    const { DemoProvider } = await import("./providers/demo");
    setDataProvider(new DemoProvider());
    return;
  }

  if (!process.env.DATABASE_URL) {
    // No DB configured — stay on the empty provider (clean empty states).
    return;
  }

  try {
    const { MariaDBProvider } = await import("./providers/mariadb");
    setDataProvider(new MariaDBProvider());
  } catch {
    // Never crash the whole app if the DB is misconfigured; stay empty.
    // We intentionally don't log the error details (could include the DSN).
    log.fatal("[bootstrap] data provider init failed");
  }
});
