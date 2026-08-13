import type { Metadata } from "next";
import Link from "next/link";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import type { MediaType } from "@/lib/types";

export const revalidate = 30;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Tendances",
  description:
    "Médias en tendance sur LeakFanHub — classés par vues et likes. Mis à jour en continu. 18+.",
  alternates: { canonical: "/trending-medias" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    title: "Tendances · LeakFanHub",
    description: "Ce qui cartonne maintenant — photos et vidéos classées par engagement.",
    url: `${SITE}/trending-medias`,
    siteName: "LeakFanHub",
  },
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
  const type: MediaType | undefined =
    typeRaw === "photo" || typeRaw === "video" || typeRaw === "pack"
      ? typeRaw
      : undefined;

  const cursorRaw = first(sp.cursor);
  const cursorParsed = cursorRaw ? parseInt(cursorRaw, 10) : NaN;
  const cursor = Number.isFinite(cursorParsed) && cursorParsed > 0 ? cursorParsed : undefined;

  const page = await getPhotos({ sort: "trending", type, limit: 24, cursor });
  const windowDef = WINDOWS.find((w) => w.key === win) ?? WINDOWS[1];
  let items = page.items.filter((p) => p.ageMinutes <= windowDef.minutes);
  if (items.length < 8) items = page.items;

  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold">Tendances</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        Classés par engagement (vues + likes). Ordre différent de l’accueil et des plus aimés.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/trending-medias?window=${w.key}${type ? `&type=${type}` : ""}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              win === w.key
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"
            }`}
          >
            {w.label}
          </Link>
        ))}
      </div>
      <InfiniteGallery
        key={`trend-${win}-${type ?? "all"}-${cursor ?? 0}`}
        initial={{ ...page, items }}
        params={{ sort: "trending", type }}
      />
    </div>
  );
}
