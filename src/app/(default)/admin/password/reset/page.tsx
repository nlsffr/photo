import type { Metadata } from "next";
import { AdminPasswordReset } from "@/components/AdminPasswordReset";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title:"Réinitialiser mon accès privé",
  robots:{index:false,follow:false},
  referrer:"no-referrer",
};

export default function AdminPasswordResetPage() {
  return <AdminPasswordReset />;
}
