import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { randomUUID } from "node:crypto";
import { getDbPool as getPool } from "./db-pool";
import { activeCreatorSql, activeMediaSql } from "./providers/active-content-sql";

export interface InteractionState {
  liked: string[];
  saved: string[];
  followed: string[];
}

export async function getInteractions(userId: string): Promise<InteractionState> {
  const db = getPool();
  if (!db) return { liked: [], saved: [], followed: [] };
  try {
    const [likes] = await db.execute<RowDataPacket[]>(
      `SELECT l.photo_id
       FROM likes l
       JOIN photos p ON p.id = l.photo_id
       JOIN creators c ON c.id = p.creator_id
       WHERE l.user_id = ?
         AND ${activeMediaSql("p", "c")}`,
      [userId],
    );
    const [saves] = await db.execute<RowDataPacket[]>(
      `SELECT s.photo_id
       FROM saves s
       JOIN photos p ON p.id = s.photo_id
       JOIN creators c ON c.id = p.creator_id
       WHERE s.user_id = ?
         AND ${activeMediaSql("p", "c")}`,
      [userId],
    );
    const [follows] = await db.execute<RowDataPacket[]>(
      `SELECT c.handle FROM follows f
       JOIN creators c ON c.id = f.creator_id
       WHERE f.follower_id = ?
         AND ${activeCreatorSql("c")}`,
      [userId],
    );
    return {
      liked: (likes as { photo_id: string }[]).map((r) => r.photo_id),
      saved: (saves as { photo_id: string }[]).map((r) => r.photo_id),
      followed: (follows as { handle: string }[]).map((r) => r.handle),
    };
  } catch {
    return { liked: [], saved: [], followed: [] };
  }
}

export async function toggleLike(
  userId: string,
  photoId: string,
): Promise<{ on: boolean }> {
  const db = getPool();
  if (!db) throw new Error("no_db");
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM likes WHERE user_id = ? AND photo_id = ? LIMIT 1",
    [userId, photoId],
  );
  if (rows[0]) {
    await db.execute("DELETE FROM likes WHERE user_id = ? AND photo_id = ?", [
      userId,
      photoId,
    ]);
    return { on: false };
  }
  const [inserted] = await db.execute<ResultSetHeader>(
    `INSERT INTO likes (id, user_id, photo_id)
     SELECT ?, ?, p.id
     FROM photos p
     JOIN creators c ON c.id = p.creator_id
     WHERE p.id = ?
       AND ${activeMediaSql("p", "c")}
     LIMIT 1`,
    [randomUUID(), userId, photoId],
  );
  if (inserted.affectedRows !== 1) throw new Error("photo_not_found");
  return { on: true };
}

export async function toggleSave(
  userId: string,
  photoId: string,
): Promise<{ on: boolean }> {
  const db = getPool();
  if (!db) throw new Error("no_db");
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM saves WHERE user_id = ? AND photo_id = ? LIMIT 1",
    [userId, photoId],
  );
  if (rows[0]) {
    await db.execute("DELETE FROM saves WHERE user_id = ? AND photo_id = ?", [
      userId,
      photoId,
    ]);
    return { on: false };
  }
  const [inserted] = await db.execute<ResultSetHeader>(
    `INSERT INTO saves (id, user_id, photo_id)
     SELECT ?, ?, p.id
     FROM photos p
     JOIN creators c ON c.id = p.creator_id
     WHERE p.id = ?
       AND ${activeMediaSql("p", "c")}
     LIMIT 1`,
    [randomUUID(), userId, photoId],
  );
  if (inserted.affectedRows !== 1) throw new Error("photo_not_found");
  return { on: true };
}

export async function toggleFollow(
  userId: string,
  handle: string,
): Promise<{ on: boolean }> {
  const db = getPool();
  if (!db) throw new Error("no_db");
  const [creators] = await db.execute<RowDataPacket[]>(
    "SELECT id, removed_from_index_at FROM creators WHERE handle = ? LIMIT 1",
    [handle],
  );
  const creator = creators[0] as
    | { id: string; removed_from_index_at: Date | string | null }
    | undefined;
  if (!creator) throw new Error("creator_not_found");

  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM follows WHERE follower_id = ? AND creator_id = ? LIMIT 1",
    [userId, creator.id],
  );
  if (rows[0]) {
    await db.execute(
      "DELETE FROM follows WHERE follower_id = ? AND creator_id = ?",
      [userId, creator.id],
    );
    return { on: false };
  }
  if (creator.removed_from_index_at) throw new Error("creator_not_found");
  const [inserted] = await db.execute<ResultSetHeader>(
    `INSERT INTO follows (id, follower_id, creator_id)
     SELECT ?, ?, c.id
     FROM creators c
     WHERE c.id = ?
       AND ${activeCreatorSql("c")}
     LIMIT 1`,
    [randomUUID(), userId, creator.id],
  );
  if (inserted.affectedRows !== 1) throw new Error("creator_not_found");
  return { on: true };
}

/** Merge localStorage leftovers into DB once (idempotent). */
export async function mergeLocalState(
  userId: string,
  local: { liked?: string[]; saved?: string[]; followed?: string[] },
): Promise<InteractionState> {
  const db = getPool();
  if (!db) return getInteractions(userId);

  for (const photoId of local.liked ?? []) {
    try {
      await db.execute(
        `INSERT IGNORE INTO likes (id, user_id, photo_id)
         SELECT ?, ?, p.id
         FROM photos p
         JOIN creators c ON c.id = p.creator_id
         WHERE p.id = ?
           AND ${activeMediaSql("p", "c")}
         LIMIT 1`,
        [randomUUID(), userId, photoId],
      );
    } catch {
      /* ignore bad ids */
    }
  }
  for (const photoId of local.saved ?? []) {
    try {
      await db.execute(
        `INSERT IGNORE INTO saves (id, user_id, photo_id)
         SELECT ?, ?, p.id
         FROM photos p
         JOIN creators c ON c.id = p.creator_id
         WHERE p.id = ?
           AND ${activeMediaSql("p", "c")}
         LIMIT 1`,
        [randomUUID(), userId, photoId],
      );
    } catch {
      /* ignore */
    }
  }
  for (const handle of local.followed ?? []) {
    try {
      const [creators] = await db.execute<RowDataPacket[]>(
        `SELECT id
         FROM creators c
         WHERE handle = ?
           AND ${activeCreatorSql("c")}
         LIMIT 1`,
        [handle],
      );
      const c = creators[0] as { id: string } | undefined;
      if (!c) continue;
      await db.execute(
        "INSERT IGNORE INTO follows (id, follower_id, creator_id) VALUES (?, ?, ?)",
        [randomUUID(), userId, c.id],
      );
    } catch {
      /* ignore */
    }
  }
  return getInteractions(userId);
}
