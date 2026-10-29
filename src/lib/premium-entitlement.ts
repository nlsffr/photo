export type PremiumEntitlementState = "active" | "expired" | "missing";

export function premiumEntitlementState(
  input: {
    isPremium: boolean;
    periodEnd: Date | string | null | undefined;
  },
  now = Date.now(),
): PremiumEntitlementState {
  if (!input.isPremium || !input.periodEnd) return "missing";
  const end = new Date(input.periodEnd).getTime();
  if (!Number.isFinite(end) || end <= now) return "expired";
  return "active";
}
