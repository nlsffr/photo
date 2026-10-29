import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAllTags, getCreator, getPhotoById } from "@/lib/photos";
import { creatorHref, mediaHref, parseVersionedSlug } from "@/lib/types";
import {
  isAllowedReservedTwoSegmentPath,
  isCurrentMediaVersion,
  isCurrentPublicVersion,
  isExistingTopLevelRoute,
  normalizeTagSlug,
  safeDecodePathSegment,
  shouldCanonicalizeRequest,
} from "@/lib/seo-policy";

export const runtime = "nodejs";

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

/**
 * 410 uniquement sur l'ancienne URL de profil /{handle}
 * quand creators.removed_from_index_at est non-null.
 * /{handle}-v{n} (version courante) n'est pas intercepté ici.
 */
export async function middleware(request: NextRequest) {
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
          if (!creator || creator.removedFromIndexAt) return missing();
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
        return NextResponse.next();
      }
      return missing();
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
      return NextResponse.next();
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
    if (!creator) return missing();
    if (creator.removedFromIndexAt && parsed.version == null) {
      return new NextResponse("Gone", {
        status: 410,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex",
          "Cache-Control": "public, max-age=300",
        },
      });
    }
    if (!isCurrentPublicVersion(creator.urlVersion, parsed.version)) {
      return missing();
    }
  } catch {
    return NextResponse.next();
  }

  return NextResponse.next();
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
