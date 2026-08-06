import type { Metadata } from "next";
import { Suspense } from "react";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { SortTabs } from "@/components/SortTabs";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";
import { AiFilterTabs } from "@/components/AiFilterTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending medias",
  description: "Médias en tendance — vues, likes et récence",
};

const WINDOWS = [
  { key: "hour", label: "Last hour", minutes: 60 },
  { key: "day", label: "Day", minutes: 60 * 24 },
  { key: "week", label: "Week", minutes: 60 * 24 * 7 },
  { key: "month", label: "Month", minutes: 60 * 24 * 30 },
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
  const page = await getPhotos({ sort: "trending", limit: 30 });

  // Client-side window filter approximation on already scored trending list
  const windowDef = WINDOWS.find((w) => w.key === win) ?? WINDOWS[2];
  const filtered = {
    ...page,
    items: page.items.filter((p) => p.ageMinutes <= windowDef.minutes),
  };
  if (filtered.items.length < 8) {
    filtered.items = page.items;
  }

  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-2 text-2xl font-bold">Trending medias</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        Classement par score (vues + likes × 3), fenêtre temporelle approximative.
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
      <Suspense>
        <SortTabs basePath="/trending-medias" />
      </Suspense>
      <div className="mt-4">
        <InfiniteGallery
          key={`tr-${win}`}
          initial={filtered}
          params={{ sort: "trending" }}
        />
      </div>
    </div>
  );
}
