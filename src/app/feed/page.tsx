import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { FeedViewer } from "@/components/FeedViewer";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  // 1) Prefer videos (TikTok style)
  const videos = await getPhotos({
    sort: "trending",
    type: "video",
    limit: 40,
  });

  // 2) If almost no videos yet, mix all media so feed is never blank while bot runs
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
