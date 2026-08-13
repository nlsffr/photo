/**
 * MariaDB / MySQL implementation of DataProvider.
 * Algorithmes distincts par sort — pas les mêmes listes partout.
 */

import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import type {
  Creator,
  CreatorWithStats,
  MediaType,
  Photo,
  PhotoPage,
  PhotoView,
  SortKey,
  TrendWindow,
} from "../types";
import type { DataProvider } from "../data-provider";

type Params = Record<string, unknown>;

const PAGE_SIZE = 24;

function makePool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  return mysql.createPool({
    uri: url,
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
        : undefined,
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    waitForConnections: true,
    namedPlaceholders: true,
  });
}
