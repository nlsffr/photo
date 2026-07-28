import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { FeedViewer } from "@/components/FeedViewer";

export const metadata: Metadata = { title: "Feed" };

// Never cache an empty snapshot from docker build (no DB at build time).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FeedPage() {
  const videos = await getPhotos({
    sort: "trending",
    type: "video",
    limit: 40,
  });

  let items = videos.items;
  if (items.length < 3) {
    const all = await getPhotos({ sort: "trending", limit: 40 });
    items = all.items;
  }
  if (items.length < 3) {
    const popular = await getPhotos({ sort: "popular", limit: 40 });
    items = popular.items;
  }

  return (
    <FeedViewer
      initial={items}
      preferVideo={videos.total >= 5}
    />
  );
}
