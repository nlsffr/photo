import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdsEditorUser } from "@/lib/ads-access";
import { AdsEditor } from "@/components/AdsEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title:"Publicités", robots:{index:false,follow:false}, referrer:"no-referrer" };

export default async function AdsAdminPage() {
  if (!await getAdsEditorUser()) notFound();
  return <AdsEditor />;
}
