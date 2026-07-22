import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCreator, getCreatorStats, getPhotos } from "@/lib/photos";
import { formatCount } from "@/lib/format";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FollowButton } from "@/components/Interactions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const creator = getCreator(handle);
  return { title: creator ? creator.name : "Profil introuvable" };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const creator = getCreator(handle);
  if (!creator) notFound();

  const stats = getCreatorStats(handle);
  const page = getPhotos({ creator: handle, sort: "recent", limit: 30 });
  const cover = getPhotos({ creator: handle, sort: "trending", limit: 1 })
    .items[0];

  return (
    <div>
      {/* Cover banner */}
      <div className="relative h-44 w-full overflow-hidden sm:h-56">
        {cover && (
          <Image
            src={cover.imageUrl}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/40 to-transparent" />
      </div>

      <div className="px-3 sm:px-5">
        {/* Profile header */}
        <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Image
              src={creator.avatarUrl}
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
              <p className="mt-1 max-w-md text-[var(--color-ink-muted)]">
                {creator.bio}
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm text-[var(--color-ink-faint)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {creator.location}
              </p>
            </div>
          </div>

          <FollowButton
            handle={creator.handle}
            className="self-start px-6 py-2.5 sm:self-auto"
          />
        </div>

        {/* Stats */}
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

        {/* Photos */}
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
