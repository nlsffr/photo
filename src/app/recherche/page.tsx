import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getPhotos, getAllTags, searchCreators } from "@/lib/photos";
import type { MediaType } from "@/lib/types";
import { SearchForm } from "@/components/SearchForm";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";
import { AiFilterTabs } from "@/components/AiFilterTabs";
import { MediaImg } from "@/components/MediaImg";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { formatCount } from "@/lib/format";

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
  const aiRaw = first(sp.ai);
  const ai = aiRaw === "0" || aiRaw === "1" ? aiRaw : undefined;
  const isAi = ai === "1" ? true : ai === "0" ? false : undefined;

  const hasQuery = Boolean((q && q.trim()) || tag);

  const label = q ? q : tag ? `#${tag}` : null;
  const page = hasQuery
    ? await getPhotos({ q, tag, type, isAi, sort: "popular" })
    : await getPhotos({ type, isAi, sort: "trending" });
  const allTags = await getAllTags();
  const creators =
    q && q.trim().length >= 2 ? await searchCreators(q.trim(), 8) : [];

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
          <SearchForm tags={allTags} />
        </Suspense>
      </div>

      {creators.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--color-ink-faint)]">
            Profils
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => (
              <Link
                key={c.handle}
                href={`/creator/${c.handle}`}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors hover:border-[var(--color-accent)]/50"
              >
                <MediaImg
                  src={c.avatarUrl || "/media/placeholder.jpg"}
                  alt={c.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-semibold">
                    <span className="truncate">{c.name}</span>
                    {c.verified && <VerifiedBadge size={13} />}
                  </p>
                  <p className="truncate text-sm text-[var(--color-ink-muted)]">
                    @{c.handle}
                    {c.followers
                      ? ` · ${formatCount(c.followers)} abonnés`
                      : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-muted)]">
          {hasQuery
            ? `${page.total.toLocaleString("fr-FR")} résultat${page.total > 1 ? "s" : ""}`
            : "Tendances du moment"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={<div className="h-9 w-28" />}>
            <AiFilterTabs basePath="/recherche" />
          </Suspense>
          <Suspense fallback={<div className="h-9 w-52" />}>
            <MediaTypeTabs basePath="/recherche" />
          </Suspense>
        </div>
      </div>

      <InfiniteGallery
        key={`${q ?? ""}|${tag ?? ""}|${type ?? ""}|${ai ?? ""}|${hasQuery}`}
        initial={page}
        params={
          hasQuery
            ? { sort: "popular", q, tag, type, ai }
            : { sort: "trending", type, ai }
        }
      />
    </div>
  );
}
