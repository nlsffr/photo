export const AD_PLACEMENT_KEYS = ["header", "footer", "underVideo", "feed", "popunder", "interstitial", "slider"] as const;
export type AdPlacement = typeof AD_PLACEMENT_KEYS[number];
export type AdPlacements = Record<AdPlacement, boolean>;
export const AD_PROFILES = ["current", "balanced", "intensive"] as const;
export type AdProfile = typeof AD_PROFILES[number];
export function isAdProfile(value: unknown): value is AdProfile {
  return typeof value === "string" && (AD_PROFILES as readonly string[]).includes(value);
}
export interface AdsConfig {
  revision: number;
  enabled: boolean;
  placements: AdPlacements;
  updatedAt: string | null;
  profile?: AdProfile;
}
export type AdsSave = Pick<AdsConfig, "revision" | "enabled" | "placements" | "profile">;
export type AdConsent = "accepted" | "refused" | null;
export const AD_CONSENT_COOKIE = "lfh_ad_consent";
export const AD_CONSENT_VERSION = "v1";
export const AD_CONSENT_MAX_AGE = 180 * 24 * 60 * 60;
export type AdsRuntimeReason = "disabled" | "consent_required" | "consent_refused" | "premium" | "owner" | "unavailable" | "eligible";
export interface AdsRuntime {
  enabled: boolean;
  effectiveEnabled: boolean;
  revision: number;
  needsConsent: boolean;
  consent: AdConsent;
  placements: AdPlacements;
  reason: AdsRuntimeReason;
  profile?: AdProfile;
}
export function emptyAdPlacements(): AdPlacements {
  return Object.fromEntries(AD_PLACEMENT_KEYS.map(key => [key, false])) as AdPlacements;
}
export function parseAdConsent(value: unknown): AdConsent {
  if (typeof value === "string") { try { value = decodeURIComponent(value); } catch { return null; } }
  return value === "v1:accepted" ? "accepted" : value === "v1:refused" ? "refused" : null;
}
