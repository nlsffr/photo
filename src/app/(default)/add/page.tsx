"use client";

import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import { useSession } from "@/components/Session";
import { localePath } from "@/lib/i18n/config";

export default function AddMediaPage() {
  const { locale, t } = useLocale();
  const { user, loading } = useSession();

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-black tracking-tight">{t("addMedia.title")}</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        {locale === "fr"
          ? "L’envoi de médias est indisponible. Aucun fichier ne peut être transmis depuis cette page."
          : "Media uploads are unavailable. No files can be submitted from this page."}
      </p>
      {!loading && !user && (
        <Link
          href={`${localePath(locale, "/connexion")}?next=${encodeURIComponent(localePath(locale, "/add"))}`}
          className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-bold text-white"
        >
          {t("addMedia.login")}
        </Link>
      )}
    </div>
  );
}
