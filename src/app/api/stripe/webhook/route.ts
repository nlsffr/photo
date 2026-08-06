import { NextResponse } from "next/server";

/**
 * Stripe webhook stub — mark user premium in DB when payment succeeds.
 * Configure STRIPE_WEBHOOK_SECRET in production.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await request.text();

  // Without signature verification in demo — log and accept
  if (!secret) {
    console.info("[stripe webhook] no secret configured, ack", raw.slice(0, 200));
    return NextResponse.json({ received: true, demo: true });
  }

  // Production: verify signature with Stripe library when added
  console.info("[stripe webhook] received", raw.slice(0, 120));
  return NextResponse.json({ received: true });
}
