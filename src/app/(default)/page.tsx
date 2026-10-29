import type { Metadata } from "next";
import { getPhotos, getAllTags } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { FeaturedCreators } from "@/components/FeaturedCreators";
import { HomeFilters } from "@/components/HomeFilters";
import { AdSlot } from "@/components/AdSlot";
import { JsonLd } from "@/components/JsonLd";

export const revalidate = 30;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

const VALID_SORTS: SortKey[] = [
  "discover",
  "popular",
  "recent",
  "trending",
  "liked",
  "longest",
  "random",
];

export const metadata: Metadata = {
  title: {
    absolute: "Latest OnlyFans Leaks - LeakFanHub",
  },
  description:
    "Free OnlyFans leaks gallery on LeakFanHub. Browse photos and videos from popular creators. Updated daily. 18+ only.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
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
  const tag = first(sp.tag);
  const typeRaw = first(sp.type);
  const type: MediaType | undefined =
    typeRaw === "photo" || typeRaw === "video" || typeRaw === "pack"
      ? typeRaw
      : undefined;

  const sortRaw = first(sp.sort);
  const sort: SortKey = VALID_SORTS.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : "discover";

  const [page, allTags] = await Promise.all([
    getPhotos({ sort, tag, type, limit: 24 }),
    getAllTags(),
  ]);
  const queryKey = `${sort}|${tag ?? ""}|${type ?? ""}`;

  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LeakFanHub",
    url: SITE,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE}/recherche?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="px-2 py-3 sm:px-5 sm:py-4">
      <JsonLd data={websiteLd} />
      <AdSlot variant="banner" />
      <FeaturedCreators />

      <HomeFilters tags={allTags} sort={sort} type={type} tag={tag} />

      <InfiniteGallery
        key={queryKey}
        initial={page}
        params={{ sort, tag, type }}
      />
    </div>
  );
}
