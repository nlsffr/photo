import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getSessionUser } from "@/lib/auth-db";
import { SESSION_COOKIE } from "@/lib/auth";
import { getDbPool } from "@/lib/db-pool";
import { activeMediaSql } from "@/lib/providers/active-content-sql";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const photoId = req.nextUrl.searchParams.get("photoId");
  if (!photoId) return NextResponse.json({ items: [] });
  try {
    const db = getDbPool();
    if (!db) {
      return NextResponse.json({ error: "comments_unavailable" }, { status: 503 });
    }
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT cm.id, cm.body, cm.created_at, u.username
       FROM photos p
       JOIN creators owner ON owner.id = p.creator_id
       LEFT JOIN comments cm
         ON cm.photo_id = p.id AND cm.is_hidden = 0
       LEFT JOIN users u ON u.id = cm.user_id
       WHERE p.id = ?
         AND ${activeMediaSql("p", "owner")}
       ORDER BY cm.created_at DESC LIMIT 50`,
      [photoId],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "photo_not_found" }, { status: 404 });
    }
    return NextResponse.json({
      items: rows.filter((row) => row.id != null).map((row) => ({
        id: row.id,
        body: row.body,
        created_at: row.created_at,
        username: row.username ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "comments_unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }
    const user = await getSessionUser(token);
    if (!user) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }

    const body = await req.json();
    const photoId = String(body.photoId || "");
    const text = String(body.body || "").trim().slice(0, 1000);
    if (!photoId || text.length < 2) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const db = getDbPool();
    if (!db) return NextResponse.json({ error: "no db" }, { status: 500 });
    const id = randomUUID();
    const [inserted] = await db.execute<ResultSetHeader>(
      `INSERT INTO comments (id, photo_id, user_id, body)
       SELECT ?, p.id, ?, ?
       FROM photos p
       JOIN creators owner ON owner.id = p.creator_id
       WHERE p.id = ?
         AND ${activeMediaSql("p", "owner")}
       LIMIT 1`,
      [id, user.id, text, photoId],
    );
    if (inserted.affectedRows !== 1) {
      return NextResponse.json({ error: "photo_not_found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      id,
      username: user.username,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
