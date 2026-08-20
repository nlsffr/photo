import { permanentRedirect } from "next/navigation";
import { creatorHref } from "@/lib/types";

/** Legacy /creator/{handle} → /{handle} (301). */
export default async function CreatorLegacyRedirect({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  permanentRedirect(creatorHref(handle));
}
