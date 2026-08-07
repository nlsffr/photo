import { randomUUID } from "crypto";
import mysql from "mysql2/promise";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import {
  notifyContact,
  isDiscordConfigured,
  isTelegramConfigured,
} from "@/lib/telegram";
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

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool | null {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  pool = mysql.createPool({
    uri: url,
    connectionLimit: 5,
    waitForConnections: true,
  });
  return pool;
}

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
  const db = getPool();
  if (db) {
    try {
      await db.execute(
        `INSERT INTO contact_messages (id, kind, email, message, meta_json)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), kind, email, message, JSON.stringify(extras)],
      );
      saved = true;
    } catch (e) {
      console.error("[contact] db save failed", e);
    }
  }

  let notified = false;
  if (isDiscordConfigured() || isTelegramConfigured()) {
    const n = await notifyContact(text);
    if (n.ok) notified = true;
  }

  if (isEmailConfigured()) {
    const em = await sendEmail({
      subject: `[LeakFanHub] ${label} — ${email}`,
      text,
      replyTo: email,
    });
    if (em.ok) notified = true;
  }

  if (saved) {
    return Response.json({ ok: true, stored: true, notified });
  }
  if (notified) {
    return Response.json({ ok: true, stored: false, notified: true });
  }

  return Response.json({ ok: false, error: "send_failed" }, { status: 502 });
}
