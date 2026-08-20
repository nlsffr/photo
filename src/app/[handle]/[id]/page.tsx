import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCreator,
  getPhotoById,
  getRelatedPhotos,
  withCreator,
} from "@/lib/photos";
import { formatAge, formatCount } from "@/lib/format";
import { PhotoCard } from "@/components/PhotoCard";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FollowButton, PostActions } from "@/components/Interactions";
import { MediaImg } from "@/components/MediaImg";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Comments } from "@/components/Comments";
import { JsonLd } from "@/components/JsonLd";
import { BackLink } from "@/components/BackLink";
import { RecordView } from "@/components/RecordView";

export const revalidate = 300;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

const RESERVED = new Set([
  "api", "creator", "models", "photo", "media", "_next",
  "favicon.ico", "robots.txt", "sitemap.xml", "sitemaps", "saved", "liked",
  "search", "trending-medias", "most-liked", "random", "tiktok",
  "trust-and-safety", "welcome", "tag", "add", "premium",
  "feed", "pour-toi", "classements", "recherche", "about", "dmca",
  "connexion", "inscription", "favoris", "abonnements",
]);

function absUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

function durationIso(sec?: number): string | undefined {
  if (sec == null || sec <= 0 || !Number.isFinite(sec)) return undefined;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `PT${h}H${m}M${r}S`;
  if (m > 0) return `PT${m}M${r}S`;
  return `PT${r}S`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}): Promise<Metadata> {
  const { handle, id } = await params;
  if (RESERVED.has(handle.toLowerCase())) {
    return { title: "Not found", robots: { index: false, follow: true } };
  }
  const photo = await getPhotoById(id);
  if (!photo || photo.creatorHandle.toLowerCase() !== handle.toLowerCase()) {
    return { title: "Not found", robots: { index: false, follow: true } };
  }

  const h = photo.creatorHandle;
  const kind =
    photo.type === "video" ? "video" : photo.type === "pack" ? "pack" : "photo";
  const sid = photo.sourceId || id;
  const title = `${h} ${kind} #${sid} — LeakFanHub`;
  const description = `Free ${h} ${kind} on LeakFanHub. ${formatCount(photo.views)} views · more from @${h}. Updated regularly. 18+ only.`;
  const path = `/${encodeURIComponent(h)}/${encodeURIComponent(sid)}`;
  const url = `${SITE}${path}`;
  const ogImage = absUrl(photo.imageUrl);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true, "max-image-preview": "large" as const },
    openGraph: {
      type: photo.type === "video" ? "video.other" : "article",
      title,
      description,
      url,
      siteName: "LeakFanHub",
      images: ogImage ? [{ url: ogImage }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function MediaByHandlePage({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}) {
  const { handle, id } = await params;
  if (RESERVED.has(handle.toLowerCase())) notFound();

  const raw = await getPhotoById(id);
  if (!raw) notFound();
  if (raw.creatorHandle.toLowerCase() !== handle.toLowerCase()) notFound();

  const creator = await getCreator(raw.creatorHandle);
  const photo = withCreator(raw, creator);
  const related = await getRelatedPhotos(raw);

  const sid = photo.sourceId || id;
  const kind =
    photo.type === "video" ? "video" : photo.type === "pack" ? "pack" : "photo";
  const h1 = `${photo.creatorHandle} ${kind} #${sid}`;
  const creatorPath = `/creator/${encodeURIComponent(photo.creatorHandle)}`;
  const mediaPath = `/${encodeURIComponent(photo.creatorHandle)}/${encodeURIComponent(sid)}`;

  const thumb = absUrl(photo.imageUrl);
  const content = absUrl(photo.type === "video" ? photo.videoUrl : photo.imageUrl);

  const personLd = {
    "@type": "Person",
    name: photo.creator.name || photo.creatorHandle,
    alternateName: photo.creatorHandle,
    url: `${SITE}${creatorPath}`,
    image: absUrl(photo.creator.avatarUrl) || thumb,
  };

  const mediaLd =
    photo.type === "video" && photo.videoUrl
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: h1,
          description: `${photo.creatorHandle} video on LeakFanHub — ${formatCount(photo.views)} views`,
          thumbnailUrl: thumb,
          contentUrl: content,
          embedUrl: `${SITE}${mediaPath}`,
          duration: durationIso(photo.durationSec),
          author: personLd,
          publisher: {
            "@type": "Organization",
            name: "LeakFanHub",
            url: SITE,
          },
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/WatchAction",
            userInteractionCount: photo.views,
          },
        }
      : {
          "@context": "https://schema.org",
          "@type": "ImageObject",
          name: h1,
          description: `${photo.creatorHandle} photo on LeakFanHub — ${formatCount(photo.views)} views`,
          contentUrl: content || thumb,
          thumbnailUrl: thumb,
          author: personLd,
          publisher: {
            "@type": "Organization",
            name: "LeakFanHub",
            url: SITE,
          },
        };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
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
      <JsonLd data={[mediaLd, breadcrumbLd]} />
      <RecordView photoId={photo.id} />

      <BackLink fallback={creatorPath} label="Back" className="mb-3" />

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 lg:hidden">
        <Link href={creatorPath} className="flex min-w-0 flex-1 items-center gap-3">
          <MediaImg
            src={photo.creator.avatarUrl || photo.imageUrl}
            alt={photo.creator.name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover object-top"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-semibold">
              <span className="truncate">{photo.creator.name}</span>
              {photo.creator.verified && <VerifiedBadge size={14} />}
            </p>
            <p className="text-xs text-[var(--color-ink-faint)]">@{photo.creatorHandle}</p>
          </div>
        </Link>
        <FollowButton handle={photo.creatorHandle} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-[var(--color-border)]">
          {photo.type === "video" && photo.videoUrl ? (
            <VideoPlayer
              src={photo.videoUrl}
              poster={photo.imageUrl}
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
                src={photo.imageUrl}
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
                src={photo.creator.avatarUrl || photo.imageUrl}
                alt={photo.creator.name}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover object-top"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-semibold">
                  {photo.creator.name}
                  {photo.creator.verified && <VerifiedBadge size={14} />}
                </p>
                {creator && (
                  <p className="truncate text-sm text-[var(--color-ink-muted)]">
                    {formatCount(creator.followers)} followers
                  </p>
                )}
              </div>
            </Link>
            <FollowButton handle={photo.creatorHandle} className="ml-auto" />
          </div>

          <div>
            <h1 className="text-lg font-bold leading-snug sm:text-xl">{h1}</h1>
            <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
              {formatAge(photo.ageMinutes)} ·{" "}
              <Link href={creatorPath} className="underline-offset-2 hover:underline">
                @{photo.creatorHandle}
              </Link>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Views", value: formatCount(photo.views) },
              { label: "Likes", value: formatCount(photo.likes) },
              { label: "Score", value: `${photo.trending}` },
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

          <PostActions id={photo.id} baseLikes={photo.likes} />

          <Comments photoId={photo.id} />

          <Link
            href={creatorPath}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-center text-sm font-semibold"
          >
            All @{photo.creatorHandle} media →
          </Link>

          <Link
            href={`/dmca?photo=${encodeURIComponent(photo.id)}`}
            className="text-center text-xs text-[var(--color-ink-faint)] underline"
          >
            Report / DMCA
          </Link>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-base font-bold sm:text-lg">More @{photo.creatorHandle}</h2>
            <Link href={creatorPath} className="text-sm font-medium text-[var(--color-accent)]">
              View profile
            </Link>
          </div>
          <div className="media-grid">
            {related.map((p) => (
              <PhotoCard key={p.id} photo={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
