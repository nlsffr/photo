import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { FeedViewer } from "@/components/FeedViewer";

export const metadata: Metadata = {
  title: "Feed vertical",
  description: "Scroll vertical type TikTok — vidéos en plein écran",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const aiRaw = first(sp.ai);
  const isAi = aiRaw === "1" ? true : aiRaw === "0" ? false : undefined;

  const videos = await getPhotos({
    sort: "trending",
    type: "video",
    isAi,
    limit: 40,
  });

  let items = videos.items;
  if (items.length < 3) {
    const all = await getPhotos({ sort: "trending", isAi, limit: 40 });
    items = all.items;
  }
  if (items.length < 3) {
    const popular = await getPhotos({ sort: "popular", isAi, limit: 40 });
    items = popular.items;
  }

  return <FeedViewer initial={items} preferVideo={videos.total >= 5} />;
}
