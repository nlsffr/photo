import { Suspense } from "react";
import { getPhotos, getAllTags } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { FeaturedCreators } from "@/components/FeaturedCreators";
import { TagChips } from "@/components/TagChips";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";
import { SortTabs } from "@/components/SortTabs";
import { AiFilterTabs } from "@/components/AiFilterTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_SORTS: SortKey[] = ["popular", "recent", "trending", "liked"];

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
      ? "🤖 Contenu IA"
      : ai === "0"
        ? "✨ Contenu réel"
        : "🔥 Tendances du moment";

  return (
    <div className="px-3 py-4 sm:px-5">
      <FeaturedCreators />

      <TagChips tags={allTags} activeTag={tag} />

      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {heading}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={<div className="h-9 w-28" />}>
              <AiFilterTabs basePath="/" />
            </Suspense>
            <Suspense fallback={<div className="h-9 w-52" />}>
              <MediaTypeTabs basePath="/" />
            </Suspense>
          </div>
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
