import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCreator, getCreatorStats, getPhotos } from "@/lib/photos";
import { formatCount } from "@/lib/format";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FollowButton } from "@/components/Interactions";
import { MediaImg } from "@/components/MediaImg";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";
import { SortTabs } from "@/components/SortTabs";

export const dynamic = "force-dynamic";

const VALID_SORTS: SortKey[] = ["recent", "popular", "liked", "trending", "longest"];

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const creator = await getCreator(handle);
  if (!creator) return { title: "Profil introuvable" };
  return {
    title: `${creator.name} (@${creator.handle})`,
    description: creator.bio || `Profil de ${creator.name} sur LumenGallery`,
  };
}

export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { handle } = await params;
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
    : "recent";

  const stats = await getCreatorStats(handle);
  const page = await getPhotos({ creator: handle, sort, type, limit: 30 });

  const coverFromDb = creator.coverUrl?.trim();
  const coverFallback = page.items[0]?.imageUrl;
  const coverSrc = coverFromDb || coverFallback || "";

  const avatarSrc =
    creator.avatarUrl && creator.avatarUrl.trim()
      ? creator.avatarUrl
      : coverFallback || "";

  const basePath = `/creator/${encodeURIComponent(handle)}`;
  const queryKey = `${handle}|${sort}|${type ?? ""}`;

  return (
    <div>
      <div className="relative h-36 w-full overflow-hidden bg-[var(--color-surface-2)] sm:h-48">
        {coverSrc ? (
          <>
            <MediaImg
              src={coverSrc}
              alt=""
              fill
              sizes="100vw"
              priority
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/50 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-surface)]" />
        )}
      </div>

      <div className="px-3 sm:px-5">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-3 sm:gap-4">
            <div className="relative shrink-0">
              {avatarSrc ? (
                <MediaImg
                  src={avatarSrc}
                  alt={creator.name}
                  width={120}
                  height={120}
                  className={`h-24 w-24 rounded-full object-cover object-top ring-4 ring-[var(--color-bg)] sm:h-28 sm:w-28 ${
                    creator.verified ? "ring-[var(--color-accent)]" : ""
                  }`}
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
              <p className="text-sm text-[var(--color-ink-faint)]">@{creator.handle}</p>
              {creator.bio ? (
                <p className="mt-1 line-clamp-3 max-w-lg text-sm text-[var(--color-ink-muted)]">
                  {creator.bio}
                </p>
              ) : null}
              {creator.location ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-ink-faint)] sm:text-sm">
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
            { label: "Médias", value: String(stats.photoCount) },
            { label: "Vues", value: formatCount(stats.totalViews) },
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

        <div className="mt-6 flex flex-col gap-3 border-b border-[var(--color-border)] pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav className="flex gap-1 rounded-full bg-[var(--color-surface-2)] p-1 text-sm">
              {(
                [
                  { label: "Tout", href: basePath },
                  { label: "Photos", href: `${basePath}?type=photo` },
                  { label: "Vidéos", href: `${basePath}?type=video` },
                ] as const
              ).map((t) => {
                const active =
                  (t.label === "Tout" && !type) ||
                  (t.label === "Photos" && type === "photo") ||
                  (t.label === "Vidéos" && type === "video");
                return (
                  <Link
                    key={t.label}
                    href={t.href + (sort !== "recent" ? `${t.href.includes("?") ? "&" : "?"}sort=${sort}` : "")}
                    className={`rounded-full px-3 py-1.5 font-medium transition ${
                      active
                        ? "bg-[var(--color-accent)] text-white"
                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
            <Suspense fallback={<div className="h-9 w-40" />}>
              <MediaTypeTabs basePath={basePath} />
            </Suspense>
          </div>
          <Suspense fallback={<div className="h-9" />}>
            <SortTabs basePath={basePath} />
          </Suspense>
        </div>

        <section className="mt-4 pb-4">
          <InfiniteGallery
            key={queryKey}
            initial={page}
            params={{ sort, creator: handle, type }}
          />
        </section>
      </div>
    </div>
  );
}
