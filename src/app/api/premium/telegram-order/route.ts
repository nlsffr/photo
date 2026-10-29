import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth-db";
import { getDbPool } from "@/lib/db-pool";
import { readBoundedJson } from "@/lib/analytics-request";
import { isPlanId } from "@/lib/premium-plans";
import { rateLimitRequest, sweep } from "@/lib/ratelimit";
import { createTelegramPremiumOrder } from "@/lib/telegram-order-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  sweep();
  const { allowed, resetAt } = rateLimitRequest(request, {
    scope: "premium-telegram-order",
    limit: 10,
    peerLimit: 100,
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

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionUser(token) : null;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await readBoundedJson(request, 4096);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_payload");
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "analytics_payload_too_large";
    return NextResponse.json(
      { error: tooLarge ? "payload_too_large" : "bad_request" },
      { status: tooLarge ? 413 : 400 },
    );
  }
  if (!isPlanId(body.planId)) {
    return NextResponse.json({ error: "unknown_plan" }, { status: 422 });
  }

  const db = getDbPool();
  if (!db) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  try {
    const order = await createTelegramPremiumOrder(db, {
      userId: user.id,
      planId: body.planId,
      botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT || "LeakFanHubBot",
    });
    return NextResponse.json(order, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[premium-telegram-order] create failed", error);
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }
}
