import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { FeedViewer } from "@/components/FeedViewer";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  // TikTok-style: videos first (trending). Photos still included if few videos.
  const videos = await getPhotos({ sort: "trending", type: "video", limit: 30 });
  const items =
    videos.items.length >= 5
      ? videos.items
      : (await getPhotos({ sort: "trending", limit: 40 })).items;

  return <FeedViewer initial={items} preferVideo />;
}
