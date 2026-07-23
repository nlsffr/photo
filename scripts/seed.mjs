#!/usr/bin/env node
/**
 * Seed real content into MariaDB.
 *
 * This does NOT ship any placeholder data — it reads a JSON file YOU provide
 * (your own creators + media you have the rights to) and inserts it. No
 * tracking fields, no third-party calls.
 *
 * Usage:
 *   DATABASE_URL=mysql://user:pass@host:3306/lumengallery \
 *     node scripts/seed.mjs ./content.json
 *
 * content.json shape:
 * {
 *   "creators": [
 *     { "handle": "aria", "name": "Aria", "avatarUrl": "https://cdn/.../a.jpg",
 *       "bio": "...", "location": "...", "followers": 0, "verified": false }
 *   ],
 *   "photos": [
 *     { "id": "uuid", "creatorHandle": "aria", "title": "...",
 *       "imageUrl": "https://cdn/.../1.jpg", "type": "photo",
 *       "width": 1080, "height": 1350, "tags": ["portrait"],
 *       "views": 0, "likes": 0,
 *       "videoUrl": null, "durationSec": null }
 *   ]
 * }
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/seed.mjs <content.json>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, "utf8"));
const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

try {
  await conn.beginTransaction();
  const creatorId = new Map();

  for (const c of data.creators ?? []) {
    const id = randomUUID();
    creatorId.set(c.handle, id);
    await conn.execute(
      `INSERT INTO creators (id, handle, name, avatar_url, bio, location, followers_count, verified)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, c.handle, c.name, c.avatarUrl, c.bio ?? "", c.location ?? "", c.followers ?? 0, c.verified ? 1 : 0],
    );
  }

  for (const p of data.photos ?? []) {
    const cid = creatorId.get(p.creatorHandle);
    if (!cid) {
      console.warn(`skip photo ${p.id}: unknown creator ${p.creatorHandle}`);
      continue;
    }
    const id = p.id ?? randomUUID();
    await conn.execute(
      `INSERT INTO photos (id, creator_id, title, description, image_url, video_url, type, duration_sec, width, height, views_count, likes_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, cid, p.title ?? "", p.description ?? "", p.imageUrl,
        p.videoUrl ?? null, p.type ?? "photo", p.durationSec ?? null,
        p.width ?? 1080, p.height ?? 1350, p.views ?? 0, p.likes ?? 0,
      ],
    );
    for (const tag of p.tags ?? []) {
      await conn.execute(
        `INSERT IGNORE INTO photo_tags (photo_id, tag) VALUES (?,?)`,
        [id, tag],
      );
    }
  }

  await conn.commit();
  console.log(
    `Seeded ${data.creators?.length ?? 0} creators, ${data.photos?.length ?? 0} photos.`,
  );
} catch (err) {
  await conn.rollback();
  console.error("Seed failed:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
