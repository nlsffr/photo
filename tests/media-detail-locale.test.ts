// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES as ACTIVE_LOCALES } from "../src/lib/i18n/config.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactNode } from "react";
import type { Metadata } from "next";
import type { Dictionary } from "../src/lib/i18n/dictionaries";
import type { Locale } from "../src/lib/i18n/config";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const locales: readonly Locale[] = ACTIVE_LOCALES;
const creator = { handle: "aria", name: "Aria", urlVersion: 3, verified: true, avatarUrl: "/avatar.jpg", followers: 20 };
const photo = {
  id: "db-id", sourceId: "123", title: "Original source title", description: "Original source description",
  creatorHandle: "aria", type: "photo", imageUrl: "/photo.jpg", urlVersion: 2, tags: ["portrait"],
  views: 12, likes: 3, trending: 4, ageMinutes: 300, width: 100, height: 100,
};
function nodes(tree: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
function text(tree: ReactNode): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return isValidElement<{ children?: ReactNode }>(tree) ? text(tree.props.children) : "";
}
type Props = { locale?: Locale; handleParam: string; idParam: string };
function setup(overrides: Record<string, unknown> = {}, creatorOverrides: Record<string, unknown> = {}) {
  const replacements: Record<string, unknown> = {
    "next/navigation": { notFound: () => { throw Error("NOT_FOUND"); } },
    "@/lib/photos": {
      getPhotoByIdForPage: async () => ({ ...photo, ...overrides }),
      getCreator: async () => ({ ...creator, ...creatorOverrides }),
      getRelatedPhotos: async () => [{ ...photo, creator }],
      withCreator: (item: unknown) => ({ ...item as object, creator }),
    },
    "@/components/Interactions": { FollowButton: () => null, PostActions: () => null },
  };
  for (const name of ["PhotoCard", "VerifiedBadge", "MediaImg", "VideoPlayer", "Comments", "BackLink", "FloatingBack", "RecordView", "JsonLd"]) replacements[`@/components/${name}`] = { [name]: () => null };
  try {
    return loadAppModule<{
      MediaDetailPage: (props: Props) => Promise<ReactNode>;
      mediaDetailMetadata: (props: Props) => Promise<Metadata>;
    }>(
      "src/features/media/MediaDetailPage.tsx", replacements,
    );
  } catch (error) {
    assert.fail(`shared localized media renderer unavailable: ${String(error)}`);
  }
}

test("media page UI, creator links and back controls use all twelve active locales", async () => {
  const { MediaDetailPage } = setup();
  for (const locale of locales) {
    const dictionary = loadAppModule<Record<string, Dictionary>>(`src/lib/i18n/dictionaries/${locale}.ts`)[`${locale}Dictionary`];
    const tree = await MediaDetailPage({ locale, handleParam: "aria", idParam: "123-v2" });
    const visible = text(tree);
    for (const label of [dictionary.mediaDetails?.views, dictionary.mediaDetails?.likes, dictionary.mediaDetails?.score, dictionary.mediaDetails?.viewProfile, dictionary.mediaDetails?.report]) {
      assert.ok(label && visible.includes(label), `${locale}: missing media UI ${label}`);
    }
    assert.ok(visible.includes(photo.title), `${locale}: keep the source title`);
    assert.ok(visible.includes(dictionary.mediaDetails.allMedia.replace("{handle}", "aria")));
    assert.ok(nodes(tree).some((node) => node.props.href === "/aria-v3"));
    assert.ok(nodes(tree).some((node) => node.props.fallback === (locale === "en" ? "/" : `/${locale}`) && node.props.label === dictionary.creator.back));
    const data = nodes(tree).find((node) => Array.isArray(node.props.data))?.props.data;
    assert.ok(data, `${locale}: media structured data is present`);
    const serialized = JSON.stringify(data);
    assert.ok(serialized.includes("https://leakfanhub.com/aria/123-v2"));
    assert.ok(serialized.includes("https://leakfanhub.com/aria-v3"));
    assert.ok(serialized.includes(`"item":"https://leakfanhub.com${locale === "en" ? "/" : `/${locale}`}"`));
    assert.doesNotMatch(serialized, /https:\/\/leakfanhub\.com\/(?:en|fr|es|de|it|pt|nl|ru|zh|ja|hi|th)\/aria(?:-v3|\/123-v2)/);
    const relativeAge = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-5, "hour");
    assert.ok(visible.includes(relativeAge), `${locale}: age must use its locale`);
  }
});

test("media metadata keeps the same versioned canonical and authored copy across twelve languages", async () => {
  const { mediaDetailMetadata } = setup();
  for (const locale of [...locales, undefined]) {
    const metadata = await mediaDetailMetadata({ locale, handleParam: "aria", idParam: "123-v2" });
    assert.equal(metadata.alternates?.canonical, "/aria/123-v2");
    assert.equal(metadata.alternates?.languages, undefined);
    assert.equal(new URL(String(metadata.openGraph?.url), "https://leakfanhub.com").pathname, "/aria/123-v2");
    assert.deepEqual(metadata.title, { absolute: `${photo.title} — LeakFanHub` });
    assert.equal(metadata.description, photo.description);
    assert.equal(metadata.openGraph?.locale?.slice(0, 2), locale ?? "en");
  }
});

test("localized media metadata rejects removed media and creators before exposing indexable metadata", async () => {
  for (const locale of locales) {
    const props = { locale, handleParam: "aria", idParam: "123-v2" };
    await assert.rejects(setup({ removedFromIndexAt: "2026-11-01" }).mediaDetailMetadata(props), /NOT_FOUND/);
    const removed = setup({}, { removedFromIndexAt: "2026-11-01" });
    await assert.rejects(removed.mediaDetailMetadata(props), /NOT_FOUND/);
    await assert.rejects(removed.MediaDetailPage(props), /NOT_FOUND/);
  }
});

test("localized media renderer rejects old media versions, wrong handles and hidden media", async () => {
  const { MediaDetailPage } = setup();
  for (const locale of locales) {
    await assert.rejects(MediaDetailPage({ locale, handleParam: "aria", idParam: "123" }), /NOT_FOUND/);
    await assert.rejects(MediaDetailPage({ locale, handleParam: "wrong", idParam: "123-v2" }), /NOT_FOUND/);
    await assert.rejects(setup({ removedFromIndexAt: "2026-11-01" }).MediaDetailPage({ locale, handleParam: "aria", idParam: "123-v2" }), /NOT_FOUND/);
  }
});
