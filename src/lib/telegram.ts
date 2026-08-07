/**
 * Notifications Telegram pour contact / DMCA / signalements.
 * Env : TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 */

export type TelegramResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" };

export function isTelegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_CHAT_ID?.trim(),
  );
}

export async function sendTelegram(text: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { ok: false, reason: "not_configured" };

  // Telegram limite ~4096 caractères par message
  const body = text.length > 4000 ? text.slice(0, 3990) + "\n…" : text;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) return { ok: false, reason: "send_failed" };
    const json = (await res.json()) as { ok?: boolean };
    if (!json.ok) return { ok: false, reason: "send_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "send_failed" };
  }
}
