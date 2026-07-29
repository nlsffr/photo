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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const photo = await getPhotoById(id);
  return { title: photo ? photo.title : "Photo introuvable" };
}

export default async function PhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const raw = await getPhotoById(id);
  if (!raw) notFound();

  const creator = await getCreator(raw.creatorHandle);
  const photo = withCreator(raw, creator);
  const related = await getRelatedPhotos(raw);

  return (
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Retour à la galerie
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex items-center justify-center overflow-hidden rounded-2xl bg-black ring-1 ring-[var(--color-border)]">
          {photo.type === "video" ? (
            <video
              src={photo.videoUrl}
              poster={photo.imageUrl}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload"
              className="max-h-[80vh] w-full"
            />
          ) : (
            <MediaImg
              src={photo.imageUrl}
              alt={photo.title}
              width={photo.width}
              height={photo.height}
              sizes="(max-width: 1024px) 100vw, 70vw"
              priority
              className="max-h-[80vh] w-auto object-contain"
            />
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
                className="h-12 w-12 rounded-full object-cover"
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
                  href={`/?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm capitalize text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {photo.externalUrl && (
            <a
              href={photo.externalUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-accent-600)]"
            >
              Voir le contenu
            </a>
          )}

          <PostActions id={photo.id} baseLikes={photo.likes} />
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold">Photos similaires</h2>
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
