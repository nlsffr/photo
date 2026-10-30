import { permanentRedirect, notFound } from "next/navigation";
import { getCreator } from "@/lib/photos";
import { creatorHref } from "@/lib/types";
import { isRemovedContent } from "@/lib/public-content-policy";

/** Legacy /creator/{handle} → URL publique courante (301), suffixe compris. */
export default async function CreatorLegacyRedirect({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const creator = await getCreator(handle);
  if (!creator || isRemovedContent(creator)) notFound();
  permanentRedirect(creatorHref(creator.handle, creator.urlVersion));
}
