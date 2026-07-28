import { cookies } from "next/headers";
import { verifyCredentials, createSession } from "@/lib/auth-db";
import { SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/auth";
import { anonKey, rateLimit, sweep } from "@/lib/ratelimit";

export async function POST(request: Request) {
  sweep();
  const coarse = request.headers.get("x-ratelimit-bucket") ?? "shared-auth-bucket";
  // Stricter than register: brute-force protection. 10 tries / 10 min.
  const { allowed } = rateLimit(anonKey(`login:${coarse}`), 10, 600_000);
  if (!allowed) {
    return Response.json(
      { ok: false, error: "rate_limited", message: "Trop de tentatives, réessaie plus tard." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // Accept either an email or a username in the "identifier" field.
  const identifier = String(body.identifier ?? body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!identifier || !password) {
    return Response.json(
      { ok: false, error: "invalid_credentials", message: "Identifiants incorrects." },
      { status: 401 },
    );
  }

  const result = await verifyCredentials(identifier, password);
  if (!result.ok) {
    const status = result.error === "no_db" ? 503 : 401;
    const message =
      result.error === "no_db"
        ? "Les comptes ne sont pas encore activés sur ce site."
        : "Identifiants incorrects.";
    return Response.json({ ok: false, error: result.error, message }, { status });
  }

  const token = await createSession(result.user.id);
  if (token) {
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    });
  }

  return Response.json({ ok: true, user: result.user });
}
