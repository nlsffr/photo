import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { getSessionUser } from "@/lib/auth-db";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function pool() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return mysql.createPool({ uri: url, connectionLimit: 5, waitForConnections: true });
}

function mapPhoto(r: RowDataPacket) {
  return {
    id: r.id,
    sourceId: r.source_id ?? undefined,
    title: r.title,
    imageUrl: r.image_url,
    videoUrl: r.video_url ?? undefined,
    type: r.type,
    durationSec: r.duration_sec ?? undefined,
    width: Number(r.width) || 1080,
    height: Number(r.height) || 1350,
    views: Number(r.views_count) || 0,
    likes: Number(r.likes_count) || 0,
    ageMinutes: 0,
    trending: 0,
    isAi: Boolean(r.is_ai),
    creatorHandle: r.handle,
    tags: [] as string[],
    creator: {
      handle: r.handle,
      name: r.creator_name || r.handle,
      avatarUrl: r.avatar_url || "",
      verified: Boolean(r.verified),
    },
  };
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") || "saved";
  // saved | liked | following | creators
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "auth_required", items: [], creators: [] }, { status: 401 });
  }
  const user = await getSessionUser(token);
  if (!user) {
    return NextResponse.json({ error: "auth_required", items: [], creators: [] }, { status: 401 });
  }

  const db = await pool();
  if (!db) return NextResponse.json({ items: [], creators: [] });

  try {
    if (kind === "creators") {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT c.id, c.handle, c.name, c.avatar_url, c.verified, c.followers_count,
                (SELECT COUNT(*) FROM photos p WHERE p.creator_id = c.id) AS photo_count
         FROM follows f
         JOIN creators c ON c.id = f.creator_id
         WHERE f.follower_id = ?
         ORDER BY f.created_at DESC
         LIMIT 200`,
        [user.id],
      );
      const creators = (rows as RowDataPacket[]).map((r) => ({
        handle: r.handle,
        name: r.name || r.handle,
        avatarUrl: r.avatar_url || "",
        verified: Boolean(r.verified),
        followers: Number(r.followers_count) || 0,
        photoCount: Number(r.photo_count) || 0,
      }));
      return NextResponse.json({ creators, items: [] });
    }

    if (kind === "following") {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT p.id, p.source_id, p.title, p.image_url, p.video_url, p.type,
                p.duration_sec, p.width, p.height, p.views_count, p.likes_count,
                p.is_ai, c.handle, c.name AS creator_name, c.avatar_url, c.verified
         FROM follows f
         JOIN photos p ON p.creator_id = f.creator_id
         JOIN creators c ON c.id = p.creator_id
         WHERE f.follower_id = ?
         ORDER BY p.created_at DESC
         LIMIT 200`,
        [user.id],
      );
      return NextResponse.json({ items: (rows as RowDataPacket[]).map(mapPhoto) });
    }

    const table = kind === "liked" ? "likes" : "saves";
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT p.id, p.source_id, p.title, p.image_url, p.video_url, p.type,
              p.duration_sec, p.width, p.height, p.views_count, p.likes_count,
              p.is_ai, c.handle, c.name AS creator_name, c.avatar_url, c.verified
       FROM ${table} x
       JOIN photos p ON p.id = x.photo_id
       JOIN creators c ON c.id = p.creator_id
       WHERE x.user_id = ?
       ORDER BY x.created_at DESC
       LIMIT 500`,
      [user.id],
    );
    return NextResponse.json({ items: (rows as RowDataPacket[]).map(mapPhoto) });
  } catch (e) {
    console.error("[library]", e);
    return NextResponse.json({ items: [], creators: [], error: "failed" }, { status: 500 });
  }
}
