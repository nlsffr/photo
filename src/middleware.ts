import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCreator } from "@/lib/photos";
import { parseVersionedSlug } from "@/lib/types";

export const runtime = "nodejs";

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
  const { pathname } = request.nextUrl;
  const match = pathname.match(/^\/([^/]+)$/);
  if (!match) return NextResponse.next();

  const raw = decodeURIComponent(match[1] ?? "");
  if (!raw || raw.includes(".") || RESERVED.has(raw.toLowerCase())) {
    return NextResponse.next();
  }

  const parsed = parseVersionedSlug(raw);
  // Suffixe présent : page profil décide (200 si version courante, 404 sinon).
  if (parsed.version != null) return NextResponse.next();
  if (RESERVED.has(parsed.base.toLowerCase())) return NextResponse.next();

  try {
    const creator = await getCreator(parsed.base);
    if (creator?.removedFromIndexAt) {
      return new NextResponse("Gone", {
        status: 410,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex",
          "Cache-Control": "public, max-age=300",
        },
      });
    }
  } catch {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
