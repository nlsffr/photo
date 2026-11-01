import { NextRequest, NextResponse } from "next/server";
import { AUDIENCE_COOKIE, CHOICE_MAX_AGE, isChoice } from "@/lib/audience-choice";
import { ANALYTICS_VISITOR_COOKIE } from "@/lib/analytics-policy";
import { isAllowedAnalyticsOrigin, readBoundedJson } from "@/lib/analytics-request";

export async function POST(request: NextRequest) {
  if (!isAllowedAnalyticsOrigin(request.url, request.headers, process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com")) {
    return NextResponse.json({ error: "origin" }, { status: 403 });
  }
  const payload = await readBoundedJson(request, 128).catch(() => null);
  const choice = payload && typeof payload === "object" && "choice" in payload ? payload.choice : null;
  if (!isChoice(choice)) return NextResponse.json({ error: "choice" }, { status: 400 });
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  const settings = { secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  response.cookies.set(AUDIENCE_COOKIE, choice, { ...settings, maxAge: CHOICE_MAX_AGE });
  if (choice === "refused") response.cookies.set(ANALYTICS_VISITOR_COOKIE, "", { ...settings, maxAge: 0, httpOnly: true });
  return response;
}
