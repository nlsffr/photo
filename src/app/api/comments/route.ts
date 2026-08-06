import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const photoId = req.nextUrl.searchParams.get("photoId");
  if (!photoId) return NextResponse.json({ items: [] });
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ items: [] });
  try {
    const conn = await mysql.createConnection(url);
    const [rows] = await conn.execute(
      `SELECT c.id, c.body, c.created_at, u.username, u.email
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.photo_id = ? AND c.is_hidden = 0
       ORDER BY c.created_at DESC LIMIT 50`,
      [photoId],
    );
    await conn.end();
    return NextResponse.json({ items: rows });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const photoId = String(body.photoId || "");
    const userId = String(body.userId || "");
    const text = String(body.body || "").trim().slice(0, 1000);
    if (!photoId || !userId || text.length < 2) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const url = process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ error: "no db" }, { status: 500 });
    const conn = await mysql.createConnection(url);
    const id = randomUUID();
    await conn.execute(
      `INSERT INTO comments (id, photo_id, user_id, body) VALUES (?, ?, ?, ?)`,
      [id, photoId, userId, text],
    );
    await conn.end();
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
