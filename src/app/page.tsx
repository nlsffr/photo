import { Suspense } from "react";
import { getPhotos, getAllTags } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { FeaturedCreators } from "@/components/FeaturedCreators";
import { TagChips } from "@/components/TagChips";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";

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
    typeRaw === "photo" || typeRaw === "video" ? typeRaw : undefined;

  // Home = trending right now: everything (photos + videos) sorted by views,
  // most-viewed first, across all creators.
  const sort: SortKey = "popular";

  const page = await getPhotos({ sort, tag, type });
  const allTags = await getAllTags();
  const queryKey = `${sort}|${tag ?? ""}|${type ?? ""}`;

  const heading = tag ? `#${tag}` : "🔥 Tendances du moment";

  return (
    <div className="px-3 py-4 sm:px-5">
      <FeaturedCreators />

      <TagChips tags={allTags} activeTag={tag} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {heading}
          </h1>
          <span className="text-sm text-[var(--color-ink-faint)]">
            {page.total.toLocaleString("fr-FR")} publications · les plus vues
          </span>
        </div>
        <Suspense fallback={<div className="h-9 w-52" />}>
          <MediaTypeTabs basePath="/" />
        </Suspense>
      </div>

      <InfiniteGallery
        key={queryKey}
        initial={page}
        params={{ sort, tag, type }}
      />
    </div>
  );
}
