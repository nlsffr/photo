import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth-db";
import { getDbPool } from "@/lib/db-pool";
import { readBoundedJson } from "@/lib/analytics-request";
import { storeReportWithOutbox } from "@/lib/notification-outbox";
import { rateLimitRequest, sweep } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  sweep();
  const { allowed, resetAt } = rateLimitRequest(req, {
    scope: "reports",
    limit: 8,
    peerLimit: 160,
    windowMs: 600_000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) },
      },
    );
  }

  try {
    const parsed = await readBoundedJson(req, 4096);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const body = parsed as Record<string, unknown>;
    const requestedReason = typeof body.reason === "string" ? body.reason : "";
    const reason = (["dmca", "illegal", "spam", "other"].includes(requestedReason)
      ? requestedReason
      : "other") as "dmca" | "illegal" | "spam" | "other";
    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : null;
    const photoId = typeof body.photoId === "string" ? body.photoId : null;
    const creatorId = typeof body.creatorId === "string" ? body.creatorId : null;

    if (!photoId && !creatorId && !message) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }

    const db = getDbPool();
    if (!db) return NextResponse.json({ error: "no db" }, { status: 500 });

    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const user = token ? await getSessionUser(token) : null;
    const text = [
      "🚩 LeakFanHub — Nouveau signalement",
      `Raison : ${reason}`,
      photoId ? `Média : ${photoId}` : "",
      creatorId ? `Créateur : ${creatorId}` : "",
      message ? `Message : ${message}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await storeReportWithOutbox(db, {
      reporterUserId: user?.id ?? null,
      photoId,
      creatorId,
      reason,
      message,
      notificationText: text,
    });
    return NextResponse.json({ ok: true, stored: true, queued: true, notified: false });
  } catch (e) {
    if (e instanceof Error && e.message === "analytics_payload_too_large") {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    if (e instanceof Error && e.message === "analytics_invalid_json") {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    console.error("reports", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
