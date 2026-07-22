import type { Metadata } from "next";
import { Suspense } from "react";
import { ALL_TAGS } from "@/lib/data";
import { getPhotos } from "@/lib/photos";
import type { MediaType } from "@/lib/types";
import { SearchForm } from "@/components/SearchForm";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";

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
  const typeRaw = first(sp.type);
  const type: MediaType | undefined =
    typeRaw === "photo" || typeRaw === "video" ? typeRaw : undefined;
  const hasQuery = Boolean((q && q.trim()) || tag);

  const label = q ? q : tag ? `#${tag}` : null;
  const page = hasQuery
    ? getPhotos({ q, tag, type, sort: "popular" })
    : getPhotos({ type, sort: "trending" });

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

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-muted)]">
          {hasQuery
            ? `${page.total.toLocaleString("fr-FR")} résultat${page.total > 1 ? "s" : ""}`
            : "Tendances du moment"}
        </p>
        <Suspense fallback={<div className="h-9 w-52" />}>
          <MediaTypeTabs basePath="/recherche" />
        </Suspense>
      </div>

      <InfiniteGallery
        key={`${q ?? ""}|${tag ?? ""}|${type ?? ""}|${hasQuery}`}
        initial={page}
        params={
          hasQuery
            ? { sort: "popular", q, tag, type }
            : { sort: "trending", type }
        }
      />
    </div>
  );
}
