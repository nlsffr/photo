import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reason = ["dmca", "illegal", "spam", "other"].includes(body.reason)
      ? body.reason
      : "other";
    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : null;
    const photoId = typeof body.photoId === "string" ? body.photoId : null;
    const creatorId = typeof body.creatorId === "string" ? body.creatorId : null;

    if (!photoId && !creatorId && !message) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }

    const url = process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ error: "no db" }, { status: 500 });

    const conn = await mysql.createConnection(url);
    await conn.execute(
      `INSERT INTO reports (id, photo_id, creator_id, reason, message, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [randomUUID(), photoId, creatorId, reason, message],
    );
    await conn.end();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("reports", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
