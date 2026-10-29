import { NextRequest, NextResponse } from "next/server";
import { recordAnalyticsEvent, pruneStaleAnalyticsPresence } from "@/lib/analytics-db";
import {
  ANALYTICS_VISITOR_COOKIE,
  ANALYTICS_VISITOR_MAX_AGE_SECONDS,
  createAnalyticsVisitorToken,
  hashAnalyticsVisitorToken,
  isAnalyticsBot,
  isValidAnalyticsVisitorToken,
  parseAnalyticsPayload,
} from "@/lib/analytics-policy";
import { rateLimitRequest, sweep } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

function noContent(visitorToken?: string) {
  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
  if (visitorToken) {
    response.cookies.set(ANALYTICS_VISITOR_COOKIE, visitorToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ANALYTICS_VISITOR_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export async function POST(request: NextRequest) {
  sweep();
  if (isAnalyticsBot(request.headers.get("user-agent"))) return noContent();

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const limit = rateLimitRequest(request, {
    scope: "analytics",
    limit: 180,
    peerLimit: 20_000,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) return noContent();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const event = parseAnalyticsPayload(body);
  if (!event) return NextResponse.json({ error: "invalid_event" }, { status: 400 });

  const existing = request.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value;
  const visitorToken = isValidAnalyticsVisitorToken(existing)
    ? existing
    : createAnalyticsVisitorToken();
  const newVisitorToken = visitorToken === existing ? undefined : visitorToken;
  const secret =
    process.env.ANALYTICS_HASH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "";

  if (secret.length < 16) return noContent(newVisitorToken);

  try {
    const visitorHash = hashAnalyticsVisitorToken(visitorToken, secret);
    await recordAnalyticsEvent(visitorHash, event);
    if (Math.random() < 0.01) {
      await pruneStaleAnalyticsPresence();
    }
  } catch (error) {
    const code = (error as { code?: string }).code ?? "write_failed";
    console.error("[analytics]", code);
  }

  return noContent(newVisitorToken);
}

