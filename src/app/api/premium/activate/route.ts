import { legacyPremiumGone } from "@/lib/legacy-premium-route";

export const dynamic = "force-dynamic";

export async function GET() {
  return legacyPremiumGone();
}

export async function POST() {
  return legacyPremiumGone();
}
