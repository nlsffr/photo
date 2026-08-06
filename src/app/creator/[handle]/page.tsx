import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreator, getCreatorStats, getPhotos } from "@/lib/photos";
import { formatCount } from "@/lib/format";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { FollowButton } from "@/components/Interactions";
import { MediaImg } from "@/components/MediaImg";
import { BackLink } from "@/components/BackLink";

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
    description: creator.bio || `Profil de ${creator.name} sur LeakFanHub`,
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
    : "popular";

  const stats = await getCreatorStats(handle);
  const page = await getPhotos({ creator: handle, sort, type, limit: 30 });

  const coverFromDb = creator.coverUrl?.trim() || "";
  // Prefer a real photo (less watermark noise) over first video thumb
  const photoCover =
    page.items.find((i) => i.type === "photo" && i.imageUrl)?.imageUrl || "";
  const avatarSrc =
    creator.avatarUrl && creator.avatarUrl.trim()
      ? creator.avatarUrl
      : page.items[0]?.imageUrl || "";

  // Never use a random video thumb as banner (often competitor watermark)
  const coverSrc = coverFromDb || photoCover || "";
  const useAvatarBlur = !coverSrc && !!avatarSrc;

  const base = `/creator/${encodeURIComponent(handle)}`;
  const q = (opts: { type?: string | null; sort?: string }) => {
    const p = new URLSearchParams();
    if (opts.type) p.set("type", opts.type);
    if (opts.sort && opts.sort !== "popular") p.set("sort", opts.sort);
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const chips = [
    { label: "Tout", href: q({ sort }), active: !type },
    { label: "Photos", href: q({ type: "photo", sort }), active: type === "photo" },
    { label: "Vidéos", href: q({ type: "video", sort }), active: type === "video" },
    { label: "Top", href: q({ type, sort: "popular" }), active: sort === "popular" },
    { label: "Récents", href: q({ type, sort: "recent" }), active: sort === "recent" },
  ];

  const queryKey = `${handle}|${sort}|${type ?? ""}`;

  return (
    <div className="pb-4">
      <div className="px-3 pt-3 sm:px-5">
        <BackLink fallback="/" label="Retour" />
      </div>

      {/* Banner: clean photo OR blurred avatar OR solid gradient — no watermarked video thumbs */}
      <div className="relative mt-2 h-36 w-full overflow-hidden bg-[var(--color-surface-2)] sm:h-48">
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
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/50 to-black/20" />
          </>
        ) : useAvatarBlur ? (
          <>
            <MediaImg
              src={avatarSrc}
              alt=""
              fill
              sizes="100vw"
              priority
              className="scale-110 object-cover object-top blur-2xl brightness-75"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/60 to-[var(--color-accent)]/20" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-3)] via-[var(--color-surface)] to-[var(--color-accent)]/30" />
        )}
      </div>

      <div className="px-3 sm:px-5">
        <div className="-mt-12 flex items-end gap-3 sm:-mt-14 sm:gap-4">
          {avatarSrc ? (
            <MediaImg
              src={avatarSrc}
              alt={creator.name}
              width={112}
              height={112}
              className="h-22 w-22 h-[5.5rem] w-[5.5rem] shrink-0 rounded-full object-cover object-top ring-4 ring-[var(--color-bg)] sm:h-28 sm:w-28"
            />
          ) : (
            <div className="grid h-[5.5rem] w-[5.5rem] shrink-0 place-items-center rounded-full bg-[var(--color-surface-2)] text-xl font-bold ring-4 ring-[var(--color-bg)] sm:h-28 sm:w-28">
              {creator.name.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1 pb-1">
            <h1 className="flex flex-wrap items-center gap-1.5 text-lg font-bold sm:text-2xl">
              <span className="truncate">{creator.name}</span>
              {creator.verified && <VerifiedBadge size={16} />}
            </h1>
            <p className="text-sm text-[var(--color-ink-faint)]">@{creator.handle}</p>
          </div>

          <FollowButton handle={creator.handle} className="mb-1 shrink-0" />
        </div>

        {creator.bio ? (
          <p className="mt-3 line-clamp-3 text-sm text-[var(--color-ink-muted)]">
            {creator.bio}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            <strong>{formatCount(creator.followers)}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">abonnés</span>
          </span>
          <span>
            <strong>{stats.photoCount}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">médias</span>
          </span>
          <span>
            <strong>{formatCount(stats.totalViews)}</strong>{" "}
            <span className="text-[var(--color-ink-faint)]">vues</span>
          </span>
        </div>

        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto border-b border-[var(--color-border)] pb-3">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              scroll={false}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                c.active
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        <section className="mt-4 pb-6">
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
