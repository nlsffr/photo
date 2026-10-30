import "server-only";
import mysql from "mysql2/promise";
import { databasePoolPolicy } from "./db-pool-policy";

const globalForMariaDB = globalThis as typeof globalThis & {
  __photoMariaDBPool?: mysql.Pool;
};

export function getDbPool(): mysql.Pool | null {
  if (globalForMariaDB.__photoMariaDBPool) {
    return globalForMariaDB.__photoMariaDBPool;
  }

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const pool = mysql.createPool({
    uri: url,
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
        : undefined,
    ...databasePoolPolicy({ DB_POOL_SIZE: process.env.DB_POOL_SIZE }),
  });

  globalForMariaDB.__photoMariaDBPool = pool;
  return pool;
}

export function requireDbPool(): mysql.Pool {
  const pool = getDbPool();
  if (!pool) throw new Error("DATABASE_URL is not set");
  return pool;
}
