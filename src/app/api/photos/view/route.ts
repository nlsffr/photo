import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth-db";
import { SESSION_COOKIE } from "@/lib/auth";
import { getDbPool } from "@/lib/db-pool";
import { recordLocalPhotoView } from "@/lib/source-engagement";
import { checkPhotoViewRateLimit } from "@/lib/photo-view-policy";
import { rateLimitRequest, sweep } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** POST { photoId } — record one first-party view. */
export async function POST(req: NextRequest) {
  sweep();
  const rate = checkPhotoViewRateLimit(req, rateLimitRequest);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

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

  const db = getDbPool();
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });

  try {
    let userId: string | null = null;
    try {
      const jar = await cookies();
      const token = jar.get(SESSION_COOKIE)?.value;
      if (token) {
        const u = await getSessionUser(token);
        userId = u?.id ?? null;
      }
    } catch {
      userId = null;
    }
    await recordLocalPhotoView(db, photoId, userId);
    return NextResponse.json(
      { ok: true },
      { headers: { "X-RateLimit-Remaining": String(rate.remaining) } },
    );
  } catch (e) {
    console.error("[view]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
