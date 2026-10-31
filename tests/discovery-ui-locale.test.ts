import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
import type { Dictionary } from "../src/lib/i18n/dictionaries";
import type { Locale } from "../src/lib/i18n/config";
import type { MediaType, SortKey } from "../src/lib/types";

const locales: Locale[] = ["en", "fr", "es", "de", "it", "pt", "nl"];
const item = {
  id: "media-1", title: "Source-authored title", type: "video", videoUrl: "/clip.mp4",
  imageUrl: "/preview.jpg", creatorHandle: "creator", likes: 4, views: 12,
  creator: { handle: "creator", name: "Creator", verified: true, avatarUrl: "" },
};
const interactions = {
  ready: true, isLiked: () => false, isSaved: () => false, isFollowing: () => false,
  toggleLike() {}, toggleSave() {}, toggleFollow() {},
};
const { DISCOVERY_COPY } = loadAppModule<{
  DISCOVERY_COPY: Record<Locale, { like: string; save: string }>;
}>("src/features/i18n/discovery-copy.ts");

function setup(locale: Locale) {
  const dictionary = loadAppModule<Record<string, Dictionary>>(
    `src/lib/i18n/dictionaries/${locale}.ts`,
  )[`${locale}Dictionary`];
  const context = {
    locale, dictionary,
    t: (key: string) => {
      let value: unknown = dictionary;
      for (const segment of key.split(".")) value = (value as Record<string, unknown>)?.[segment];
      return typeof value === "string" ? value : key;
    },
  };
  const Anchor = ({ children, href, "aria-label": label }: { children: React.ReactNode; href: string; "aria-label"?: string }) =>
    React.createElement("a", { href, "aria-label": label }, children);
  const replacements = {
    "next/link": Anchor,
    "./LocalizedLink": { LocalizedLink: Anchor },
    "./LocaleProvider": { useLocale: () => context },
    "./Interactions": {
      useInteractions: () => interactions,
      FollowPill: ({ labels }: { labels?: { follow: string } }) =>
        React.createElement("button", null, labels?.follow),
    },
    "./MediaImg": { MediaImg: () => null },
  };
  return { dictionary, replacements };
}

test("active discovery filters and the all-interests chip use the selected language", () => {
  for (const locale of locales) {
    const { dictionary, replacements } = setup(locale);
    const { HomeFilters } = loadAppModule<{ HomeFilters: React.ComponentType<Record<string, unknown>> }>(
      "src/components/HomeFilters.tsx", replacements,
    );
    for (const sort of ["discover", "recent", "trending", "popular", "liked", "longest", "random"] as SortKey[]) {
      for (const type of ["photo", "video", "pack"] as MediaType[]) {
        const html = renderToStaticMarkup(React.createElement(HomeFilters, {
          tags: ["portrait"], tag: "portrait", sort, type,
        }));
        const summary = html.match(/<span>([^<]*portrait)<\/span>/)?.[1];
        const expectedLabels = [
          sort === "discover" ? null : dictionary.home.filters[sort],
          dictionary.mediaTypes[`${type}s`],
          "portrait",
        ].filter(Boolean).join(" · ");
        assert.equal(
          summary,
          renderToStaticMarkup(React.createElement(React.Fragment, null, `${dictionary.home.filters.active} : ${expectedLabels}`)),
          `${locale}: ${sort}/${type}`,
        );
        assert.ok(html.includes(`>${dictionary.mediaTypes.all}</a>`), `${locale}: all interests`);
      }
    }
  }
});

test("feed actions, verification, follow and view labels follow the active locale", () => {
  for (const locale of locales) {
    const { dictionary, replacements } = setup(locale);
    const { FeedViewer } = loadAppModule<{ FeedViewer: React.ComponentType<Record<string, unknown>> }>(
      "src/components/FeedViewer.tsx", replacements,
    );
    const html = renderToStaticMarkup(React.createElement(FeedViewer, { initial: [item] }));
    for (const label of [dictionary.feed?.close, dictionary.feed?.unmute, dictionary.feed?.pause, dictionary.creator.verified, DISCOVERY_COPY[locale].like, DISCOVERY_COPY[locale].save]) {
      assert.ok(label && html.includes(`aria-label="${label}"`), `${locale}: missing feed label ${label}`);
    }
    assert.ok(html.includes(`>${dictionary.creator.follow.follow}</button>`), `${locale}: follow`);
    assert.ok(html.includes(`12 ${dictionary.creator.views}</span>`), `${locale}: views`);
    assert.ok(html.includes(item.title), "source-authored title must be preserved");
  }
});

test("empty feed messages are translated without replacing the source content", () => {
  for (const locale of locales) {
    const { dictionary, replacements } = setup(locale);
    const { FeedViewer } = loadAppModule<{ FeedViewer: React.ComponentType<Record<string, unknown>> }>(
      "src/components/FeedViewer.tsx", replacements,
    );
    const html = renderToStaticMarkup(React.createElement(FeedViewer, { initial: [] }));
    assert.ok(dictionary.feed?.empty && html.includes(dictionary.feed.empty), `${locale}: empty feed`);
    assert.ok(html.includes(`>${dictionary.shell.navigation.home}</a>`), `${locale}: home link`);
  }
});

test("FollowPill renders the supplied translated labels in both follow states", () => {
  for (const following of [false, true]) {
    const { FollowPill } = loadAppModule<{ FollowPill: React.ComponentType<Record<string, unknown>> }>(
      "src/components/Interactions.tsx",
      {
        react: { ...React, useContext: () => ({ ...interactions, isFollowing: () => following }) },
        "./Session": { useSession: () => ({ user: null, loading: false }) },
      },
    );
    const html = renderToStaticMarkup(React.createElement(FollowPill, {
      handle: "creator", labels: { follow: "Follow", following: "Following" },
    }));
    assert.ok(html.endsWith(`>${following ? "Following" : "Follow"}</button>`));
  }
});
