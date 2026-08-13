import type { Metadata } from "next";
import Link from "next/link";
import { getPhotos, getAllTags } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { FeaturedCreators } from "@/components/FeaturedCreators";
import { TagChips } from "@/components/TagChips";
import { AdSlot } from "@/components/AdSlot";
import { JsonLd } from "@/components/JsonLd";

export const revalidate = 30;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

const VALID_SORTS: SortKey[] = [
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

  const page = await getPhotos({ sort, tag, type, limit: 24 });
  const allTags = await getAllTags();
  const queryKey = `${sort}|${tag ?? ""}|${type ?? ""}`;

  const filters: { label: string; href: string; active: boolean }[] = [
    { label: "Plus vus", href: hrefFor({ sort: "popular", type, tag }), active: sort === "popular" },
    { label: "Plus aimés", href: hrefFor({ sort: "liked", type, tag }), active: sort === "liked" },
    { label: "Récents", href: hrefFor({ sort: "recent", type, tag }), active: sort === "recent" },
    { label: "Photos", href: hrefFor({ sort, type: "photo", tag }), active: type === "photo" },
    { label: "Vidéos", href: hrefFor({ sort, type: "video", tag }), active: type === "video" },
  ];

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

      <div className="mb-3 hidden sm:block">
        <TagChips tags={allTags} activeTag={tag} />
      </div>

      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-0.5">
        {filters.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            scroll={false}
            prefetch={true}
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
          prefetch={true}
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
