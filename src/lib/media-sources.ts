type MediaImageSources = {
  imageUrl?: string | null;
  previewUrl?: string | null;
};

/** Use only stored image assets; a video file cannot serve as its thumbnail. */
export function mediaThumbnailUrl(media: MediaImageSources): string | undefined {
  for (const candidate of [media.imageUrl, media.previewUrl]) {
    const source = candidate?.trim();
    if (!source) continue;
    try {
      const url = new URL(source, "https://media.invalid");
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const path = decodeURIComponent(url.pathname);
      if (/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i.test(path)) {
        // Stored relative paths are site-root assets, including on localized pages.
        return /^(?:https?:)?\/\//i.test(source)
          ? source
          : `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      // Invalid URLs cannot be image candidates.
    }
  }
  return undefined;
}
