import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { FeedViewer } from "@/components/FeedViewer";

export const metadata: Metadata = {
  title: "Feed vertical",
  description: "Scroll vertical — vidéos en plein écran, ordre unique à chaque visite",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Nouveau seed à chaque chargement de page → ordre vraiment différent */
function randomSeed() {
  return Math.floor(Math.random() * 2_147_483_647);
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const aiRaw = first(sp.ai);
  const isAi = aiRaw === "1" ? true : aiRaw === "0" ? false : undefined;
  const seed = randomSeed();

  let page = await getPhotos({
    sort: "random",
    type: "video",
    isAi,
    seed,
    limit: 40,
  });

  if (page.items.length < 5) {
    page = await getPhotos({
      sort: "random",
      isAi,
      seed: randomSeed(),
      limit: 40,
    });
  }
  if (page.items.length < 3) {
    page = await getPhotos({ sort: "recent", type: "video", isAi, limit: 40 });
  }

  return <FeedViewer initial={page.items} preferVideo />;
}
