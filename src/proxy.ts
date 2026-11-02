import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAllTags, getCreator, getPhotoById } from "@/lib/photos";
import { creatorHref, mediaHref, parseVersionedSlug } from "@/lib/types";
import { parseCreatorCollectionPath } from "@/lib/creator-collections";
import {
  creatorRouteDecision,
} from "@/lib/public-content-policy";
import {
  isAllowedReservedTwoSegmentPath,
  isCurrentMediaVersion,
  isExistingTopLevelRoute,
  isReservedCreatorHandle,
  normalizeTagSlug,
  safeDecodePathSegment,
  shouldCanonicalizeRequest,
} from "@/lib/seo-policy";
import {
  LOCALE_COOKIE,
  chooseLocale,
  isDiscoveryPath,
  isSystemPath,
  internalLocalePath,
  resolveLocalizedPage,
  supportedLocaleForPath,
  stripLocalePrefix,
} from "@/lib/i18n/config";

const CANONICAL_URL = new URL(
  process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com",
);

/** Removed profiles are gone at every URL version. */
export async function proxy(request: NextRequest) {
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(/:$/, "");
  if (
    shouldCanonicalizeRequest(
      forwardedHost,
      forwardedProtocol,
      CANONICAL_URL.hostname,
    )
  ) {
    return publicRedirect(request, request.nextUrl.pathname);
  }

  let { pathname } = request.nextUrl;
  // Encoded separators must never become a new path or an external redirect.
  if (/%(?:2f|5c)/i.test(pathname) || pathname.includes("\\") || pathname.includes("//")) return missing();
  const localized = stripLocalePrefix(pathname);
  if (localized.locale) {
    const bare = localized.pathname;
    const renderedLocale = supportedLocaleForPath(localized.locale, bare);
    if (stripLocalePrefix(bare).locale || isSystemPath(bare)
      || bare === "/admin" || bare.startsWith("/admin/")
      || !resolveLocalizedPage(renderedLocale, bare)) return missing();
    pathname = bare;
  } else if (isSystemPath(pathname)) return NextResponse.next();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const response = privateResponse(NextResponse.next());
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const discovery = isDiscoveryPath(pathname);
  // Discovery URLs are stable for crawlers and people. Other pages retain
  // language negotiation at their single public address.
  const locale = discovery ? (localized.locale ?? "en") : supportedLocaleForPath(chooseLocale(
    request.cookies.get(LOCALE_COOKIE)?.value,
    request.headers.get("accept-language"),
  ), pathname);
  function render() {
    // Validate resource existence, removal and version before redirecting an
    // old language URL. Historical links never overwrite the locale cookie.
    if (localized.locale) {
      if (discovery && localized.locale !== "en") return privateResponse(NextResponse.next());
      return publicRedirect(request, pathname);
    }
    if (!resolveLocalizedPage(locale, pathname)) return privateResponse(NextResponse.next());
    const target = request.nextUrl.clone();
    target.pathname = internalLocalePath(locale, pathname);
    return privateResponse(NextResponse.rewrite(target));
  }

  if (pathname === "/tiktok") {
    return publicRedirect(request, "/feed");
  }

  const tagMatch = pathname.match(/^\/tag\/([^/]+)$/);
  if (tagMatch) {
    const decoded = safeDecodePathSegment(tagMatch[1] ?? "");
    if (decoded == null) return missing();
    const tag = normalizeTagSlug(decoded);
    if (!tag) return missing();
    try {
      if (!(await getAllTags()).includes(tag)) return missing();
    } catch {
      return render();
    }
    if (decoded !== tag) {
      return publicRedirect(request, `/tag/${encodeURIComponent(tag)}`);
    }
    return render();
  }

  const mediaMatch = pathname.match(/^\/([^/]+)\/([^/]+)$/);
  if (mediaMatch) {
    const handle = safeDecodePathSegment(mediaMatch[1] ?? "");
    const id = safeDecodePathSegment(mediaMatch[2] ?? "");
    if (handle == null || id == null) return missing();
    const firstSegment = handle.toLowerCase();
    if (!handle) return missing();
    if (isReservedCreatorHandle(firstSegment)) {
      if (isAllowedReservedTwoSegmentPath(firstSegment, id)) {
        return render();
      }
      try {
        if (firstSegment === "creator") {
          const parsed = parseVersionedSlug(id);
          const creator = await getCreator(parsed.base);
          const decision = creatorRouteDecision(creator, parsed.version);
          if (decision === "gone") return gone();
          if (decision === "missing" || !creator) return missing();
          return publicRedirect(request, creatorHref(creator.handle, creator.urlVersion));
        }
        if (firstSegment === "photo") {
          const photo = await getPhotoById(id);
          if (!photo || photo.removedFromIndexAt) return missing();
          return publicRedirect(request, mediaHref(photo));
        }
      } catch {
        return unavailable();
      }
      return missing();
    }
    // These static collection routes always win over a colliding media ID.
    if (id === "photos" || id === "videos" || id === "popular") {
      const collection = parseCreatorCollectionPath(pathname);
      if (!collection) return missing();
      const parsed = parseVersionedSlug(collection.handle);
      if (isReservedCreatorHandle(parsed.base)) return missing();
      try {
        const creator = await getCreator(parsed.base);
        const decision = creatorRouteDecision(creator, parsed.version);
        if (decision === "gone") return gone();
        if (decision === "missing") return missing();
      } catch {
        return unavailable();
      }
      return render();
    }
    try {
      const photo = await getPhotoById(id);
      const parsed = parseVersionedSlug(id);
      if (
        !photo ||
        photo.removedFromIndexAt ||
        photo.creatorHandle.toLowerCase() !== handle.toLowerCase() ||
        !isCurrentMediaVersion(photo.urlVersion, parsed.version)
      ) {
        return missing();
      }
    } catch {
      return unavailable();
    }
    return render();
  }

  const match = pathname.match(/^\/([^/]+)$/);
  if (!match) return render();

  const raw = safeDecodePathSegment(match[1] ?? "");
  if (raw == null) return missing();
  if (!raw || raw.includes(".") || isExistingTopLevelRoute(raw)) {
    return render();
  }
  if (isReservedCreatorHandle(raw)) return missing();

  const parsed = parseVersionedSlug(raw);
  if (isReservedCreatorHandle(parsed.base)) return missing();

  try {
    const creator = await getCreator(parsed.base);
    const decision = creatorRouteDecision(creator, parsed.version);
    if (decision === "gone") return gone();
    if (decision === "missing") return missing();
  } catch {
    return unavailable();
  }

  return render();
}

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  const vary = (response.headers.get("Vary") || "").split(",").map(value => value.trim()).filter(Boolean);
  for (const value of ["Cookie", "Accept-Language"]) {
    if (!vary.some(existing => existing.toLowerCase() === value.toLowerCase())) vary.push(value);
  }
  response.headers.set("Vary", vary.join(", "));
  return response;
}

function publicRedirect(request: NextRequest, pathname: string) {
  const target = new URL(CANONICAL_URL);
  target.pathname = pathname;
  target.search = request.nextUrl.search;
  return privateResponse(NextResponse.redirect(target, 308));
}

function gone() {
  return new NextResponse("Gone", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, noarchive",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function missing() {
  return new NextResponse("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=60",
    },
  });
}

function unavailable() {
  return new NextResponse("Temporarily unavailable", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, noarchive",
      "Cache-Control": "no-store",
      "Retry-After": "30",
    },
  });
}

export const config = {
  // Exclude only exact machine namespaces. Prefix-like creator handles (for
  // example /mediaqueen) must still reach removed-content enforcement.
  matcher: [
    "/((?!api(?:/|$)|_next(?:/|$)|media(?:/|$)|sitemaps(?:/|$)|favicon\\.ico(?:/|$)|favicon\\.svg(?:/|$)|robots\\.txt(?:/|$)|sitemap\\.xml(?:/|$)|icon(?:/|$)|apple-icon(?:/|$)).*)",
  ],
};
