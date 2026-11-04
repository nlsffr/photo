import type { AdConsent, AdsRuntime } from "./ads-contract";
// @ts-expect-error Native Node tests require explicit suffixes.
import { AD_PLACEMENT_KEYS, AD_CONSENT_COOKIE, parseAdConsent } from "./ads-contract.ts";

export function parseBrowserAdConsent(cookieHeader: string): AdConsent {
  const value = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(AD_CONSENT_COOKIE + "="))?.slice(AD_CONSENT_COOKIE.length + 1);
  return parseAdConsent(value);
}

const PRIVATE_ROUTES = new Set(["admin", "api", "_next", "connexion", "inscription", "premium", "add", "account", "profil", "favoris", "abonnements", "contact", "confidentialite", "conditions", "mentions-legales", "dmca", "trust-and-safety", "welcome"]);

export function isAdPagePath(pathname: string): boolean {
  const parts = pathname.split(/[?#]/)[0].split("/").filter(Boolean);
  if (["en", "fr", "es", "de", "it", "pt", "nl"].includes(parts[0])) parts.shift();
  return !PRIVATE_ROUTES.has(parts[0]) && !parts.some(part => /\.(?:js|json|xml|txt|css)$/i.test(part));
}

export function parseAdsRuntime(value: unknown): AdsRuntime | null {
  if (!value || typeof value !== "object") return null;
  const v = value as AdsRuntime;
  if (typeof v.enabled !== "boolean" || typeof v.effectiveEnabled !== "boolean"
    || typeof v.needsConsent !== "boolean" || !Number.isSafeInteger(v.revision) || v.revision < 0
    || ![null, "accepted", "refused"].includes(v.consent)
    || !["disabled", "consent_required", "consent_refused", "premium", "owner", "unavailable", "eligible"].includes(v.reason)
    || !v.placements || AD_PLACEMENT_KEYS.some(key => typeof v.placements[key] !== "boolean")) return null;
  return v;
}

export function canServeAds(input: {
  runtime: AdsRuntime | null; ageConfirmed: boolean | undefined; consent: AdConsent;
  sessionLoading: boolean; premiumReady: boolean; isPremium: boolean; pathname: string; fresh: boolean;
}): boolean {
  return input.runtime?.enabled === true && input.runtime.effectiveEnabled === true
    && input.runtime.reason === "eligible" && input.runtime.consent === "accepted"
    && input.ageConfirmed === true && input.consent === "accepted" && !input.sessionLoading
    && input.premiumReady && !input.isPremium && input.fresh && isAdPagePath(input.pathname);
}

/** Media indexes stay unchanged; the inserted slide has its own key and no media index. */
export function isFeedAdPosition(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 4 && (index - 4) % 4 === 0 && index < length - 1;
}
