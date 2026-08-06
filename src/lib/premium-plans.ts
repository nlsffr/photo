export type PlanId = "week" | "month" | "quarter" | "year";
export type PayMethod = "card" | "stars" | "crypto";

export interface PremiumPlan {
  id: PlanId;
  label: string;
  labelEn: string;
  priceUsd: number;
  /** Approximate Telegram Stars (1 Star ≈ $0.02 — adjust via env later) */
  stars: number;
  days: number;
  popular?: boolean;
  perDay: string;
}

export const PLANS: PremiumPlan[] = [
  {
    id: "week",
    label: "1 semaine",
    labelEn: "1 week",
    priceUsd: 10.99,
    stars: 550,
    days: 7,
    popular: true,
    perDay: "$1.57/j",
  },
  {
    id: "month",
    label: "1 mois",
    labelEn: "1 month",
    priceUsd: 19.99,
    stars: 1000,
    days: 30,
    perDay: "$0.67/j",
  },
  {
    id: "quarter",
    label: "3 mois",
    labelEn: "3 months",
    priceUsd: 39.99,
    stars: 2000,
    days: 90,
    perDay: "$0.44/j",
  },
  {
    id: "year",
    label: "12 mois",
    labelEn: "12 months",
    priceUsd: 99,
    stars: 4950,
    days: 365,
    perDay: "$0.27/j",
  },
];

export function getPlan(id: string | null | undefined): PremiumPlan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

/** Telegram bot username without @ — set TELEGRAM_BOT_USERNAME in env */
export function telegramPremiumLink(plan: PlanId, userId?: string): string {
  const bot =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TELEGRAM_BOT) ||
    "LeakFanHubBot";
  const payload = `premium_${plan}${userId ? `_${userId.slice(0, 12)}` : ""}`;
  return `https://t.me/${bot}?start=${encodeURIComponent(payload)}`;
}
