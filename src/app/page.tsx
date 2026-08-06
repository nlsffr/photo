import { Suspense } from "react";
import Link from "next/link";
import { getPhotos, getAllTags } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { FeaturedCreators } from "@/components/FeaturedCreators";
import { TagChips } from "@/components/TagChips";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";
import { SortTabs } from "@/components/SortTabs";
import { AiFilterTabs } from "@/components/AiFilterTabs";
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

  const aiRaw = first(sp.ai);
  const ai = aiRaw === "0" || aiRaw === "1" ? aiRaw : undefined;
  const isAi = ai === "1" ? true : ai === "0" ? false : undefined;

  const page = await getPhotos({ sort, tag, type, isAi });
  const allTags = await getAllTags();
  const queryKey = `${sort}|${tag ?? ""}|${type ?? ""}|${ai ?? ""}`;

  const heading = tag
    ? `#${tag}`
    : ai === "1"
      ? "Contenu IA"
      : ai === "0"
        ? "Contenu réel"
        : sort === "random"
          ? "Aléatoire"
          : "Tendances";

  return (
    <div className="px-2 py-3 sm:px-5 sm:py-4">
      <AdSlot variant="banner" />
      <FeaturedCreators />

      {/* Tags: hide on very small to reduce noise — show from sm */}
      <div className="hidden sm:block">
        <TagChips tags={allTags} activeTag={tag} />
      </div>

      <div className="mb-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold tracking-tight sm:text-2xl">
            {heading}
          </h1>
          {/* Desktop only extra actions */}
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            <Link
              href="/?sort=random"
              className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-ink-muted)]"
            >
              Aléatoire
            </Link>
            <Link
              href="/feed"
              className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white"
            >
              Feed
            </Link>
            <Suspense fallback={null}>
              <AiFilterTabs basePath="/" />
            </Suspense>
            <Suspense fallback={null}>
              <MediaTypeTabs basePath="/" />
            </Suspense>
          </div>
        </div>

        {/* Mobile: type toggle simple (Tout / Photos / Vidéos) */}
        <div className="flex gap-2 sm:hidden">
          {(
            [
              { label: "Tout", href: "/" },
              { label: "Photos", href: "/?type=photo" },
              { label: "Vidéos", href: "/?type=video" },
            ] as const
          ).map((t) => {
            const active =
              (t.label === "Tout" && !type) ||
              (t.label === "Photos" && type === "photo") ||
              (t.label === "Vidéos" && type === "video");
            return (
              <Link
                key={t.label}
                href={t.href}
                className={`flex-1 rounded-full py-2 text-center text-sm font-semibold ${
                  active
                    ? "bg-[var(--color-accent)] text-white"
                    : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        <Suspense fallback={<div className="h-9" />}>
          <SortTabs basePath="/" />
        </Suspense>
      </div>

      <InfiniteGallery
        key={queryKey}
        initial={page}
        params={{ sort, tag, type, ai }}
      />
    </div>
  );
}
