import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plus aimés",
  description: "Tri strict par nombre de likes — distinct de popular (vues)",
};

export default async function MostLikedPage() {
  const page = await getPhotos({ sort: "liked", limit: 30 });
  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold">Plus aimés</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        Uniquement triés par likes (pas par vues).
      </p>
      <InfiniteGallery initial={page} params={{ sort: "liked" }} />
    </div>
  );
}
