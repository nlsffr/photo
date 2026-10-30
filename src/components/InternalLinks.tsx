import Link from "next/link";
import { localizedHref, type Locale } from "@/lib/i18n/config";
import { DISCOVERY_COPY } from "@/features/i18n/discovery-copy";

const TARGETS = ["/trending-medias", "/models", "/most-liked"] as const;

export default function InternalLinks({ locale }: { locale: Locale }) {
  const copy = DISCOVERY_COPY[locale];
  const popularTags = TARGETS.map((slug, index) => ({
    name: copy.galleriesLinks[index],
    slug,
  }));

  return (
    <nav
      className="my-8 rounded-lg border border-gray-800 bg-gray-900 p-6"
      aria-label={copy.popularGalleries}
    >
      <h3 className="mb-4 text-lg font-semibold text-white">🔥 {copy.galleriesTitle}</h3>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {popularTags.map((tag) => (
          <li key={tag.slug}>
            <Link
              href={localizedHref(locale, tag.slug)}
              prefetch={false}
              className="block text-sm text-gray-400 transition-colors hover:text-white hover:underline"
            >
              ➔ {tag.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
