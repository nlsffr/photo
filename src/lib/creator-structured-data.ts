import type { Creator, CreatorCollection, CreatorCollectionStats, Photo } from "./types";
import type { Locale } from "./i18n/config";
// @ts-expect-error Node's native type stripping requires explicit suffixes.
import { creatorCollectionCopy, creatorCollectionPath } from "./creator-collections.ts";
// @ts-expect-error Node's native type stripping requires explicit suffixes.
import { verifiedCreatorNames } from "./creator-names.ts";
// @ts-expect-error Node's native type stripping requires explicit suffixes.
import { absoluteHttpUrl, buildMediaSeo } from "./media-seo.ts";
// @ts-expect-error Node's native type stripping requires explicit suffixes.
import { isRemovedContent } from "./public-content-policy.ts";
// @ts-expect-error Node's native type stripping requires explicit suffixes.
import { mediaHref } from "./types.ts";

export type CreatorStructuredDataInput = {
  site: string;
  creator: Creator;
  stats: CreatorCollectionStats;
  /** Only the public page that has already been loaded; no item fetches. */
  items: readonly Photo[];
  collection: CreatorCollection;
  locale?: Locale;
  page?: number;
};

/** Build bounded schema data without accessing a provider or fetching media. */
export function buildCreatorStructuredData({
  site, creator, items, collection, locale, page,
}: CreatorStructuredDataInput): Record<string, unknown>[] {
  if (isRemovedContent(creator)) return [];
  const absolute = (path: string) => {
    const url = absoluteHttpUrl(path, site);
    if (!url) throw new TypeError("Creator structured data requires an HTTP(S) site URL");
    return url;
  };
  const overviewUrl = absolute(creatorCollectionPath(creator.handle, creator.urlVersion ?? 1, "overview", locale));
  const url = absolute(creatorCollectionPath(creator.handle, creator.urlVersion ?? 1, collection, locale, page));
  const copy = creatorCollectionCopy(locale ?? "en", collection, creator.name);
  const personId = `${overviewUrl}#person`;
  const image = absoluteHttpUrl(creator.avatarUrl, site);
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": personId,
    name: creator.name,
    alternateName: verifiedCreatorNames(creator.handle, creator.name),
    url: overviewUrl,
    ...(image ? { image } : {}),
    description: creator.bio || copy.description,
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/FollowAction",
      userInteractionCount: creator.followers,
    },
  };
  const hasPart = items.filter((item) => !isRemovedContent(item)).slice(0, 12).map((item) => {
    const seo = buildMediaSeo(item, site);
    return {
      ...seo.structuredData,
      "@type": item.type === "video" ? "VideoObject" : "ImageObject",
      name: seo.name,
      url: absolute(mediaHref(item)),
    };
  });
  const pageData = {
    "@context": "https://schema.org",
    "@type": collection === "overview" ? "ProfilePage" : "CollectionPage",
    "@id": `${url}#page`,
    name: copy.title,
    description: copy.description,
    url,
    inLanguage: locale ?? "en",
    about: { "@id": personId },
    mainEntity: { "@id": collection === "overview" ? personId : `${url}#items` },
    hasPart,
  };
  if (collection === "overview") return [pageData, person];
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${url}#items`,
    numberOfItems: hasPart.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: hasPart.map((item, index) => ({ "@type": "ListItem", position: index + 1, item })),
  };
  return [pageData, person, list];
}
