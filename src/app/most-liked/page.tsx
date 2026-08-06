import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Most liked",
  description: "Top médias par nombre de likes",
};

export default async function MostLikedPage() {
  const page = await getPhotos({ sort: "liked", limit: 30 });
  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-4 text-2xl font-bold">Most liked</h1>
      <InfiniteGallery initial={page} params={{ sort: "liked" }} />
    </div>
  );
}
