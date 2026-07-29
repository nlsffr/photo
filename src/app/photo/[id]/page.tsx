import { notFound, redirect } from "next/navigation";
import { getPhotoById } from "@/lib/photos";

/** Legacy URL /photo/{id} → canonical /{handle}/{id} */
export default async function LegacyPhotoRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const photo = await getPhotoById(id);
  if (!photo) notFound();
  redirect(`/${encodeURIComponent(photo.creatorHandle)}/${encodeURIComponent(photo.id)}`);
}
