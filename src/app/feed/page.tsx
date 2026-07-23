import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { FeedViewer } from "@/components/FeedViewer";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  const page = await getPhotos({ sort: "trending", limit: 40 });
  return <FeedViewer items={page.items} />;
}
