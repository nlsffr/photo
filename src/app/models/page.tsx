import type { Metadata } from "next";
import Link from "next/link";
import { getModelCount, getModels } from "@/lib/photos";
import {
  buildModelsPagePayload,
  MODELS_PAGE_SIZE,
} from "@/lib/models-pagination";
import { creatorHref } from "@/lib/types";
import { ModelsGrid } from "@/components/ModelsGrid";
import { JsonLd } from "@/components/JsonLd";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

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
  const start = (pageNum - 1) * MODELS_PAGE_SIZE;
  const [pageModels, total] = await Promise.all([
    getModels(sort, MODELS_PAGE_SIZE + 1, start),
    getModelCount(),
  ]);
  const page = buildModelsPagePayload(pageModels, start, MODELS_PAGE_SIZE);
  const models = page.items;

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
        url: `${SITE}${creatorHref(m.handle, m.urlVersion)}`,
        name: m.name || m.handle,
      })),
    },
  };

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

      <ModelsGrid
        key={`${sort}:${start}`}
        initialModels={models}
        initialHasMore={page.hasMore}
        initialNextOffset={page.nextOffset}
        sort={sort}
      />
    </div>
  );
}
