import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Native Node requires the explicit suffix.
import { loadAppModule } from "./helpers/load-app-module.ts";

const hooks = {
  ...React,
  useState: (value: unknown) => [value, () => {}],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => {},
  useCallback: (callback: unknown) => callback,
};

function renderGallery(count: number, eligible = true, premium = false) {
  const placements: string[] = [];
  const { InfiniteGallery } = loadAppModule<{
    InfiniteGallery: React.ComponentType<{
      initial: { items: { id: string }[]; nextCursor: null };
      params: { sort: string };
      premium: boolean;
    }>;
  }>("src/components/InfiniteGallery.tsx", {
    react: hooks,
    "./PhotoCard": { PhotoCard: ({ photo }: { photo: { id: string } }) => React.createElement("article", { "data-media-id": photo.id }) },
    "./AdSlot": { AdSlot: ({ placement, variant }: { placement?: string; variant?: string }) => {
      placements.push(placement ?? `legacy:${variant}`);
      return React.createElement("aside", { "data-network-ad": placement ?? "legacy" });
    } },
    "./AdsProvider": { useAds: () => ({ canServe: (placement: string) => eligible && placement === "underVideo" }) },
    "./LocaleProvider": { useLocale: () => ({ t: (key: string) => key }) },
  });
  const ids = Array.from({ length: count }, (_, index) => `media-${index + 1}`);
  const html = renderToStaticMarkup(React.createElement(InfiniteGallery, {
    initial: { items: ids.map(id => ({ id })), nextCursor: null }, params: { sort: "latest" }, premium,
  }));
  return { html, ids, placements };
}

test("gallery ads follow media 8, 24 and 40 while every media keeps its original order", () => {
  const { html, ids, placements } = renderGallery(50);
  assert.deepEqual([...html.matchAll(/data-media-id="([^"]+)"/g)].map(match => match[1]), ids);
  const adAfter: number[] = [];
  let mediaCount = 0;
  for (const match of html.matchAll(/data-media-id="([^"]+)"|data-network-ad="([^"]+)"/g)) {
    if (match[1]) mediaCount += 1;
    else adAfter.push(mediaCount);
  }
  assert.deepEqual(adAfter, [8, 24, 40]);
  assert.deepEqual(placements, ["underVideo", "underVideo", "underVideo"]);
  assert.equal((html.match(/class="col-span-full my-1"/g) ?? []).length, 3);
});

test("a closed advertising policy creates neither network slots nor empty grid rows", () => {
  const { html, ids, placements } = renderGallery(50, false);
  assert.deepEqual(placements, []);
  assert.doesNotMatch(html, /col-span-full|data-network-ad/);
  assert.deepEqual([...html.matchAll(/data-media-id="([^"]+)"/g)].map(match => match[1]), ids);
});

test("Premium galleries and galleries with fewer than eight media contain no ad row", () => {
  for (const gallery of [renderGallery(50, true, true), renderGallery(7)]) {
    assert.deepEqual(gallery.placements, []);
    assert.doesNotMatch(gallery.html, /col-span-full|data-network-ad/);
  }
});
