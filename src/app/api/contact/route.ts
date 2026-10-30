import { sendEmail, isEmailConfigured } from "@/lib/email";
import { getDbPool } from "@/lib/db-pool";
import { readBoundedJson } from "@/lib/analytics-request";
import { storeContactWithOutbox } from "@/lib/notification-outbox";
import { rateLimitRequest, sweep } from "@/lib/ratelimit";

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
  const { allowed, resetAt } = rateLimitRequest(request, {
    scope: "contact",
    limit: 5,
    peerLimit: 100,
    windowMs: 600_000,
  });
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
    const parsed = await readBoundedJson(request, 8192);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_payload");
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "analytics_payload_too_large";
    return Response.json(
      { ok: false, error: tooLarge ? "payload_too_large" : "bad_request" },
      { status: tooLarge ? 413 : 400 },
    );
  }

  const kind = clean(body.kind, 40) || "contact";
  const label = KINDS[kind] ?? "Contact";
  const email = clean(body.email, MAX.field);
  const message = clean(body.message, MAX.message);

  if (!isEmailish(email)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 422 });
  }
  if (message.length < 3) {
    return Response.json({ ok: false, error: "empty_message" }, { status: 422 });
  }

  const extraKeys = [
    "reason",
    "url",
    "name",
    "page",
    "outlet",
    "deadline",
    "link",
    "original",
    "work",
  ];
  const extras: Record<string, string> = {};
  for (const k of extraKeys) {
    const v = clean(body[k], MAX.field);
    if (v) extras[k] = v;
  }

  const lines = [
    `🔔 LeakFanHub — ${label}`,
    `De : ${email}`,
    ...Object.entries(extras).map(([k, v]) => `${k} : ${v}`),
    "",
    "Message :",
    message,
  ];
  const text = lines.join("\n");

  let saved = false;
  let queued = false;
  const db = getDbPool();
  if (db) {
    try {
      await storeContactWithOutbox(db, {
        kind,
        email,
        message,
        extras,
        notificationText: text,
      });
      saved = true;
      queued = true;
    } catch (e) {
      console.error("[contact] atomic save/outbox failed", e);
    }
  }

  let notified = false;
  if (isEmailConfigured()) {
    const em = await sendEmail({
      subject: `[LeakFanHub] ${label} — ${email}`,
      text,
      replyTo: email,
    });
    if (em.ok) notified = true;
  }

  if (saved) {
    return Response.json({ ok: true, stored: true, queued, notified });
  }
  if (notified) {
    return Response.json({ ok: true, stored: false, queued: false, notified: true });
  }

  return Response.json({ ok: false, error: "send_failed" }, { status: 502 });
}
