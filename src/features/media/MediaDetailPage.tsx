import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCreator,
  getPhotoByIdForPage,
  getRelatedPhotos,
  withCreator,
} from "@/lib/photos";
import { formatAge, formatCount } from "@/lib/format";
import { mediaHref, parseVersionedSlug } from "@/lib/types";
import {
  isCurrentMediaVersion,
  isReservedCreatorHandle,
} from "@/lib/seo-policy";
import { isRemovedContent } from "@/lib/public-content-policy";
import { PhotoCard } from "@/components/PhotoCard";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FollowButton, PostActions } from "@/components/Interactions";
import { MediaImg } from "@/components/MediaImg";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Comments } from "@/components/Comments";
import { JsonLd } from "@/components/JsonLd";
import { BackLink } from "@/components/BackLink";
import { FloatingBack } from "@/components/FloatingBack";
import { RecordView } from "@/components/RecordView";
import { buildMediaPagePresentation } from "@/lib/media-seo";
import { creatorCollectionPath } from "@/lib/creator-collections";
import { mediaThumbnailUrl } from "@/lib/media-sources";
import { localePath, localizedHref, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { mediaPageAlternates } from "@/lib/i18n/metadata";
import { MediaDetailAd, RecommendationAdCard, RelatedMediaGrid } from "@/components/MediaDetailAds";
import { DISCOVERY_COPY } from "@/features/i18n/discovery-copy";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

export type MediaDetailPageProps = {
  /** Undefined denotes the unprefixed x-default page. */
  locale?: Locale;
  handleParam: string;
  idParam: string;
};

export async function mediaDetailMetadata({
  locale,
  handleParam: handle,
  idParam: id,
}: MediaDetailPageProps): Promise<Metadata> {
  if (isReservedCreatorHandle(handle)) {
    notFound();
  }
  // getPhotoById ignore le suffixe -v{N} pour la requête (source_id = base).
  const photo = await getPhotoByIdForPage(id);
  if (!photo || isRemovedContent(photo) || photo.creatorHandle.toLowerCase() !== handle.toLowerCase()) {
    notFound();
  }

  const parsed = parseVersionedSlug(id);
  if (!isCurrentMediaVersion(photo.urlVersion, parsed.version)) notFound();
  const creator = await getCreator(photo.creatorHandle);
  if (!creator || isRemovedContent(creator)) notFound();
  const sid = photo.sourceId || parsed.base;
  const path = mediaHref({ ...photo, sourceId: sid });
  const alternates = mediaPageAlternates(path, locale);
  const presentation = buildMediaPagePresentation(photo, {
    site: SITE,
    canonicalPath: alternates.canonical,
    creatorName: creator.name,
    locale,
  });
  return { ...presentation.metadata, alternates };
}

export async function MediaDetailPage({
  locale,
  handleParam: handle,
  idParam: id,
}: MediaDetailPageProps) {
  const language = locale ?? "en";
  const dictionary = getDictionary(language);
  const ui = dictionary.mediaDetails;
  const home = locale ? localePath(locale, "/") : "/";
  if (isReservedCreatorHandle(handle)) notFound();

  const parsed = parseVersionedSlug(id);
  const raw = await getPhotoByIdForPage(id);
  if (!raw || isRemovedContent(raw)) notFound();
  if (raw.creatorHandle.toLowerCase() !== handle.toLowerCase()) notFound();
  if (!isCurrentMediaVersion(raw.urlVersion, parsed.version)) notFound();

  const creator = await getCreator(raw.creatorHandle);
  if (!creator || isRemovedContent(creator)) notFound();
  const photo = withCreator(raw, creator);
  const thumbnail = mediaThumbnailUrl(photo);
  const related = await getRelatedPhotos(raw, 36);

  const sid = photo.sourceId || parsed.base;
  const creatorPath = creatorCollectionPath(photo.creatorHandle, creator.urlVersion ?? 1, "overview", locale);
  const collectionPath = creatorPath;
  const bareMediaPath = mediaHref({ ...photo, sourceId: sid });
  const mediaPath = locale ? localePath(locale, bareMediaPath) : bareMediaPath;
  const presentation = buildMediaPagePresentation(photo, {
    site: SITE,
    canonicalPath: mediaPath,
    creatorName: photo.creator.name,
    creatorPath,
    creatorAvatarUrl: photo.creator.avatarUrl,
    locale,
  });
  const h1 = presentation.h1;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dictionary.creator.home, item: `${SITE}${home}` },
      {
        "@type": "ListItem",
        position: 2,
        name: photo.creatorHandle,
        item: `${SITE}${creatorPath}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `#${sid}`,
        item: `${SITE}${mediaPath}`,
      },
    ],
  };

  return (
    <div className="mx-auto max-w-[1600px] px-3 pb-8 pt-3 sm:px-6 sm:py-6">
      <JsonLd data={presentation.mediaLd ? [presentation.mediaLd, breadcrumbLd] : [breadcrumbLd]} />
      <RecordView photoId={photo.id} />
      {/* History back — never force profile (caused video ↔ profile loop) */}
      <FloatingBack fallback={home} label={dictionary.creator.back} />
      <BackLink fallback={home} label={dictionary.creator.back} className="mb-3" />

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 lg:hidden">
        <Link href={creatorPath} className="flex min-w-0 flex-1 items-center gap-3">
          <MediaImg
            src={mediaThumbnailUrl({ imageUrl: photo.creator.avatarUrl }) || thumbnail || ""}
            alt={photo.creator.name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover object-top"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-semibold">
              <span className="truncate">{photo.creator.name}</span>
              {photo.creator.verified && <VerifiedBadge size={14} label={dictionary.creator.verified} />}
            </p>
            <p className="text-xs text-[var(--color-ink-faint)]">@{photo.creatorHandle}</p>
          </div>
        </Link>
        <FollowButton handle={photo.creatorHandle} labels={dictionary.creator.follow} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-[var(--color-border)]">
          {photo.type === "video" && photo.videoUrl ? (
            <VideoPlayer
              preroll
              src={photo.videoUrl}
              poster={thumbnail}
              title={h1}
              views={photo.views}
              likes={photo.likes}
              width={photo.width}
              height={photo.height}
              className="w-full"
            />
          ) : (
            <div className="flex w-full items-center justify-center">
              <MediaImg
                src={thumbnail || ""}
                alt={h1}
                width={photo.width}
                height={photo.height}
                sizes="(max-width: 1024px) 100vw, 70vw"
                priority
                className="max-h-[80vh] w-auto object-contain"
              />
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="hidden items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 lg:flex">
            <Link href={creatorPath} className="flex min-w-0 flex-1 items-center gap-3">
              <MediaImg
                src={mediaThumbnailUrl({ imageUrl: photo.creator.avatarUrl }) || thumbnail || ""}
                alt={photo.creator.name}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover object-top"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-semibold">
                  {photo.creator.name}
                  {photo.creator.verified && <VerifiedBadge size={14} label={dictionary.creator.verified} />}
                </p>
                {creator && (
                  <p className="truncate text-sm text-[var(--color-ink-muted)]">
                    {formatCount(creator.followers)} {dictionary.creator.followers}
                  </p>
                )}
              </div>
            </Link>
            <FollowButton handle={photo.creatorHandle} labels={dictionary.creator.follow} className="ml-auto" />
          </div>

          <div>
            <h1 className="text-lg font-bold leading-snug sm:text-xl">{h1}</h1>
            <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
              {formatAge(photo.ageMinutes, language)} ·{" "}
              <Link href={creatorPath} className="underline-offset-2 hover:underline">
                @{photo.creatorHandle}
              </Link>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: ui.views, value: formatCount(photo.views) },
              { label: ui.likes, value: formatCount(photo.likes) },
              { label: ui.score, value: `${photo.trending}` },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-center"
              >
                <p className="text-base font-bold sm:text-lg">{s.value}</p>
                <p className="text-[10px] text-[var(--color-ink-faint)]">{s.label}</p>
              </div>
            ))}
          </div>

          {photo.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {photo.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tag/${encodeURIComponent(tag)}`}
                  className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs capitalize text-[var(--color-ink-muted)]"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          <PostActions id={photo.id} baseLikes={photo.likes} labels={{ ...DISCOVERY_COPY[language], saved: ui.saved }} />

          <Comments photoId={photo.id} />

          <Link
            href={collectionPath}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-center text-sm font-semibold"
          >
            {ui.allMedia.replace("{handle}", () => photo.creatorHandle)}
          </Link>

          <Link
            href={`${locale ? localizedHref(locale, "/dmca") : "/dmca"}?photo=${encodeURIComponent(photo.id)}`}
            className="text-center text-xs text-[var(--color-ink-faint)] underline"
          >
            {ui.report}
          </Link>
        </aside>
      </div>

      <MediaDetailAd videoEligible={photo.type === "video" && Boolean(photo.videoUrl)} />
      {related.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-base font-bold sm:text-lg">{ui.more.replace("{handle}", () => photo.creatorHandle)}</h2>
            <Link href={creatorPath} className="text-sm font-medium text-[var(--color-accent)]">
              {ui.viewProfile}
            </Link>
          </div>
          <RelatedMediaGrid>
            {related.flatMap((p, index) => [
              <PhotoCard key={p.id} photo={p} replace />,
              ...(index === 1 && related.length >= 3 ? [<RecommendationAdCard key={`${photo.id}-recommendation-ad`} />] : []),
            ])}
          </RelatedMediaGrid>
        </section>
      )}
    </div>
  );
}
