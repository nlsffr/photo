import { ALL_TAGS } from "@/lib/data";
import { getPhotos } from "@/lib/photos";
import type { SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { FeaturedCreators } from "@/components/FeaturedCreators";
import { TagChips } from "@/components/TagChips";

const VALID_SORTS: SortKey[] = ["recent", "trending", "popular", "liked", "random"];

const SORT_LABEL: Record<SortKey, string> = {
  recent: "Récents",
  trending: "🔥 Tendances",
  popular: "Populaires",
  liked: "Plus aimés",
  random: "Aléatoire",
};

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const sortRaw = first(sp.sort);
  const sort: SortKey = VALID_SORTS.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : "recent";
  const tag = first(sp.tag);

  const page = getPhotos({ sort, tag });
  const queryKey = `${sort}|${tag ?? ""}`;

  const heading = tag ? `#${tag}` : SORT_LABEL[sort];

  return (
    <div className="px-3 py-4 sm:px-5">
      <FeaturedCreators />

      <TagChips tags={ALL_TAGS} activeTag={tag} />

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold capitalize tracking-tight sm:text-2xl">
          {heading}
        </h1>
        <span className="shrink-0 text-sm text-[var(--color-ink-faint)]">
          {page.total.toLocaleString("fr-FR")} publications
        </span>
      </div>

      <InfiniteGallery key={queryKey} initial={page} params={{ sort, tag }} />
    </div>
  );
}
