import type { Metadata } from "next";
import { Suspense } from "react";
import { getPhotos } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";
import { SortTabs } from "@/components/SortTabs";
import { AiFilterTabs } from "@/components/AiFilterTabs";

export const dynamic = "force-dynamic";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  return {
    title: `#${decoded}`,
    description: `Médias tagués #${decoded} sur LumenGallery`,
  };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);
  const sp = await searchParams;

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
  const basePath = `/tag/${encodeURIComponent(tag)}`;
  const queryKey = `tag|${tag}|${sort}|${type ?? ""}|${ai ?? ""}`;

  return (
    <div className="px-3 py-4 sm:px-5">
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">#{tag}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={<div className="h-9 w-28" />}>
              <AiFilterTabs basePath={basePath} />
            </Suspense>
            <Suspense fallback={<div className="h-9 w-52" />}>
              <MediaTypeTabs basePath={basePath} />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<div className="h-9" />}>
          <SortTabs basePath={basePath} />
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
