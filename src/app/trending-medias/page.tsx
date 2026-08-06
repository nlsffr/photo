import type { Metadata } from "next";
import { Suspense } from "react";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";
import { AiFilterTabs } from "@/components/AiFilterTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tendances",
  description: "Score trending (vues + likes) — distinct de popular et most liked",
};

const WINDOWS = [
  { key: "day", label: "24 h", minutes: 60 * 24 },
  { key: "week", label: "7 jours", minutes: 60 * 24 * 7 },
  { key: "month", label: "30 jours", minutes: 60 * 24 * 30 },
  { key: "all", label: "Tout", minutes: 60 * 24 * 365 * 10 },
] as const;

function first(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function TrendingMediasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const win = first(sp.window) ?? "week";
  const typeRaw = first(sp.type);
  const type =
    typeRaw === "photo" || typeRaw === "video" || typeRaw === "pack"
      ? typeRaw
      : undefined;

  const page = await getPhotos({ sort: "trending", type, limit: 30 });
  const windowDef = WINDOWS.find((w) => w.key === win) ?? WINDOWS[1];
  let items = page.items.filter((p) => p.ageMinutes <= windowDef.minutes);
  if (items.length < 8) items = page.items;

  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold">Tendances</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        Classement par score (vues + likes × 3), pas le même ordre que l’accueil
        (popular) ni Most liked.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <a
            key={w.key}
            href={`/trending-medias?window=${w.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              win === w.key
                ? "bg-[var(--color-accent)] text-white"
                : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
          >
            {w.label}
          </a>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Suspense>
          <AiFilterTabs basePath="/trending-medias" />
        </Suspense>
        <Suspense>
          <MediaTypeTabs basePath="/trending-medias" />
        </Suspense>
      </div>
      <InfiniteGallery
        key={`tr-${win}-${type ?? ""}`}
        initial={{ ...page, items }}
        params={{ sort: "trending", type }}
      />
    </div>
  );
}
