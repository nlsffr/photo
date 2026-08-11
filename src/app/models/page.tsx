import type { Metadata } from "next";
import Link from "next/link";
import { getModels } from "@/lib/photos";
import { CreatorCard } from "@/components/CreatorCard";
import { JsonLd } from "@/components/JsonLd";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

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
  const models = await getModels(sort);

  const toggle =
    "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors";

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Models & creators",
    url: `${SITE}/models`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: models.length,
      itemListElement: models.slice(0, 50).map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/creator/${encodeURIComponent(m.handle)}`,
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
            {models.length} creators on LeakFanHub
          </p>
        </div>
        <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          <Link
            href="/models"
            title="Sort by followers"
            className={`${toggle} ${
              sort === "followers"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            Top followed
          </Link>
          <Link
            href="/models?sort=views"
            title="Sort by content views"
            className={`${toggle} ${
              sort === "views"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            Top viewed
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {models.map((c) => (
          <CreatorCard key={c.handle} creator={c} />
        ))}
      </div>
    </div>
  );
}
