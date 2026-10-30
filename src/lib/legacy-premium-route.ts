import { NextResponse } from "next/server";

export function legacyPremiumGone() {
  return NextResponse.json(
    {
      error: "payment_method_retired",
      message: "Ce moyen de paiement n’est plus disponible. Utilisez Telegram Stars.",
      replacement: "/api/premium/telegram-order",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
