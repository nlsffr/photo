import { NextResponse } from "next/server";
import { AUDIENCE_COOKIE, CHOICE_MAX_AGE } from "@/lib/audience-choice";
import { ANALYTICS_VISITOR_COOKIE } from "@/lib/analytics-policy";
import { isAllowedAnalyticsOrigin, readBoundedJson } from "@/lib/analytics-request";
import { AD_CONSENT_COOKIE, AD_CONSENT_MAX_AGE, AD_CONSENT_VERSION } from "@/lib/ads-contract";
import { isConsentChoiceRequest } from "@/lib/consent-choice-contract";
import { hasSeoWriteOrigin } from "@/lib/seo-editor-access";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request) {
  if (!isAllowedAnalyticsOrigin(request.url, request.headers, process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com")) {
    return NextResponse.json({ error: "origin" }, { status: 403, headers });
  }
  const payload = await readBoundedJson(request, 128).catch(() => null);
  if (!isConsentChoiceRequest(payload)) return NextResponse.json({ error: "choice" }, { status: 400, headers });
  const { choice, advertisingChoice } = payload;
  if (advertisingChoice !== undefined) {
    if (!hasSeoWriteOrigin(request)) return NextResponse.json({ error: "origin" }, { status: 403, headers });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
      return NextResponse.json({ error: "invalid_request" }, { status: 415, headers });
    }
  }
  const response = new NextResponse(null, { status: 204, headers });
  const settings = { secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  response.cookies.set(AUDIENCE_COOKIE, choice, { ...settings, maxAge: CHOICE_MAX_AGE });
  if (choice === "refused") response.cookies.set(ANALYTICS_VISITOR_COOKIE, "", { ...settings, maxAge: 0, httpOnly: true });
  if (advertisingChoice !== undefined) response.cookies.set(AD_CONSENT_COOKIE, `${AD_CONSENT_VERSION}:${advertisingChoice}`, { ...settings, httpOnly: false, maxAge: AD_CONSENT_MAX_AGE });
  return response;
}
