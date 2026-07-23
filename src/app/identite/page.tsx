import type { Metadata } from "next";
import { IdentityManager } from "@/components/IdentityManager";

export const metadata: Metadata = { title: "Identité anonyme" };

export default function IdentityPage() {
  return (
    <div className="mx-auto max-w-2xl px-3 py-6 sm:px-5">
      <h1 className="text-2xl font-bold tracking-tight">Identité anonyme</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-ink-muted)]">
        Pas d’email, pas de mot de passe, pas de compte central. Ton identité
        est une clé générée sur ton appareil — impossible à relier à toi.
      </p>
      <IdentityManager />
    </div>
  );
}
