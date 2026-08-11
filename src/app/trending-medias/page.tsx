import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { MediaTypeTabs } from "@/components/MediaTypeTabs";
import { AiFilterTabs } from "@/components/AiFilterTabs";

export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Trending media",
  description:
    "Trending photos and videos on LeakFanHub ranked by views and likes. Updated continuously. 18+.",
  alternates: { canonical: "/trending-medias" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    title: "Trending media · LeakFanHub",
    description: "What's trending now — photos and videos ranked by engagement.",
    url: `${SITE}/trending-medias`,
    siteName: "LeakFanHub",
  },
};

const WINDOWS = [
  { key: "day", label: "24 h", minutes: 60 * 24 },
  { key: "week", label: "7 days", minutes: 60 * 24 * 7 },
  { key: "month", label: "30 days", minutes: 60 * 24 * 30 },
  { key: "all", label: "All time", minutes: 60 * 24 * 365 * 10 },
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

  const cursorRaw = first(sp.cursor);
  const cursorParsed = cursorRaw ? parseInt(cursorRaw, 10) : NaN;
  const cursor = Number.isFinite(cursorParsed) && cursorParsed > 0 ? cursorParsed : undefined;

  const page = await getPhotos({ sort: "trending", type, limit: 30, cursor });
  const windowDef = WINDOWS.find((w) => w.key === win) ?? WINDOWS[1];
  let items = page.items.filter((p) => p.ageMinutes <= windowDef.minutes);
  if (items.length < 8) items = page.items;

  const nextParams = new URLSearchParams();
  nextParams.set("window", win);
  if (type) nextParams.set("type", type);
  if (page.nextCursor != null) nextParams.set("cursor", String(page.nextCursor));
  const nextHref =
    page.nextCursor != null ? `/trending-medias?${nextParams.toString()}` : null;

  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold">Trending</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        Ranked by engagement score (views + likes). Different order from Home and Most liked.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/trending-medias?window=${w.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              win === w.key
                ? "bg-[var(--color-accent)] text-white"
                : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
            }`}
          >
            {w.label}
          </Link>
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
        key={`tr-${win}-${type ?? ""}-${cursor ?? 0}`}
        initial={{ ...page, items }}
        params={{ sort: "trending", type }}
      />
      {nextHref && (
        <nav className="mt-8 flex justify-center" aria-label="Pagination">
          <Link
            href={nextHref}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-semibold"
          >
            More trending →
          </Link>
        </nav>
      )}
    </div>
  );
}
