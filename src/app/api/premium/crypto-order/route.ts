import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth-db";
import { SESSION_COOKIE } from "@/lib/auth";
import { createPremiumOrder } from "@/lib/premium-db";
import { getPlan, type PlanId } from "@/lib/premium-plans";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  const user = await getSessionUser(token);
  if (!user) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const planId = String(body.planId || "week") as PlanId;
  const plan = getPlan(planId);
  const cryptoAsset = String(body.cryptoAsset || "btc");
  const orderId = await createPremiumOrder({
    userId: user.id,
    planId: plan.id,
    method: "crypto",
    amountUsd: plan.priceUsd,
    cryptoAsset,
    note: String(body.txHash || "").slice(0, 200),
  });

  // Notify admin via Telegram if possible
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  const secret = process.env.PREMIUM_ADMIN_SECRET || "";
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://leakfanhub.com";
  const activateUrl = secret
    ? `${base}/api/premium/activate?secret=${encodeURIComponent(secret)}&userId=${encodeURIComponent(user.id)}&plan=${plan.id}&orderId=${orderId}`
    : "(set PREMIUM_ADMIN_SECRET)";

  if (bot && chat) {
    const text =
      `💰 Crypto Premium demand\n` +
      `User: ${user.email} (${user.id})\n` +
      `Plan: ${plan.label} ($${plan.priceUsd})\n` +
      `Asset: ${cryptoAsset}\n` +
      `Order: ${orderId}\n` +
      `TX: ${String(body.txHash || "—").slice(0, 80)}\n` +
      `Activer: ${activateUrl}`;
    try {
      await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      /* Telegram may be blocked from VPS — order still stored */
    }
  }

  return NextResponse.json({ ok: true, orderId });
}
