import type { Metadata } from "next";
import Link from "next/link";
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
  const path = `/tag/${encodeURIComponent(decoded)}`;
  return {
    title: `#${decoded}`,
    description: `Photos and videos tagged #${decoded} on LeakFanHub. Free gallery, updated daily. 18+.`,
    alternates: { canonical: path },
    robots: { index: true, follow: true, "max-image-preview": "large" },
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

  const cursorRaw = first(sp.cursor);
  const cursorParsed = cursorRaw ? parseInt(cursorRaw, 10) : NaN;
  const cursor = Number.isFinite(cursorParsed) && cursorParsed > 0 ? cursorParsed : undefined;

  const page = await getPhotos({ sort, tag, type, isAi, cursor, limit: 30 });
  const basePath = `/tag/${encodeURIComponent(tag)}`;
  const queryKey = `tag|${tag}|${sort}|${type ?? ""}|${ai ?? ""}|${cursor ?? 0}`;

  const nextParams = new URLSearchParams();
  if (sort !== "popular") nextParams.set("sort", sort);
  if (type) nextParams.set("type", type);
  if (ai) nextParams.set("ai", ai);
  if (page.nextCursor != null) nextParams.set("cursor", String(page.nextCursor));
  const qs = nextParams.toString();
  const nextHref = page.nextCursor != null ? `${basePath}${qs ? `?${qs}` : ""}` : null;

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

      {nextHref && (
        <nav className="mt-8 flex justify-center" aria-label="Pagination">
          <Link
            href={nextHref}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-semibold"
          >
            More #{tag} →
          </Link>
        </nav>
      )}
    </div>
  );
}
