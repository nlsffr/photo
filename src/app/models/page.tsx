import type { Metadata } from "next";
import Link from "next/link";
import { getModels } from "@/lib/photos";
import { CreatorCard } from "@/components/CreatorCard";
import { JsonLd } from "@/components/JsonLd";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");
/** Cap first paint — full list kills TTFB with 800+ creators */
const PAGE_SIZE = 48;

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Models & creators",
  description:
    "Browse all creators on LeakFanHub. Sort by followers or views. Free photos and videos. 18+.",
  alternates: { canonical: "/models" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    title: "Models & creators · LeakFanHub",
    description: "All creators — photos and videos. Sort by followers or views.",
    url: `${SITE}/models`,
    siteName: "LeakFanHub",
  },
};

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const sort = first(sp.sort) === "views" ? "views" : "followers";
  const pageNum = Math.max(1, parseInt(first(sp.page) || "1", 10) || 1);
  const all = await getModels(sort);
  const total = all.length;
  const start = (pageNum - 1) * PAGE_SIZE;
  const models = all.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < total;

  const toggle =
    "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors";

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Models & creators",
    url: `${SITE}/models`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: models.slice(0, 50).map((m, i) => ({
        "@type": "ListItem",
        position: start + i + 1,
        url: `${SITE}/creator/${encodeURIComponent(m.handle)}`,
        name: m.name || m.handle,
      })),
    },
  };

  const sortQs = sort === "views" ? "sort=views&" : "";

  return (
    <div className="px-3 py-6 sm:px-5">
      <JsonLd data={itemListLd} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Models</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {total} creators on LeakFanHub
          </p>
        </div>
        <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          <Link
            href="/models"
            className={`${toggle} ${
              sort === "followers"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            Plus suivis
          </Link>
          <Link
            href="/models?sort=views"
            className={`${toggle} ${
              sort === "views"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            Plus vus
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {models.map((c) => (
          <CreatorCard key={c.handle} creator={c} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <Link
            href={`/models?${sortQs}page=${pageNum + 1}`}
            className="rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
          >
            Voir plus
          </Link>
        </div>
      )}
    </div>
  );
}
