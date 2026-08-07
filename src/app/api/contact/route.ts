import { sendEmail, isEmailConfigured } from "@/lib/email";
import { sendTelegram, isTelegramConfigured } from "@/lib/telegram";
import { anonKey, rateLimit, sweep } from "@/lib/ratelimit";

const KINDS: Record<string, string> = {
  support: "Support",
  signalement: "Signalement de contenu",
  partenariats: "Partenariat / créateur",
  presse: "Presse",
  dmca: "Notification DMCA",
  contact: "Contact",
};

const MAX = { field: 300, message: 5000 };

function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function isEmailish(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(request: Request) {
  sweep();
  const coarse =
    request.headers.get("x-ratelimit-bucket") ?? "shared-contact-bucket";
  const { allowed, resetAt } = rateLimit(anonKey(`contact:${coarse}`), 5, 600_000);
  if (!allowed) {
    return Response.json(
      { ok: false, error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) },
      },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const kind = clean(body.kind, 40);
  const label = KINDS[kind] ?? "Contact";
  const email = clean(body.email, MAX.field);
  const message = clean(body.message, MAX.message);

  if (!isEmailish(email)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 422 });
  }
  if (message.length < 3) {
    return Response.json({ ok: false, error: "empty_message" }, { status: 422 });
  }

  const extraKeys = ["reason", "url", "name", "page", "outlet", "deadline", "link", "fullname", "work"];
  const extras = extraKeys
    .map((k) => [k, clean(body[k], MAX.field)] as const)
    .filter(([, v]) => v.length > 0);

  const lines = [
    `🔔 LeakFanHub — ${label}`,
    `De : ${email}`,
    ...extras.map(([k, v]) => `${k} : ${v}`),
    "",
    "Message :",
    message,
  ];
  const text = lines.join("\n");

  const hasTelegram = isTelegramConfigured();
  const hasEmail = isEmailConfigured();

  if (!hasTelegram && !hasEmail) {
    return Response.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  let delivered = false;

  // Priorité Telegram (ce que tu veux)
  if (hasTelegram) {
    const tg = await sendTelegram(text);
    if (tg.ok) delivered = true;
  }

  // Email en secours / en plus si configuré
  if (hasEmail) {
    const em = await sendEmail({
      subject: `[LeakFanHub] ${label} — ${email}`,
      text,
      replyTo: email,
    });
    if (em.ok) delivered = true;
  }

  if (!delivered) {
    return Response.json({ ok: false, error: "send_failed" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
