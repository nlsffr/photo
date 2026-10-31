import type { Metadata } from "next";
import { MediaDetailPage, mediaDetailMetadata } from "@/features/media/MediaDetailPage";

export const revalidate = 300;

type Props = { params: Promise<{ handle: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, id } = await params;
  return mediaDetailMetadata({ handleParam: handle, idParam: id });
}

export default async function MediaByHandlePage({ params }: Props) {
  const { handle, id } = await params;
  return MediaDetailPage({ handleParam: handle, idParam: id });
}
