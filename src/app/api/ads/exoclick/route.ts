import { cookies } from "next/headers";
import { getAdsRuntime } from "@/lib/ads-runtime";
import { AD_CONSENT_COOKIE, isAdProfile, parseAdConsent, type AdPlacement } from "@/lib/ads-contract";
import { selectAdProvider, type AdSlotContext } from "@/lib/ads-provider-plan";
import { getExoclickSpot } from "@/lib/exoclick-registry";
import { buildExoclickBannerDocument } from "@/lib/exoclick-banner";
import { buildExoclickVastDocument } from "@/lib/exoclick-vast";
import { isAdPagePath } from "@/lib/ads-client-policy";
import { isLocale, isSystemPath, resolveLocalizedPage, stripLocalePrefix, supportedLocaleForPath, type Locale } from "@/lib/i18n/config";
import { normalizeTagSlug } from "@/lib/seo-policy";
import { adsCopy } from "@/lib/ads-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "no-referrer" };
const deny = (status: number) => new Response("", { status, headers });
const REQUIRED = ["placement", "device", "context", "profile", "nonce", "path", "locale"];
const labels: Record<Locale, { skip: string; visit: string; play: string; unavailable: string }> = {
  en: { skip: "Skip advertisement", visit: "Visit advertiser", play: "Play advertisement", unavailable: "Advertisement unavailable" },
  fr: { skip: "Passer la publicité", visit: "Voir l’annonceur", play: "Lire la publicité", unavailable: "Publicité indisponible" },
  es: { skip: "Saltar anuncio", visit: "Visitar al anunciante", play: "Reproducir anuncio", unavailable: "Anuncio no disponible" },
  de: { skip: "Werbung überspringen", visit: "Werbetreibenden besuchen", play: "Werbung abspielen", unavailable: "Werbung nicht verfügbar" },
  it: { skip: "Salta pubblicità", visit: "Visita l’inserzionista", play: "Riproduci pubblicità", unavailable: "Pubblicità non disponibile" },
  pt: { skip: "Saltar anúncio", visit: "Visitar anunciante", play: "Reproduzir anúncio", unavailable: "Anúncio indisponível" },
  nl: { skip: "Advertentie overslaan", visit: "Adverteerder bezoeken", play: "Advertentie afspelen", unavailable: "Advertentie niet beschikbaar" },
  ru: { skip: "Пропустить рекламу", visit: "Перейти к рекламодателю", play: "Воспроизвести рекламу", unavailable: "Реклама недоступна" },
  zh: { skip: "跳过广告", visit: "访问广告商", play: "播放广告", unavailable: "广告不可用" },
  ja: { skip: "広告をスキップ", visit: "広告主のサイトへ", play: "広告を再生", unavailable: "広告を表示できません" },
  hi: { skip: "विज्ञापन छोड़ें", visit: "विज्ञापनदाता की साइट खोलें", play: "विज्ञापन चलाएँ", unavailable: "विज्ञापन उपलब्ध नहीं है" },
  th: { skip: "ข้ามโฆษณา", visit: "เยี่ยมชมผู้ลงโฆษณา", play: "เล่นโฆษณา", unavailable: "โฆษณาไม่พร้อมใช้งาน" },
};

function allowedOrigin(url: URL): boolean {
  return !url.username && !url.password && (url.origin === "https://leakfanhub.com"
    || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)));
}
function parentOrigin(request: Request, url: URL): string | null {
  if (!["http:", "https:"].includes(url.protocol)) return null;
  // Next can expose an internal localhost URL behind Nginx. Only our fixed
  // public Host or an exact local QA host may select the document's parent.
  const host = request.headers.get("host");
  if (host === null) return allowedOrigin(url) ? url.origin : null;
  if (["leakfanhub.com", "leakfanhub.com:443"].includes(host.toLowerCase())) return "https://leakfanhub.com";
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)
    || !/^(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/.test(host)) return null;
  try { const local = new URL("http://" + host); return allowedOrigin(local) ? local.origin : null; } catch { return null; }
}
function validPath(path: string, locale: Locale, placement: string, context: AdSlotContext): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 1024 || /[\u0000-\u0020\u007f?#\\]/.test(path)
    || /%(?:2f|5c)/i.test(path) || new URL(path, "https://leakfanhub.com").pathname !== path) return false;
  try { if (path.split("/").some(part => [".", ".."].includes(decodeURIComponent(part)))) return false; } catch { return false; }
  const { pathname } = stripLocalePrefix(path);
  if (stripLocalePrefix(pathname).locale || isSystemPath(pathname) || !isAdPagePath(path)) return false;
  const route = resolveLocalizedPage(supportedLocaleForPath(locale, pathname), pathname);
  const tag = /^\/tag\/([^/]+)$/.exec(pathname);
  if (!route && !(tag && normalizeTagSlug(tag[1]) === tag[1])) return false;
  if (context === "pause") return placement === "underVideo" && route?.kind === "media";
  return placement === "feed" ? pathname === "/feed" : pathname !== "/feed";
}

/** Own registry only. All creative/VAST requests happen later inside the gated document. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = parentOrigin(request, url);
  if (!origin || ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")
    || (request.headers.has("origin") && request.headers.get("origin") !== origin)) return deny(403);
  const pairs = [...url.searchParams], values = Object.fromEntries(pairs);
  if (url.hash || url.search.length > 4096 || new Set(pairs.map(([key]) => key)).size !== pairs.length
    || REQUIRED.some(key => !(key in values)) || pairs.some(([key]) => ![...REQUIRED, "ordinal"].includes(key))
    || !["header", "footer", "underVideo", "feed"].includes(values.placement) || !["desktop", "mobile"].includes(values.device)
    || !["page", "pause"].includes(values.context) || !isAdProfile(values.profile) || !isLocale(values.locale)
    || !/^[A-Za-z0-9_-]{1,100}$/.test(values.nonce)
    || (values.placement === "feed" ? !/^(?:0|[1-9]\d{0,6})$/.test(values.ordinal ?? "") || Number(values.ordinal) > 1_000_000 : "ordinal" in values)
    || !validPath(values.path, values.locale, values.placement, values.context as AdSlotContext)) return deny(400);
  const placement = values.placement as "header" | "footer" | "underVideo" | "feed";
  const device = values.device as "desktop" | "mobile", context = values.context as AdSlotContext;
  try {
    const jar = await cookies();
    if (parseAdConsent(jar.get(AD_CONSENT_COOKIE)?.value) !== "accepted") return deny(403);
    const config = await getAdsRuntime();
    if (!config.enabled || !config.effectiveEnabled || config.reason !== "eligible" || config.consent !== "accepted"
      || (config.profile === undefined ? "current" : config.profile) !== values.profile || config.placements[placement as AdPlacement] !== true
      || selectAdProvider({ profile: values.profile, placement, device, context, ...(placement === "feed" ? { ordinal: Number(values.ordinal) } : {}) }) !== "exoclick") return deny(403);
    const spot = getExoclickSpot(placement, device, context);
    if (!spot) return deny(503);
    const copy = adsCopy[values.locale], cta = labels[values.locale];
    const common = { placement, nonce: values.nonce, parentOrigin: origin, consentValue: "v2:accepted" as const };
    const document = spot.kind === "banner"
      ? buildExoclickBannerDocument({ ...common, placement: placement as "header" | "footer" | "underVideo", spot,
        labels: { advertisement: copy.label, unavailable: cta.unavailable } })
      : buildExoclickVastDocument({ ...common, kind: spot.kind, tagUrl: spot.tagUrl, sourceHosts: spot.sourceHosts,
        labels: { advertisement: copy.label, close: copy.close, skip: cta.skip, visit: cta.visit, play: cta.play } });
    return new Response(document.html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": document.csp } });
  } catch { return deny(503); }
}
