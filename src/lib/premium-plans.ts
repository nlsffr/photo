export type PlanId = "week" | "month" | "quarter" | "year";
export type PayMethod = "stars";

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

export function isPlanId(id: unknown): id is PlanId {
  return typeof id === "string" && PLANS.some((plan) => plan.id === id);
}

export function getPlan(id: string | null | undefined): PremiumPlan {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error("unknown_plan");
  return plan;
}

/** Telegram bot username without @ — set TELEGRAM_BOT_USERNAME in env */
