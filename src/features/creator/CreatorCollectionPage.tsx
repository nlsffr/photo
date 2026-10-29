import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getCreatorCollectionContext, getPhotos } from "@/lib/photos";
import { formatCount } from "@/lib/format";
import type { CreatorCollection, MediaType, SortKey } from "@/lib/types";
import { parseVersionedSlug } from "@/lib/types";
import {
  collectionIsEligible,
  creatorCollectionCopy,
  creatorCollectionPath,
  parseCreatorCollectionPath,
  parseCreatorPage,
} from "@/lib/creator-collections";
import {
  isCurrentPublicVersion,
  isCleanCreatorQuery,
  legacyCreatorCollection,
  type CreatorSearchParams,
} from "@/lib/seo-policy";
import { isRemovedContent } from "@/lib/public-content-policy";
import type { Locale } from "@/lib/i18n/config";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FollowButton } from "@/components/Interactions";
import { MediaImg } from "@/components/MediaImg";
import { BackLink } from "@/components/BackLink";
import { FloatingBack } from "@/components/FloatingBack";
import { JsonLd } from "@/components/JsonLd";

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com"
).replace(/\/$/, "");
const PAGE_SIZE = 30;
const VALID_SORTS: SortKey[] = [
  "recent",
  "popular",
  "liked",
  "trending",
  "longest",
];
const RESERVED = new Set([
  "api",
  "creator",
  "photo",
  "media",
  "_next",
  "saved",
  "liked",
  "search",
  "random",
  "tag",
]);
const COLLECTIONS: CreatorCollection[] = [
  "overview",
  "photos",
  "videos",
  "popular",
];

export type CreatorCollectionPageProps = {
  /** Undefined denotes the unprefixed x-default route. */
  locale?: Locale;
  handleParam: string;
  collection: CreatorCollection;
  searchParams: CreatorSearchParams;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function absUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return /^https?:\/\//i.test(path)
    ? path
    : `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function loadCollection({
  locale,
  handleParam,
  collection,
  searchParams,
}: CreatorCollectionPageProps) {
  if (
    !parseCreatorCollectionPath(
      `/${handleParam}${collection === "overview" ? "" : `/${collection}`}`,
    )
  )
    notFound();
  const parsed = parseVersionedSlug(handleParam);
  if (RESERVED.has(parsed.base.toLowerCase())) notFound();
  const context = await getCreatorCollectionContext(parsed.base);
  if (!context || isRemovedContent(context.creator)) notFound();
  const { creator, stats } = context;
  if (!isCurrentPublicVersion(creator.urlVersion, parsed.version)) notFound();
  if (!collectionIsEligible(collection, stats)) notFound();
  const legacy =
    collection === "overview" ? legacyCreatorCollection(searchParams) : null;
  if (legacy && collectionIsEligible(legacy, stats)) {
    permanentRedirect(
      creatorCollectionPath(
        creator.handle,
        creator.urlVersion ?? 1,
        legacy,
        locale,
      ),
    );
  }
  const pagination = parseCreatorPage(searchParams.page);
  const path = creatorCollectionPath(
    creator.handle,
    creator.urlVersion ?? 1,
    collection,
    locale,
    pagination.page,
  );
  const count =
    collection === "photos"
      ? stats.photoCount
      : collection === "videos"
        ? stats.videoCount
        : stats.mediaCount;
  const pageExists = (pagination.page - 1) * PAGE_SIZE < count;
  return { creator, stats, pagination, path, pageExists };
}

export async function creatorCollectionMetadata(
  props: CreatorCollectionPageProps,
): Promise<Metadata> {
  const { creator, pagination, path, pageExists } = await loadCollection(props);
  const copy = creatorCollectionCopy(
    props.locale ?? "en",
    props.collection,
    creator.name,
  );
  const title = `${copy.title}${pagination.page > 1 ? ` — Page ${pagination.page}` : ""} — LeakFanHub`;
  const image = absUrl(creator.avatarUrl);
  return {
    title: { absolute: title },
    description: copy.description,
    alternates: { canonical: path },
    robots: {
      index:
        pagination.valid &&
        pageExists &&
        isCleanCreatorQuery(props.searchParams),
      follow: true,
      "max-image-preview": "large",
    },
    openGraph: {
      type: "profile",
      title,
      description: copy.description,
      url: `${SITE}${path}`,
      siteName: "LeakFanHub",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary",
      title,
      description: copy.description,
      images: image ? [image] : undefined,
    },
  };
}

export async function CreatorCollectionPage(props: CreatorCollectionPageProps) {
  const { locale, collection, searchParams } = props;
  const { creator, stats, pagination, path } = await loadCollection(props);
  const language = locale ?? "en";
  const fr = language === "fr";
  const handle = creator.handle;
  const copy = creatorCollectionCopy(language, collection, creator.name);
  const sortRaw = first(searchParams.sort);
  const sort: SortKey = VALID_SORTS.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : collection === "popular"
      ? "popular"
      : "recent";
  const typeRaw = first(searchParams.type);
  const type: MediaType | undefined =
    collection === "photos"
      ? "photo"
      : collection === "videos"
        ? "video"
        : typeRaw === "photo" || typeRaw === "video" || typeRaw === "pack"
          ? typeRaw
          : undefined;
  const cursorRaw = first(searchParams.cursor);
  const legacyCursor =
    searchParams.page === undefined &&
    cursorRaw &&
    /^\d+$/.test(cursorRaw) &&
    Number(cursorRaw) <= 299_970
      ? Number(cursorRaw)
      : undefined;
  const cursor = legacyCursor ?? (pagination.page - 1) * PAGE_SIZE;
  const numberedPage =
    legacyCursor === undefined
      ? pagination.page
      : Math.floor(cursor / PAGE_SIZE) + 1;
  const page = await getPhotos({
    creator: handle,
    type,
    sort,
    cursor,
    limit: PAGE_SIZE,
  });
  const avatarSrc = creator.avatarUrl?.trim() || page.items[0]?.imageUrl || "";
  const base = creatorCollectionPath(
    handle,
    creator.urlVersion ?? 1,
    "overview",
    locale,
  );
  const numberedHref = (number: number) => {
    const href = creatorCollectionPath(
      handle,
      creator.urlVersion ?? 1,
      collection,
      locale,
      number,
    );
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page" || key === "cursor" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value])
        query.append(key, item);
    }
    if (!query.size) return href;
    return `${href}${href.includes("?") ? "&" : "?"}${query}`;
  };
  // Old non-aligned offsets have no equivalent numbered page; retain their
  // functional noindex cursor link until the user returns to a clean tab.
  const cursorHref = (offset: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page" || key === "cursor" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value])
        query.append(key, item);
    }
    query.set("cursor", String(offset));
    return `${creatorCollectionPath(handle, creator.urlVersion ?? 1, collection, locale)}?${query}`;
  };
  const unaligned = legacyCursor !== undefined && cursor % PAGE_SIZE !== 0;
  const previousHref = unaligned
    ? cursorHref(Math.max(0, cursor - PAGE_SIZE))
    : numberedHref(numberedPage - 1);
  const nextHref = unaligned
    ? cursorHref(page.nextCursor ?? cursor + PAGE_SIZE)
    : numberedHref(numberedPage + 1);
  const tabs = COLLECTIONS.filter((item) => collectionIsEligible(item, stats));
  const labels = fr
    ? {
        overview: "Tout",
        photos: "Photos",
        videos: "Vidéos",
        popular: "Populaires",
      }
    : {
        overview: "All",
        photos: "Photos",
        videos: "Videos",
        popular: "Popular",
      };
  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: creator.name,
    alternateName: handle,
    url: `${SITE}${base}`,
    image: absUrl(avatarSrc),
    description: creator.bio || copy.description,
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
      {
        "@type": "ListItem",
        position: 1,
        name: fr ? "Accueil" : "Home",
        item: `${SITE}${locale ? `/${locale}` : ""}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: fr ? "Créateurs" : "Models",
        item: `${SITE}${locale ? `/${locale}` : ""}/models`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: handle,
        item: `${SITE}${base}`,
      },
      ...(collection === "overview"
        ? []
        : [
            {
              "@type": "ListItem",
              position: 4,
              name: labels[collection],
              item: `${SITE}${path}`,
            },
          ]),
    ],
  };
  return (
    <div className="pb-4">
      <JsonLd data={[personLd, breadcrumbLd]} />
      <FloatingBack
        fallback={locale ? `/${locale}` : "/"}
        label={fr ? "Retour" : "Back"}
      />
      <div className="px-3 pt-3 sm:px-5">
        <BackLink
          fallback={locale ? `/${locale}` : "/"}
          label={fr ? "Retour" : "Back"}
        />
      </div>
      <div className="px-3 pt-4 sm:px-5">
        <div className="flex items-center gap-3 sm:gap-4">
          {avatarSrc ? (
            <MediaImg
              src={avatarSrc}
              alt={`${creator.name} (@${handle})`}
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
              <span>{copy.title}</span>
              {creator.verified && <VerifiedBadge size={16} />}
            </h1>
            <p className="text-sm text-[var(--color-ink-faint)]">@{handle}</p>
          </div>
          <FollowButton handle={handle} className="shrink-0" />
        </div>
        {creator.bio && (
          <p className="mt-3 line-clamp-3 text-sm text-[var(--color-ink-muted)]">
            {creator.bio}
          </p>
        )}
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          {copy.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            <strong>{formatCount(creator.followers)}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">
              {fr ? "abonnés" : "followers"}
            </span>
          </span>
          <span>
            <strong>{stats.mediaCount}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">
              {fr ? "médias" : "media"}
            </span>
          </span>
          <span>
            <strong>{formatCount(stats.totalViews)}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">
              {fr ? "vues" : "views"}
            </span>
          </span>
        </div>
        <nav
          aria-label="Collections"
          className="no-scrollbar mt-4 flex gap-2 overflow-x-auto border-b border-[var(--color-border)] pb-3"
        >
          {tabs.map((item) => (
            <Link
              key={item}
              href={creatorCollectionPath(
                handle,
                creator.urlVersion ?? 1,
                item,
                locale,
              )}
              aria-current={item === collection ? "page" : undefined}
              scroll={false}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${item === collection ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"}`}
            >
              {labels[item]}
            </Link>
          ))}
        </nav>
        <section className="mt-4 pb-6">
          <InfiniteGallery
            key={`${path}|${sort}|${type ?? ""}|${cursor}`}
            initial={page}
            params={{ sort, creator: handle, type }}
          />
          <nav
            className="mt-8 flex justify-center gap-4"
            aria-label="Pagination"
          >
            {pagination.valid && numberedPage > 1 && (
              <Link rel="prev" href={previousHref}>
                {fr ? "Page précédente" : "Previous page"} {numberedPage - 1}
              </Link>
            )}
            {pagination.valid &&
              numberedPage < 10_000 &&
              page.nextCursor != null && (
                <Link
                  rel="next"
                  href={nextHref}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-semibold text-[var(--color-ink)]"
                >
                  {fr ? "Page suivante" : "Next page"} {numberedPage + 1} →
                </Link>
              )}
          </nav>
        </section>
      </div>
    </div>
  );
}
