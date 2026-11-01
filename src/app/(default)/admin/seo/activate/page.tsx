import type { Metadata } from "next";
import { SeoEditorActivation } from "@/components/SeoEditorActivation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Activer l’éditeur privé",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SeoActivationPage() {
  return <SeoEditorActivation />;
}
