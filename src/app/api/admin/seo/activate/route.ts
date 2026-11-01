import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_DAYS, hashPassword, newSessionToken, sessionExpiry } from "@/lib/auth";
import { getDbPool } from "@/lib/db-pool";
import { activateSeoEditor, type ActivationDatabase } from "@/lib/seo-editor-activation";
import { hasSeoWriteOrigin, isSeoEditorId, readSeoEditorJson, SeoEditorRequestError } from "@/lib/seo-editor-access";
import { rateLimitRequest, sweep } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request) {
  if (!hasSeoWriteOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403, headers });
  sweep();
  if (!rateLimitRequest(request, { scope: "seo-activation", limit: 5, peerLimit: 100, windowMs: 600_000 }).allowed) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers });
  }
  let input: unknown;
  try { input = await readSeoEditorJson(request); }
  catch (error) {
    return Response.json({ error: "bad_request" }, { status: error instanceof SeoEditorRequestError ? error.status : 400, headers });
  }
  const db = getDbPool();
  if (!db) return Response.json({ error: "unavailable" }, { status: 503, headers });
  const result = await activateSeoEditor(db as unknown as ActivationDatabase, input, {
    isAllowed: isSeoEditorId, hashPassword, newSessionToken, sessionExpiry,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 410 : 503, headers });
  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
  return Response.json({ ok: true }, { headers });
}
