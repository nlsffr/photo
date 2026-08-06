import { NextResponse } from "next/server";

/**
 * Creates a Stripe Checkout Session for Premium ($4.99/mo).
 * Requires STRIPE_SECRET_KEY + STRIPE_PRICE_ID in env.
 * Without them, returns { demo: true } so the client can activate demo premium.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.headers.get("origin") ||
    "http://127.0.0.1";

  if (!secret || !priceId) {
    return NextResponse.json({
      demo: true,
      message: "Stripe non configuré — mode démo Premium",
    });
  }

  try {
    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("success_url", `${origin}/premium?premium_success=1`);
    body.set("cancel_url", `${origin}/premium?canceled=1`);
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
    body.set("allow_promotion_codes", "true");

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !data.url) {
      return NextResponse.json(
        { error: data.error?.message || "Stripe error" },
        { status: 502 },
      );
    }
    return NextResponse.json({ url: data.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "checkout_failed" },
      { status: 500 },
    );
  }
}
