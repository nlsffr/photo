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
      : cover?.imageUrl || "";

  return (
    <div>
      {/* Compact banner — softer crop, less empty space */}
      <div className="relative h-28 w-full overflow-hidden bg-[var(--color-surface-2)] sm:h-36">
        {cover?.imageUrl ? (
          <>
            <MediaImg
              src={cover.imageUrl}
              alt=""
              fill
              sizes="100vw"
              priority
              className="scale-110 object-cover object-center blur-sm opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/70 to-[var(--color-bg)]/20" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-surface)]" />
        )}
      </div>

      <div className="px-3 sm:px-5">
        {/* Avatar overlaps banner lightly */}
        <div className="-mt-10 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-3 sm:gap-4">
            <div className="relative shrink-0">
              {avatarSrc ? (
                <MediaImg
                  src={avatarSrc}
                  alt={creator.name}
                  width={112}
                  height={112}
                  className="h-24 w-24 rounded-full object-cover object-top ring-4 ring-[var(--color-bg)] sm:h-28 sm:w-28"
                />
              ) : (
                <div className="grid h-24 w-24 place-items-center rounded-full bg-[var(--color-surface-2)] text-2xl font-bold text-[var(--color-ink-faint)] ring-4 ring-[var(--color-bg)] sm:h-28 sm:w-28">
                  {creator.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 pb-1">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
                <span className="truncate">{creator.name}</span>
                {creator.verified && <VerifiedBadge size={18} />}
              </h1>
              {creator.bio ? (
                <p className="mt-0.5 line-clamp-2 max-w-md text-sm text-[var(--color-ink-muted)]">
                  {creator.bio}
                </p>
              ) : null}
              {creator.location ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-ink-faint)] sm:text-sm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
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

        <div className="mt-5 grid max-w-lg grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Abonnés", value: formatCount(creator.followers) },
            { label: "Photos", value: String(stats.photoCount) },
            { label: "Vues totales", value: formatCount(stats.totalViews) },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-3 text-center sm:p-4"
            >
              <p className="text-lg font-bold sm:text-xl">{s.value}</p>
              <p className="text-[10px] text-[var(--color-ink-faint)] sm:text-xs">{s.label}</p>
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
