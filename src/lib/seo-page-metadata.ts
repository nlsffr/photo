import type { Metadata } from "next";
import type { SeoEditorEntry, SeoLocale, SeoPageKey } from "./seo-editor-contract";
import { readSeoOverride } from "./seo-editor-store";

/** Preserve every default field unless an editor has saved this page/language. */
export function applyStoredSeoMetadata(
  metadata: Metadata,
  override: Pick<SeoEditorEntry, "title" | "description"> | null,
): Metadata {
  if (!override) return metadata;
  const { title, description } = override;
  return {
    ...metadata,
    title: { absolute: title },
    description,
    openGraph: { ...metadata.openGraph, title, description },
    twitter: { ...metadata.twitter, title, description },
  };
}

export async function applySeoPageMetadata(
  metadata: Metadata,
  locale: SeoLocale,
  page: SeoPageKey,
): Promise<Metadata> {
  return applyStoredSeoMetadata(metadata, await readSeoOverride(locale, page));
}
