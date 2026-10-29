import type { MediaType } from "./types";

const MAX_VIDEO_DESCRIPTION = 2_048;
const MAX_MEDIA_NAME = 160;

export type MediaSeoInput = {
  id: string;
  sourceId?: string;
  creatorHandle: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  type: MediaType;
  createdAt?: string | null;
  durationSec?: number | null;
  views?: number | null;
};

export type MediaStructuredData = {
  "@context": "https://schema.org";
  "@type": "VideoObject" | "ImageObject";
  name: string;
  description: string;
  thumbnailUrl?: string;
  contentUrl?: string;
  uploadDate?: string;
  datePublished?: string;
  duration?: string;
  interactionStatistic?: {
    "@type": "InteractionCounter";
    interactionType: { "@type": "WatchAction" };
    userInteractionCount: number;
  };
  author?: {
    "@type": "Person";
    name: string;
    alternateName: string;
    url?: string;
    image?: string;
  };
  publisher?: {
    "@type": "Organization";
    name: "LeakFanHub";
    url: string;
  };
};

export type MediaSeo = {
  name: string;
  h1: string;
  pageTitle: string;
  description: string;
  uploadDate?: string;
  thumbnailUrl?: string;
  contentUrl?: string;
  structuredData?: MediaStructuredData;
};

export type MediaPageContext = {
  site: string;
  canonicalPath: string;
  creatorName?: string | null;
  creatorPath?: string | null;
  creatorAvatarUrl?: string | null;
};

export type MediaPageMetadata = {
  title: { absolute: string };
  description: string;
  alternates: { canonical: string };
  robots: {
    index: true;
    follow: true;
    "max-image-preview": "large";
    "max-video-preview": -1;
  };
  openGraph: {
    type: "video.other" | "article";
    title: string;
    description: string;
    url: string;
    siteName: "LeakFanHub";
    images: Array<{ url: string }>;
  };
  twitter: {
    card: "summary_large_image";
    title: string;
    description: string;
    images?: string[];
  };
};

export type MediaPagePresentation = MediaSeo & {
  metadata: MediaPageMetadata;
  mediaLd?: MediaStructuredData;
};

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bounded(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1).trimEnd();
  return `${cut}…`;
}

function mediaKind(type: MediaType): string {
  if (type === "video") return "video";
  if (type === "pack") return "gallery";
  return "photo";
}

function validIsoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

export function absoluteHttpUrl(
  value: string | null | undefined,
  site: string,
): string | undefined {
  if (!value) return undefined;
  try {
    const base = new URL(site);
    if (base.protocol !== "http:" && base.protocol !== "https:") return undefined;
    const resolved = new URL(value, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return undefined;
    }
    return resolved.toString();
  } catch {
    return undefined;
  }
}

export function durationIso(seconds: number | null | undefined): string | undefined {
  if (!Number.isFinite(seconds) || Number(seconds) <= 0) return undefined;
  const total = Math.round(Number(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = total % 60;
  const hoursPart = hours > 0 ? `${hours}H` : "";
  const minutesPart = minutes > 0 ? `${minutes}M` : "";
  const secondsPart = remainder > 0 || (!hoursPart && !minutesPart) ? `${remainder}S` : "";
  return `PT${hoursPart}${minutesPart}${secondsPart}`;
}

export function buildMediaSeo(media: MediaSeoInput, site: string): MediaSeo {
  const publicId = media.sourceId?.trim() || media.id;
  const fallback = `${media.creatorHandle} ${mediaKind(media.type)} #${publicId}`;
  const name = bounded(plainText(media.title) || fallback, MAX_MEDIA_NAME);
  const sourceDescription = plainText(media.description);
  const fallbackDescription = `${mediaKind(media.type)[0]?.toUpperCase()}${mediaKind(media.type).slice(1)} by @${media.creatorHandle} on LeakFanHub (media ${publicId}).`;
  const description = bounded(
    sourceDescription || fallbackDescription,
    MAX_VIDEO_DESCRIPTION,
  );
  const uploadDate = validIsoDate(media.createdAt);
  const thumbnailUrl = absoluteHttpUrl(media.imageUrl, site);
  const contentUrl = absoluteHttpUrl(
    media.type === "video" ? media.videoUrl : media.imageUrl,
    site,
  );

  let structuredData: MediaStructuredData | undefined;
  if (media.type === "video") {
    if (thumbnailUrl && contentUrl && uploadDate) {
      const duration = durationIso(media.durationSec);
      const views = Number(media.views);
      structuredData = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name,
        description,
        thumbnailUrl,
        contentUrl,
        uploadDate,
        ...(duration ? { duration } : {}),
        ...(Number.isFinite(views) && views >= 0
          ? {
              interactionStatistic: {
                "@type": "InteractionCounter" as const,
                interactionType: { "@type": "WatchAction" as const },
                userInteractionCount: Math.floor(views),
              },
            }
          : {}),
      };
    }
  } else if (contentUrl) {
    structuredData = {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      name,
      description,
      contentUrl,
      thumbnailUrl: thumbnailUrl ?? contentUrl,
      ...(uploadDate ? { datePublished: uploadDate } : {}),
    };
  }

  return {
    name,
    h1: name,
    pageTitle: `${name} — LeakFanHub`,
    description,
    uploadDate,
    thumbnailUrl,
    contentUrl,
    structuredData,
  };
}

export function buildMediaPagePresentation(
  media: MediaSeoInput,
  context: MediaPageContext,
): MediaPagePresentation {
  const seo = buildMediaSeo(media, context.site);
  const canonicalUrl = absoluteHttpUrl(context.canonicalPath, context.site);
  if (!canonicalUrl) {
    throw new Error("A media page requires an HTTP(S) canonical URL");
  }
  const creatorUrl = absoluteHttpUrl(context.creatorPath, context.site);
  const creatorImage = absoluteHttpUrl(context.creatorAvatarUrl, context.site);
  const mediaLd = seo.structuredData
    ? {
        ...seo.structuredData,
        author: {
          "@type": "Person" as const,
          name: plainText(context.creatorName) || media.creatorHandle,
          alternateName: media.creatorHandle,
          ...(creatorUrl ? { url: creatorUrl } : {}),
          ...(creatorImage ? { image: creatorImage } : {}),
        },
        publisher: {
          "@type": "Organization" as const,
          name: "LeakFanHub" as const,
          url: new URL(context.site).origin,
        },
      }
    : undefined;

  return {
    ...seo,
    mediaLd,
    metadata: {
      title: { absolute: seo.pageTitle },
      description: seo.description,
      alternates: { canonical: context.canonicalPath },
      robots: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-video-preview": -1,
      },
      openGraph: {
        type: media.type === "video" ? "video.other" : "article",
        title: seo.pageTitle,
        description: seo.description,
        url: canonicalUrl,
        siteName: "LeakFanHub",
        images: seo.thumbnailUrl ? [{ url: seo.thumbnailUrl }] : [],
      },
      twitter: {
        card: "summary_large_image",
        title: seo.pageTitle,
        description: seo.description,
        ...(seo.thumbnailUrl ? { images: [seo.thumbnailUrl] } : {}),
      },
    },
  };
}
