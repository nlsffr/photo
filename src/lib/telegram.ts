/**
 * Notifications Telegram / Discord pour contact.
 * TELEGRAM_* souvent bloqué sur VPS → fallback Discord webhook + DB.
 */

export type NotifyResult =
  | { ok: true; channel: "telegram" | "discord" }
  | { ok: false; reason: "not_configured" | "send_failed" };

export function isTelegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_CHAT_ID?.trim(),
  );
}

export function isDiscordConfigured(): boolean {
  return Boolean(process.env.DISCORD_WEBHOOK_URL?.trim());
}

export async function sendTelegram(text: string): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { ok: false, reason: "not_configured" };

  const body = text.length > 4000 ? text.slice(0, 3990) + "\n…" : text;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        disable_web_page_preview: true,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, reason: "send_failed" };
    const json = (await res.json()) as { ok?: boolean };
    if (!json.ok) return { ok: false, reason: "send_failed" };
    return { ok: true, channel: "telegram" };
  } catch {
    return { ok: false, reason: "send_failed" };
  }
}

export async function sendDiscord(text: string): Promise<NotifyResult> {
  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!url) return { ok: false, reason: "not_configured" };

  const content = text.length > 1900 ? text.slice(0, 1890) + "\n…" : text;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, reason: "send_failed" };
    return { ok: true, channel: "discord" };
  } catch {
    return { ok: false, reason: "send_failed" };
  }
}

/** Essaie Discord puis Telegram. */
export async function notifyContact(text: string): Promise<NotifyResult> {
  if (isDiscordConfigured()) {
    const d = await sendDiscord(text);
    if (d.ok) return d;
  }
  if (isTelegramConfigured()) {
    const t = await sendTelegram(text);
    if (t.ok) return t;
  }
  return { ok: false, reason: "send_failed" };
}
