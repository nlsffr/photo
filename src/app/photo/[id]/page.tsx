import { notFound, redirect } from "next/navigation";
import { getPhotoById } from "@/lib/photos";
import { mediaHref } from "@/lib/types";

/** Legacy URL /photo/{id} → canonical /{handle}/{sourceId|id} */
export default async function LegacyPhotoRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const photo = await getPhotoById(id);
  if (!photo) notFound();
  redirect(mediaHref(photo));
}
