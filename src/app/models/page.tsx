import type { Metadata } from "next";
import Link from "next/link";
import { getModels } from "@/lib/photos";
import { CreatorCard } from "@/components/CreatorCard";

export const metadata: Metadata = { title: "Modèles" };

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

  return (
    <div className="px-3 py-6 sm:px-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Modèles</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {models.length} modèles sur LumenGallery
          </p>
        </div>
        <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          <Link
            href="/models"
            title="Trier par nombre d’abonnés"
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
            title="Trier par nombre de vues du contenu"
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {models.map((c) => (
          <CreatorCard key={c.handle} creator={c} />
        ))}
      </div>
    </div>
  );
}
