import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCreator, getCreatorStats, getPhotos } from "@/lib/photos";
import { formatCount } from "@/lib/format";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FollowButton } from "@/components/Interactions";
import { MediaImg } from "@/components/MediaImg";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const creator = await getCreator(handle);
  return { title: creator ? creator.name : "Profil introuvable" };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const creator = await getCreator(handle);
  if (!creator) notFound();

  const stats = await getCreatorStats(handle);
  const page = await getPhotos({ creator: handle, sort: "recent", limit: 30 });
  const coverPage = await getPhotos({
    creator: handle,
    sort: "trending",
    limit: 1,
  });
  const cover = coverPage.items[0];
  const avatarSrc =
    creator.avatarUrl && creator.avatarUrl.trim()
      ? creator.avatarUrl
      : cover?.imageUrl || "/media/placeholder.jpg";

  return (
    <div>
      {/* Cover banner */}
      <div className="relative h-44 w-full overflow-hidden bg-[var(--color-surface-2)] sm:h-56">
        {cover && (
          <MediaImg
            src={cover.imageUrl}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover opacity-50"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/50 to-transparent" />
      </div>

      <div className="px-3 sm:px-5">
        <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <MediaImg
              src={avatarSrc}
              alt={creator.name}
              width={128}
              height={128}
              className="h-28 w-28 rounded-2xl object-cover ring-4 ring-[var(--color-bg)] sm:h-32 sm:w-32"
            />
            <div className="pb-1">
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                {creator.name}
                {creator.verified && <VerifiedBadge size={20} />}
              </h1>
              {creator.bio ? (
                <p className="mt-1 max-w-md text-[var(--color-ink-muted)]">
                  {creator.bio}
                </p>
              ) : null}
              {creator.location ? (
                <p className="mt-1 flex items-center gap-1 text-sm text-[var(--color-ink-faint)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {creator.location}
                </p>
              ) : null}
            </div>
          </div>

          <FollowButton
            handle={creator.handle}
            className="self-start px-6 py-2.5 sm:self-auto"
          />
        </div>

        <div className="mt-6 grid max-w-lg grid-cols-3 gap-3">
          {[
            { label: "Abonnés", value: formatCount(creator.followers) },
            { label: "Photos", value: String(stats.photoCount) },
            { label: "Vues totales", value: formatCount(stats.totalViews) },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center"
            >
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-[var(--color-ink-faint)]">{s.label}</p>
            </div>
          ))}
        </div>

        <section className="mt-8 pb-4">
          <h2 className="mb-3 text-lg font-bold">Galerie</h2>
          <InfiniteGallery
            key={handle}
            initial={page}
            params={{ sort: "recent", creator: handle }}
          />
        </section>
      </div>
    </div>
  );
}
