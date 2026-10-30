import { notFound, permanentRedirect } from "next/navigation";
import { getPhotoByIdForPage } from "@/lib/photos";
import { mediaHref } from "@/lib/types";

/** Legacy URL /photo/{id} → canonical /{handle}/{sourceId|id} */
export default async function LegacyPhotoRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const photo = await getPhotoByIdForPage(id);
  if (!photo) notFound();
  permanentRedirect(mediaHref(photo));
}
