import "server-only";
import mysql from "mysql2/promise";

const globalForMariaDB = globalThis as typeof globalThis & {
  __photoMariaDBPool?: mysql.Pool;
};

function poolSize(): number {
  const configured = Number(process.env.DB_POOL_SIZE ?? 10);
  if (!Number.isFinite(configured) || configured < 1) return 10;
  return Math.min(Math.trunc(configured), 32);
}

export function getDbPool(): mysql.Pool | null {
  if (globalForMariaDB.__photoMariaDBPool) {
    return globalForMariaDB.__photoMariaDBPool;
  }

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const connectionLimit = poolSize();
  const pool = mysql.createPool({
    uri: url,
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
        : undefined,
    connectionLimit,
    waitForConnections: true,
    namedPlaceholders: true,
    maxIdle: Math.min(connectionLimit, 4),
    idleTimeout: 30_000,
    enableKeepAlive: false,
  });

  globalForMariaDB.__photoMariaDBPool = pool;
  return pool;
}

export function requireDbPool(): mysql.Pool {
  const pool = getDbPool();
  if (!pool) throw new Error("DATABASE_URL is not set");
  return pool;
}
