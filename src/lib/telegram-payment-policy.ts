import { createHash, randomBytes } from "node:crypto";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOT_USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;

export function createLaunchToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLaunchToken(token: string): string {
  if (!TOKEN_RE.test(token)) throw new Error("invalid_launch_token");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function parseStartToken(text: string): string | null {
  const match = /^\/start(?:@[A-Za-z0-9_]{5,32})? p_([A-Za-z0-9_-]{43})$/.exec(
    text.trim(),
  );
  return match?.[1] ?? null;
}

export function buildTelegramDeepLink(botUsername: string, token: string): string {
  const normalized = botUsername.replace(/^@/, "");
  if (!BOT_USERNAME_RE.test(normalized)) throw new Error("invalid_bot_username");
  if (!TOKEN_RE.test(token)) throw new Error("invalid_launch_token");
  return `https://t.me/${normalized}?start=p_${token}`;
}

export function buildInvoicePayload(orderId: string): string {
  if (!ORDER_ID_RE.test(orderId)) throw new Error("invalid_order_id");
  return `lfh:${orderId.toLowerCase()}`;
}

export function parseInvoicePayload(payload: string): string | null {
  if (!payload.startsWith("lfh:")) return null;
  const orderId = payload.slice(4);
  return ORDER_ID_RE.test(orderId) ? orderId.toLowerCase() : null;
}

export function isLaunchExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

interface PreCheckoutInput {
  orderStatus: string;
  expiresAt: Date;
  now?: Date;
  orderTelegramUserId: string;
  queryTelegramUserId: string;
  orderCurrency: string;
  queryCurrency: string;
  orderAmount: number;
  queryAmount: number;
  expectedPayload: string;
  queryPayload: string;
}

type PreCheckoutResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "order_not_payable"
        | "order_expired"
        | "telegram_user_mismatch"
        | "currency_mismatch"
        | "amount_mismatch"
        | "payload_mismatch";
    };

export function validatePreCheckout(input: PreCheckoutInput): PreCheckoutResult {
  if (input.orderStatus !== "claimed" && input.orderStatus !== "invoice_sent") {
    return { ok: false, code: "order_not_payable" };
  }
  if (isLaunchExpired(input.expiresAt, input.now)) {
    return { ok: false, code: "order_expired" };
  }
  if (input.orderTelegramUserId !== input.queryTelegramUserId) {
    return { ok: false, code: "telegram_user_mismatch" };
  }
  if (input.orderCurrency !== "XTR" || input.queryCurrency !== "XTR") {
    return { ok: false, code: "currency_mismatch" };
  }
  if (input.orderAmount !== input.queryAmount) {
    return { ok: false, code: "amount_mismatch" };
  }
  if (input.expectedPayload !== input.queryPayload) {
    return { ok: false, code: "payload_mismatch" };
  }
  return { ok: true };
}
