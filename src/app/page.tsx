import { Suspense } from "react";
import Link from "next/link";
import { getPhotos, getAllTags } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { FeaturedCreators } from "@/components/FeaturedCreators";
import { TagChips } from "@/components/TagChips";
import { AdSlot } from "@/components/AdSlot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_SORTS: SortKey[] = [
  "popular",
  "recent",
  "trending",
  "liked",
  "longest",
  "random",
];

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function hrefFor(opts: {
  sort?: string;
  type?: string | null;
  tag?: string;
}) {
  const p = new URLSearchParams();
  if (opts.sort && opts.sort !== "popular") p.set("sort", opts.sort);
  if (opts.type) p.set("type", opts.type);
  if (opts.tag) p.set("tag", opts.tag);
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const tag = first(sp.tag);
  const typeRaw = first(sp.type);
  const type: MediaType | undefined =
    typeRaw === "photo" || typeRaw === "video" || typeRaw === "pack"
      ? typeRaw
      : undefined;

  const sortRaw = first(sp.sort);
  const sort: SortKey = VALID_SORTS.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : "popular";

  const page = await getPhotos({ sort, tag, type });
  const allTags = await getAllTags();
  const queryKey = `${sort}|${tag ?? ""}|${type ?? ""}`;

  // Une seule rangée de chips : type + sort mélangés proprement
  const chips: { label: string; href: string; active: boolean }[] = [
    { label: "Top", href: hrefFor({ type }), active: sort === "popular" && !type },
    {
      label: "Vidéos",
      href: hrefFor({ type: "video", sort }),
      active: type === "video",
    },
    {
      label: "Photos",
      href: hrefFor({ type: "photo", sort }),
      active: type === "photo",
    },
    {
      label: "Récents",
      href: hrefFor({ type, sort: "recent" }),
      active: sort === "recent",
    },
    {
      label: "Tendances",
      href: hrefFor({ type, sort: "trending" }),
      active: sort === "trending",
    },
  ];

  return (
    <div className="px-2 py-3 sm:px-5 sm:py-4">
      <AdSlot variant="banner" />
      <FeaturedCreators />

      <div className="mb-3 hidden sm:block">
        <TagChips tags={allTags} activeTag={tag} />
      </div>

      {/* Une seule barre de filtres — mobile & desktop */}
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-0.5">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            scroll={false}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              c.active
                ? "bg-[var(--color-accent)] text-white shadow-sm shadow-[var(--color-accent)]/30"
                : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"
            }`}
          >
            {c.label}
          </Link>
        ))}
        <Link
          href="/feed"
          className="ml-auto shrink-0 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)]"
        >
          Feed ↗
        </Link>
      </div>

      <InfiniteGallery
        key={queryKey}
        initial={page}
        params={{ sort, tag, type }}
      />
    </div>
  );
}
