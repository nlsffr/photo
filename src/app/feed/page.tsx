import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { FeedViewer } from "@/components/FeedViewer";

export const metadata: Metadata = {
  title: "Feed vertical",
  description: "Scroll vertical — vidéos en plein écran, ordre unique chaque jour",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Seed change every day → feed order ≠ home popular order */
function daySeed() {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const aiRaw = first(sp.ai);
  const isAi = aiRaw === "1" ? true : aiRaw === "0" ? false : undefined;
  const seed = daySeed();

  // Feed = vidéos only, ordre random stable du jour (≠ home popular / ≠ trending)
  let page = await getPhotos({
    sort: "random",
    type: "video",
    isAi,
    seed,
    limit: 40,
  });

  if (page.items.length < 5) {
    page = await getPhotos({ sort: "random", isAi, seed: seed + 7, limit: 40 });
  }
  if (page.items.length < 3) {
    page = await getPhotos({ sort: "recent", type: "video", isAi, limit: 40 });
  }

  return <FeedViewer initial={page.items} preferVideo />;
}
