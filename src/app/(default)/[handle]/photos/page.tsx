import {
  CreatorCollectionPage,
  creatorCollectionMetadata,
} from "@/features/creator/CreatorCollectionPage";
import type { CreatorSearchParams } from "@/lib/seo-policy";

export const revalidate = 180;
type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<CreatorSearchParams>;
};

export async function generateMetadata({ params, searchParams }: Props) {
  return creatorCollectionMetadata({
    handleParam: (await params).handle,
    collection: "photos",
    searchParams: await searchParams,
  });
}

export default async function Page({ params, searchParams }: Props) {
  return CreatorCollectionPage({
    handleParam: (await params).handle,
    collection: "photos",
    searchParams: await searchParams,
  });
}
