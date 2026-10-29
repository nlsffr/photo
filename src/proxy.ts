import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAllTags, getCreator, getPhotoById } from "@/lib/photos";
import { creatorHref, mediaHref, parseVersionedSlug } from "@/lib/types";
import { parseCreatorCollectionPath } from "@/lib/creator-collections";
import {
  creatorRouteDecision,
  isRemovedContent,
} from "@/lib/public-content-policy";
import {
  isAllowedReservedTwoSegmentPath,
  isCurrentMediaVersion,
  isExistingTopLevelRoute,
  normalizeTagSlug,
  safeDecodePathSegment,
  shouldCanonicalizeRequest,
} from "@/lib/seo-policy";
import {
  LOCALE_COOKIE,
  chooseLocale,
  isSystemPath,
  localeRedirectTarget,
  stripLocalePrefix,
} from "@/lib/i18n/config";

const CANONICAL_URL = new URL(
  process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com",
);

const RESERVED = new Set([
  "api", "creator", "models", "photo", "media", "_next",
  "favicon.ico", "robots.txt", "sitemap.xml", "sitemaps", "saved", "liked",
  "search", "trending-medias", "most-liked", "random", "tiktok",
  "trust-and-safety", "welcome", "tag", "add", "premium",
  "feed", "pour-toi", "classements", "recherche", "about", "dmca",
  "connexion", "inscription", "favoris", "abonnements", "identite",
  "contact", "conditions", "confidentialite", "mentions-legales",
  "influenceuses-tendances", "qu-est-ce-que-lumengallery",
]);

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
    return NextResponse.redirect(
      new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, CANONICAL_URL),
      308,
    );
  }

  const { pathname } = request.nextUrl;
  if (isSystemPath(pathname)) return NextResponse.next();

  const localized = stripLocalePrefix(pathname);
  if (localized.locale) {
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, localized.locale, {
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const acceptLanguage = request.headers.get("accept-language");
  const localeTarget = localeRedirectTarget(pathname, cookieLocale, acceptLanguage);
  if (localeTarget) {
    const target = request.nextUrl.clone();
    target.pathname = localeTarget;
    const response = NextResponse.redirect(target, 307);
    response.cookies.set(LOCALE_COOKIE, chooseLocale(cookieLocale, acceptLanguage), {
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.append("Vary", "Accept-Language");
    response.headers.append("Vary", "Cookie");
    return response;
  }

  if (pathname === "/tiktok") {
    return NextResponse.redirect(new URL("/feed", CANONICAL_URL), 308);
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
      return NextResponse.next();
    }
    if (decoded !== tag) {
      return NextResponse.redirect(
        new URL(`/tag/${encodeURIComponent(tag)}`, CANONICAL_URL),
        308,
      );
    }
    return NextResponse.next();
  }

  const mediaMatch = pathname.match(/^\/([^/]+)\/([^/]+)$/);
  if (mediaMatch) {
    const handle = safeDecodePathSegment(mediaMatch[1] ?? "");
    const id = safeDecodePathSegment(mediaMatch[2] ?? "");
    if (handle == null || id == null) return missing();
    const firstSegment = handle.toLowerCase();
    if (!handle) return missing();
    if (RESERVED.has(firstSegment)) {
      if (isAllowedReservedTwoSegmentPath(firstSegment, id)) {
        return NextResponse.next();
      }
      try {
        if (firstSegment === "creator") {
          const creator = await getCreator(id);
          if (!creator) return missing();
          if (isRemovedContent(creator)) return gone();
          return NextResponse.redirect(
            new URL(creatorHref(creator.handle, creator.urlVersion), CANONICAL_URL),
            308,
          );
        }
        if (firstSegment === "photo") {
          const photo = await getPhotoById(id);
          if (!photo || photo.removedFromIndexAt) return missing();
          return NextResponse.redirect(
            new URL(mediaHref(photo), CANONICAL_URL),
            308,
          );
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
      if (RESERVED.has(parsed.base.toLowerCase())) return missing();
      try {
        const creator = await getCreator(parsed.base);
        const decision = creatorRouteDecision(creator, parsed.version);
        if (decision === "gone") return gone();
        if (decision === "missing") return missing();
      } catch {
        return unavailable();
      }
      return NextResponse.next();
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
    return NextResponse.next();
  }

  const match = pathname.match(/^\/([^/]+)$/);
  if (!match) return NextResponse.next();

  const raw = safeDecodePathSegment(match[1] ?? "");
  if (raw == null) return missing();
  if (!raw || raw.includes(".") || isExistingTopLevelRoute(raw)) {
    return NextResponse.next();
  }
  if (RESERVED.has(raw.toLowerCase())) return missing();

  const parsed = parseVersionedSlug(raw);
  if (RESERVED.has(parsed.base.toLowerCase())) return missing();

  try {
    const creator = await getCreator(parsed.base);
    const decision = creatorRouteDecision(creator, parsed.version);
    if (decision === "gone") return gone();
    if (decision === "missing") return missing();
  } catch {
    return unavailable();
  }

  return NextResponse.next();
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
