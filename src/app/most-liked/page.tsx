import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";

export const revalidate = 30;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Most liked",
  description:
    "Most liked photos and videos on LeakFanHub. Sorted by likes only. 18+.",
  alternates: { canonical: "/most-liked" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    title: "Most liked · LeakFanHub",
    description: "Top content ranked purely by likes.",
    url: `${SITE}/most-liked`,
    siteName: "LeakFanHub",
  },
};

function first(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MostLikedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const cursorRaw = first(sp.cursor);
  const cursorParsed = cursorRaw ? parseInt(cursorRaw, 10) : NaN;
  const cursor = Number.isFinite(cursorParsed) && cursorParsed > 0 ? cursorParsed : undefined;

  const page = await getPhotos({ sort: "liked", limit: 24, cursor });

  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold">Plus aimés</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        Triés uniquement par likes.
      </p>
      <InfiniteGallery
        key={`liked-${cursor ?? 0}`}
        initial={page}
        params={{ sort: "liked" }}
      />
    </div>
  );
}
