import type { AdPlacement, AdProfile } from "./ads-contract";
import type { AdDevice } from "./ads-registry";
// @ts-expect-error Native Node requires explicit suffixes.
import { AD_PLACEMENT_KEYS, isAdProfile } from "./ads-contract.ts";

export type AdSlotContext = "page" | "pause";
export type AdProvider = "trafficstars" | "exoclick";

/** One provider per slot. The feed ordinal counts inserted ads, never media IDs. */
export function selectAdProvider(input: {
  profile?: AdProfile; placement: AdPlacement; device: AdDevice; context?: AdSlotContext; ordinal?: number;
}): AdProvider | null {
  const profile = input.profile === undefined ? "current" : input.profile;
  const context = input.context === undefined ? "page" : input.context;
  if (!isAdProfile(profile) || !["desktop", "mobile"].includes(input.device)
    || !(AD_PLACEMENT_KEYS as readonly string[]).includes(input.placement) || !["page", "pause"].includes(context)) return null;
  if (input.placement === "feed") {
    if (context !== "page" || !Number.isSafeInteger(input.ordinal) || input.ordinal! < 0 || input.ordinal! > 1_000_000) return null;
    if (profile === "intensive") return "exoclick";
    return profile === "balanced" && input.ordinal! % 2 === 1 ? "exoclick" : "trafficstars";
  }
  if (input.ordinal !== undefined) return null;
  if (context === "pause") return input.placement === "underVideo" && profile === "intensive" ? "exoclick" : null;
  if ((profile === "current" || profile === "balanced") && input.placement === "footer") return "exoclick";
  if (profile === "balanced" && input.placement === "underVideo") return "exoclick";
  return "trafficstars";
}
