import { cookies } from "next/headers";
import { registerUser, createSession } from "@/lib/auth-db";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  validateUsername,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { anonKey, rateLimit, sweep } from "@/lib/ratelimit";

const MESSAGES: Record<string, string> = {
  email_taken: "Cet e-mail est déjà utilisé.",
  username_taken: "Ce nom d’utilisateur est déjà pris.",
  no_db: "Les comptes ne sont pas encore activés sur ce site.",
  failed: "La création du compte a échoué. Réessaie.",
};

export async function POST(request: Request) {
  sweep();
  const coarse = request.headers.get("x-ratelimit-bucket") ?? "shared-auth-bucket";
  const { allowed } = rateLimit(anonKey(`register:${coarse}`), 10, 600_000);
  if (!allowed) {
    return Response.json({ ok: false, error: "rate_limited", message: "Trop de tentatives, réessaie plus tard." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const err =
    validateEmail(email) || validateUsername(username) || validatePassword(password);
  if (err) {
    return Response.json({ ok: false, error: "validation", message: err }, { status: 422 });
  }

  const result = await registerUser({ email, username, password });
  if (!result.ok) {
    const status = result.error === "no_db" ? 503 : 409;
    return Response.json(
      { ok: false, error: result.error, message: MESSAGES[result.error] },
      { status },
    );
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
