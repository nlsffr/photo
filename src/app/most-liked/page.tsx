import type { Metadata } from "next";
import Link from "next/link";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";

export const dynamic = "force-dynamic";

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

  const page = await getPhotos({ sort: "liked", limit: 30, cursor });
  const nextHref =
    page.nextCursor != null ? `/most-liked?cursor=${page.nextCursor}` : null;

  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold">Most liked</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        Sorted by likes only (not views).
      </p>
      <InfiniteGallery
        key={`liked-${cursor ?? 0}`}
        initial={page}
        params={{ sort: "liked" }}
      />
      {nextHref && (
        <nav className="mt-8 flex justify-center" aria-label="Pagination">
          <Link
            href={nextHref}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-semibold"
          >
            More liked →
          </Link>
        </nav>
      )}
    </div>
  );
}
