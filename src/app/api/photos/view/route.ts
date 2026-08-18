import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth-db";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST { photoId } — increment views_count (once per rough session client-side). */
export async function POST(req: NextRequest) {
  let body: { photoId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const photoId = String(body.photoId || "");
  if (!photoId || photoId.length > 40) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ ok: false }, { status: 500 });

  try {
    const conn = await mysql.createConnection(url);
    await conn.execute(
      `UPDATE photos SET views_count = views_count + 1 WHERE id = ?`,
      [photoId],
    );
    // optional analytics row
    try {
      const jar = await cookies();
      const token = jar.get(SESSION_COOKIE)?.value;
      let userId: string | null = null;
      if (token) {
        const u = await getSessionUser(token);
        userId = u?.id ?? null;
      }
      await conn.execute(
        `INSERT INTO media_views (photo_id, user_id) VALUES (?, ?)`,
        [photoId, userId],
      );
    } catch {
      /* media_views may miss columns — ignore */
    }
    await conn.end();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[view]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
