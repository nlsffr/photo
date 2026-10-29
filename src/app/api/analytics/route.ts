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
import {
  isAllowedAnalyticsOrigin,
  readBoundedJson,
} from "@/lib/analytics-request";

export const dynamic = "force-dynamic";
const MAX_ANALYTICS_BODY_BYTES = 4_096;

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

  if (
    !isAllowedAnalyticsOrigin(
      request.url,
      request.headers,
      process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com",
    )
  ) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  const secret =
    process.env.ANALYTICS_HASH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "";
  if (secret.length < 16) {
    console.error("[analytics] hash secret is not configured");
    return NextResponse.json(
      { error: "analytics_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
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
    body = await readBoundedJson(request, MAX_ANALYTICS_BODY_BYTES);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "analytics_payload_too_large"
    ) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const event = parseAnalyticsPayload(body);
  if (!event) return NextResponse.json({ error: "invalid_event" }, { status: 400 });

  const existing = request.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value;
  const visitorToken = isValidAnalyticsVisitorToken(existing)
    ? existing
    : createAnalyticsVisitorToken();
  const newVisitorToken = visitorToken === existing ? undefined : visitorToken;
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

