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

const RESERVED = new Set([
  "api", "creator", "models", "photo", "media", "_next",
  "favicon.ico", "robots.txt", "sitemap.xml", "saved", "liked",
  "search", "trending-medias", "most-liked", "random", "tiktok",
  "trust-and-safety", "welcome", "tag", "add", "premium",
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}): Promise<Metadata> {
  const { handle, id } = await params;
  if (RESERVED.has(handle.toLowerCase())) return { title: "Introuvable" };
  const photo = await getPhotoById(id);
  if (!photo || photo.creatorHandle.toLowerCase() !== handle.toLowerCase()) {
    return { title: "Introuvable" };
  }
  const title = photo.title?.trim()
    ? photo.title
    : `${photo.creatorHandle} — ${photo.type}`;
  return {
    title,
    description: `${title} · ${photo.views} vues`,
    openGraph: {
      title,
      images: photo.imageUrl ? [{ url: photo.imageUrl }] : [],
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

  const schema =
    photo.type === "video" && photo.videoUrl
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: photo.title,
          thumbnailUrl: photo.imageUrl,
          contentUrl: photo.videoUrl,
        }
      : {
          "@context": "https://schema.org",
          "@type": "ImageObject",
          name: photo.title,
          contentUrl: photo.imageUrl,
        };

  return (
    <div className="mx-auto max-w-[1600px] px-3 pb-8 pt-3 sm:px-6 sm:py-6">
      <JsonLd data={schema} />

      {/* Back — big mobile-friendly */}
      <BackLink
        fallback={`/creator/${photo.creatorHandle}`}
        label="Retour"
        className="mb-3"
      />

      {/* Creator row FIRST on mobile — avatar + follow on top */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 lg:hidden">
        <Link
          href={`/creator/${photo.creatorHandle}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
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
            <p className="text-xs text-[var(--color-ink-faint)]">
              @{photo.creatorHandle}
            </p>
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
              title={photo.title}
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
                alt={photo.title}
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
          {/* Desktop creator card */}
          <div className="hidden items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 lg:flex">
            <Link
              href={`/creator/${photo.creatorHandle}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
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
                    {formatCount(creator.followers)} abonnés
                  </p>
                )}
              </div>
            </Link>
            <FollowButton handle={photo.creatorHandle} className="ml-auto" />
          </div>

          <div>
            <h1 className="text-lg font-bold leading-snug sm:text-xl">
              {photo.title}
            </h1>
            <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
              {formatAge(photo.ageMinutes)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Vues", value: formatCount(photo.views) },
              { label: "J’aime", value: formatCount(photo.likes) },
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
            href={`/dmca?photo=${encodeURIComponent(photo.id)}`}
            className="text-center text-xs text-[var(--color-ink-faint)] underline"
          >
            Signaler / DMCA
          </Link>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-base font-bold sm:text-lg">Similaires</h2>
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
