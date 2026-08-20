import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreator, getCreatorStats, getPhotos } from "@/lib/photos";
import { formatCount } from "@/lib/format";
import type { MediaType, SortKey } from "@/lib/types";
import { creatorHref } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FollowButton } from "@/components/Interactions";
import { MediaImg } from "@/components/MediaImg";
import { BackLink } from "@/components/BackLink";
import { JsonLd } from "@/components/JsonLd";

export const revalidate = 180;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");
const VALID_SORTS: SortKey[] = ["recent", "popular", "liked", "trending", "longest"];
const PAGE_SIZE = 30;

/** App routes that must never be treated as creator handles. */
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

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function absUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  if (RESERVED.has(handle.toLowerCase())) {
    return { title: "Not found", robots: { index: false, follow: true } };
  }
  const creator = await getCreator(handle);
  if (!creator) return { title: "Profile not found", robots: { index: false, follow: true } };

  const title = `${creator.name} (@${creator.handle}) photos & videos — LeakFanHub`;
  const rawDesc =
    creator.bio?.slice(0, 140) ||
    `Browse free ${creator.handle} photos and videos on LeakFanHub. ${creator.name} (@${creator.handle}) — updated regularly. 18+ only.`;
  const description = rawDesc.length > 160 ? `${rawDesc.slice(0, 157)}...` : rawDesc;
  const path = creatorHref(creator.handle);
  const url = `${SITE}${path}`;
  const image = absUrl(creator.avatarUrl);

  return {
    title: { absolute: title },
    description,
    keywords: [
      creator.handle,
      `${creator.handle} photos`,
      `${creator.handle} videos`,
      creator.name,
      "LeakFanHub",
    ],
    alternates: { canonical: path },
    robots: { index: true, follow: true, "max-image-preview": "large" as const },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "LeakFanHub",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function CreatorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { handle } = await params;
  if (RESERVED.has(handle.toLowerCase())) notFound();

  const sp = await searchParams;
  const creator = await getCreator(handle);
  if (!creator) notFound();

  const typeRaw = first(sp.type);
  const type: MediaType | undefined =
    typeRaw === "photo" || typeRaw === "video" || typeRaw === "pack"
      ? typeRaw
      : undefined;

  const sortRaw = first(sp.sort);
  const sort: SortKey = VALID_SORTS.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : "popular";

  const cursorRaw = first(sp.cursor);
  const cursorParsed = cursorRaw ? parseInt(cursorRaw, 10) : NaN;
  const cursor = Number.isFinite(cursorParsed) && cursorParsed > 0 ? cursorParsed : undefined;

  const stats = await getCreatorStats(handle);
  const page = await getPhotos({
    creator: handle,
    sort,
    type,
    limit: PAGE_SIZE,
    cursor,
  });

  const avatarSrc =
    creator.avatarUrl && creator.avatarUrl.trim()
      ? creator.avatarUrl
      : page.items[0]?.imageUrl || "";

  const base = creatorHref(handle);
  const q = (opts: { type?: string | null; sort?: string; cursor?: number | null }) => {
    const p = new URLSearchParams();
    if (opts.type) p.set("type", opts.type);
    if (opts.sort && opts.sort !== "popular") p.set("sort", opts.sort);
    if (opts.cursor != null && opts.cursor > 0) p.set("cursor", String(opts.cursor));
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const chips = [
    { label: "All", href: q({ sort }), active: !type },
    { label: "Photos", href: q({ type: "photo", sort }), active: type === "photo" },
    { label: "Videos", href: q({ type: "video", sort }), active: type === "video" },
    { label: "Top", href: q({ type, sort: "popular" }), active: sort === "popular" },
    { label: "Recent", href: q({ type, sort: "recent" }), active: sort === "recent" },
  ];

  const queryKey = `${handle}|${sort}|${type ?? ""}|${cursor ?? 0}`;

  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: creator.name,
    alternateName: creator.handle,
    url: `${SITE}${base}`,
    image: absUrl(avatarSrc) || undefined,
    description: creator.bio || `${creator.name} (@${creator.handle}) on LeakFanHub`,
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/FollowAction",
      userInteractionCount: creator.followers,
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name: "Models", item: `${SITE}/models` },
      {
        "@type": "ListItem",
        position: 3,
        name: creator.handle,
        item: `${SITE}${base}`,
      },
    ],
  };

  const nextHref =
    page.nextCursor != null ? q({ type, sort, cursor: page.nextCursor }) : null;

  return (
    <div className="pb-4">
      <JsonLd data={[personLd, breadcrumbLd]} />
      <div className="px-3 pt-3 sm:px-5">
        <BackLink fallback="/" label="Back" />
      </div>

      <div className="px-3 pt-4 sm:px-5">
        <div className="flex items-center gap-3 sm:gap-4">
          {avatarSrc ? (
            <MediaImg
              src={avatarSrc}
              alt={`${creator.name} (@${creator.handle})`}
              width={112}
              height={112}
              className="h-20 w-20 shrink-0 rounded-full object-cover object-top ring-2 ring-[var(--color-border)] sm:h-24 sm:w-24"
            />
          ) : (
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[var(--color-surface-2)] text-xl font-bold ring-2 ring-[var(--color-border)] sm:h-24 sm:w-24">
              {creator.name.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-1.5 text-lg font-bold sm:text-2xl">
              <span className="truncate">{creator.name}</span>
              {creator.verified && <VerifiedBadge size={16} />}
            </h1>
            <p className="text-sm text-[var(--color-ink-faint)]">@{creator.handle}</p>
          </div>

          <FollowButton handle={creator.handle} className="shrink-0" />
        </div>

        {creator.bio ? (
          <p className="mt-3 line-clamp-3 text-sm text-[var(--color-ink-muted)]">{creator.bio}</p>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Photos and videos from {creator.name} (@{creator.handle}) on LeakFanHub.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            <strong>{formatCount(creator.followers)}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">followers</span>
          </span>
          <span>
            <strong>{stats.photoCount}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">media</span>
          </span>
          <span>
            <strong>{formatCount(stats.totalViews)}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">views</span>
          </span>
        </div>

        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto border-b border-[var(--color-border)] pb-3">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              scroll={false}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                c.active
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        <section className="mt-4 pb-6">
          <InfiniteGallery
            key={queryKey}
            initial={page}
            params={{ sort, creator: handle, type }}
          />

          {nextHref && (
            <nav className="mt-8 flex justify-center" aria-label="Pagination">
              <Link
                href={nextHref}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-semibold text-[var(--color-ink)] hover:border-[var(--color-accent)]"
              >
                More @{creator.handle} media →
              </Link>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
