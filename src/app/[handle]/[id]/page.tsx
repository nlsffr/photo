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
  "api",
  "creator",
  "models",
  "photo",
  "media",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "saved",
  "liked",
  "search",
  "trending-medias",
  "most-liked",
  "random",
  "tiktok",
  "trust-and-safety",
  "welcome",
  "tag",
  "add",
  "premium",
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}): Promise<Metadata> {
  const { handle, id } = await params;
  if (RESERVED.has(handle.toLowerCase())) {
    return { title: "Introuvable" };
  }
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
      ...(photo.videoUrl ? { videos: [{ url: photo.videoUrl }] } : {}),
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
          uploadDate: new Date(Date.now() - photo.ageMinutes * 60_000).toISOString(),
          duration: photo.durationSec ? `PT${photo.durationSec}S` : undefined,
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/WatchAction",
            userInteractionCount: photo.views,
          },
        }
      : {
          "@context": "https://schema.org",
          "@type": "ImageObject",
          name: photo.title,
          contentUrl: photo.imageUrl,
          width: photo.width,
          height: photo.height,
        };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <JsonLd data={schema} />
      <BackLink
        fallback={`/creator/${photo.creatorHandle}`}
        label="Retour"
        className="mb-4"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-black ring-1 ring-[var(--color-border)]">
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
            <div className="flex w-full items-center justify-center p-1">
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

        <aside className="flex flex-col gap-5">
          <div>
            <h1 className="text-xl font-bold leading-snug sm:text-2xl">
              {photo.title}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
              Publié {formatAge(photo.ageMinutes)}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
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
                    {creator.location ? ` · ${creator.location}` : ""}
                  </p>
                )}
              </div>
            </Link>
            <FollowButton handle={photo.creatorHandle} className="ml-auto" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Vues", value: formatCount(photo.views) },
              { label: "J’aime", value: formatCount(photo.likes) },
              { label: "Score", value: `${photo.trending}` },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center"
              >
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-xs text-[var(--color-ink-faint)]">{s.label}</p>
              </div>
            ))}
          </div>

          {photo.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photo.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tag/${encodeURIComponent(tag)}`}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm capitalize text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          <PostActions id={photo.id} baseLikes={photo.likes} />

          <Link
            href={`/dmca?photo=${encodeURIComponent(photo.id)}`}
            className="text-center text-xs text-[var(--color-ink-faint)] underline"
          >
            Signaler / DMCA
          </Link>

          <Comments photoId={photo.id} />
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold">Médias similaires</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {related.map((p) => (
              <PhotoCard key={p.id} photo={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
