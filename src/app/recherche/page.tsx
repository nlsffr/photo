import type { Metadata } from "next";
import { Suspense } from "react";
import { ALL_TAGS } from "@/lib/data";
import { getPhotos } from "@/lib/photos";
import { SearchForm } from "@/components/SearchForm";
import { InfiniteGallery } from "@/components/InfiniteGallery";

export const metadata: Metadata = { title: "Recherche" };

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = first(sp.q);
  const tag = first(sp.tag);
  const hasQuery = Boolean((q && q.trim()) || tag);

  const label = q ? q : tag ? `#${tag}` : null;
  const page = hasQuery
    ? getPhotos({ q, tag, sort: "popular" })
    : getPhotos({ sort: "trending" });

  return (
    <div className="px-3 py-5 sm:px-5">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">
        <span className="text-[var(--color-accent)]">Recherche</span>
        {label && (
          <span className="text-[var(--color-ink-muted)]"> / {label}</span>
        )}
      </h1>

      <div className="mb-6 max-w-4xl">
        <Suspense fallback={<div className="h-32" />}>
          <SearchForm tags={ALL_TAGS} />
        </Suspense>
      </div>

      {hasQuery ? (
        <>
          <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
            {page.total.toLocaleString("fr-FR")} résultat
            {page.total > 1 ? "s" : ""}
          </p>
          <InfiniteGallery
            key={`${q ?? ""}|${tag ?? ""}`}
            initial={page}
            params={{ sort: "popular", q, tag }}
          />
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
            Tape ta recherche, ou explore les tendances du moment.
          </p>
          <InfiniteGallery
            key="discover"
            initial={page}
            params={{ sort: "trending" }}
          />
        </>
      )}
    </div>
  );
}
