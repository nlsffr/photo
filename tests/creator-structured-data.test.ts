import assert from "node:assert/strict";
import test from "node:test";
import type { Creator, Photo, CreatorCollectionStats } from "../src/lib/types";
// @ts-expect-error Native Node requires explicit suffixes.
import { buildCreatorStructuredData } from "../src/lib/creator-structured-data.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Schema = {
  "@type": string;
  url: string;
  name: string;
  inLanguage: string;
  mainEntity: { "@id": string };
  alternateName: string[];
  image: string;
  interactionStatistic: { userInteractionCount: number };
  hasPart: Schema[];
  numberOfItems: number;
  itemListElement: Array<{ position: number; item: Schema }>;
};
type Input = { creator: Creator; stats: CreatorCollectionStats; items: readonly Photo[]; collection: "overview" | "photos" | "videos" | "popular"; locale?: "en" | "fr"; page?: number; site: string };
const creator: Creator = { handle: "aria-lune", name: "Aria Lune", bio: "A creator", avatarUrl: "/avatar.jpg", location: "", followers: 45, verified: true, urlVersion: 3 };
const stats: CreatorCollectionStats = { mediaCount: 99, photoCount: 80, videoCount: 19, engagedCount: 10, totalViews: 1000, totalLikes: 20 };
function media(id: string, type: Photo["type"] = "photo"): Photo {
  return { id, sourceId: String(100 + Number(id)), creatorHandle: "aria-lune", title: `Title ${id}`, type, imageUrl: "/photo.jpg", videoUrl: "/video.mp4", createdAt: "2026-10-01T00:00:00Z", urlVersion: 2, width: 100, height: 100, tags: [], views: 1, likes: 0, ageMinutes: 0, trending: 0 };
}
function build(overrides: Partial<Input> = {}): Schema[] {
  return buildCreatorStructuredData({ creator, stats, items: [media("1")], collection: "overview", site: "https://example.test", ...overrides }) as unknown as Schema[];
}

test("overview has ProfilePage and a verified Person at the exact versioned localized URL", () => {
  const data = build({ locale: "fr", page: 2 });
  const profile = data.find((node) => node["@type"] === "ProfilePage")!;
  const person = data.find((node) => node["@type"] === "Person")!;
  assert.equal(profile.url, "https://example.test/fr/aria-lune-v3?page=2");
  assert.equal(profile.inLanguage, "fr");
  assert.deepEqual(profile.mainEntity, { "@id": "https://example.test/fr/aria-lune-v3#person" });
  assert.equal(person.url, "https://example.test/fr/aria-lune-v3");
  assert.deepEqual(person.alternateName, ["aria-lune", "Aria Lune"]);
  assert.equal(person.image, "https://example.test/avatar.jpg");
  assert.equal(person.interactionStatistic.userInteractionCount, 45);
  assert.equal(profile.hasPart[0].url, "https://example.test/aria-lune/101-v2");
  assert.equal(profile.hasPart[0]["@type"], "ImageObject");
});

test("all collections list at most twelve loaded public entries in order with positions 1 through 12", () => {
  const items = Array.from({ length: 15 }, (_, index) => media(String(index + 1), index === 1 ? "video" : "photo"));
  items[0].removedFromIndexAt = "2026-10-29";
  assert.equal(build({ items })[0].hasPart.length, 12);
  for (const collection of ["photos", "videos", "popular"] as const) {
    const data = build({ collection, items, locale: "en", page: 2 });
    const page = data.find((node) => node["@type"] === "CollectionPage")!;
    const list = data.find((node) => node["@type"] === "ItemList")!;
    assert.equal(page.url, `https://example.test/en/aria-lune-v3/${collection}?page=2`);
    assert.equal(page.inLanguage, "en");
    assert.deepEqual(page.mainEntity, { "@id": `${page.url}#items` });
    assert.equal(list.numberOfItems, 12);
    assert.deepEqual(list.itemListElement.map((entry) => entry.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.deepEqual(list.itemListElement.map((entry) => entry.item.url), [
      "https://example.test/aria-lune/102-v2", "https://example.test/aria-lune/103-v2", "https://example.test/aria-lune/104-v2", "https://example.test/aria-lune/105-v2", "https://example.test/aria-lune/106-v2", "https://example.test/aria-lune/107-v2", "https://example.test/aria-lune/108-v2", "https://example.test/aria-lune/109-v2", "https://example.test/aria-lune/110-v2", "https://example.test/aria-lune/111-v2", "https://example.test/aria-lune/112-v2", "https://example.test/aria-lune/113-v2",
    ]);
    assert.deepEqual(page.hasPart, list.itemListElement.map((entry) => entry.item));
    assert.equal(page.hasPart[0]["@type"], "VideoObject");
    assert.equal(page.hasPart[1]["@type"], "ImageObject");
  }
});

test("removed loaded items disappear on the next build and inputs are not mutated", () => {
  const items = [media("1"), media("2")];
  const before = JSON.stringify(items);
  assert.equal(build({ items })[0].hasPart.length, 2);
  assert.equal(JSON.stringify(items), before);
  items[0].removedFromIndexAt = "2026-10-29";
  assert.deepEqual(build({ items })[0].hasPart.map((item: Schema) => item.url), ["https://example.test/aria-lune/102-v2"]);
  assert.deepEqual(build({ creator: { ...creator, removedFromIndexAt: "2026-10-29" }, items }), []);
});

test("phase-one aliases contain only handle and display name and hostile text survives safe JsonLd serialization", () => {
  const title = '</script><script>alert("x")</script> & < hostile';
  const data = build({ creator: { ...creator, name: title }, items: [{ ...media("1"), title }] });
  const person = data.find((node) => node["@type"] === "Person")!;
  assert.deepEqual(person.alternateName, ["aria-lune", title]);
  const { JsonLd } = loadAppModule<{ JsonLd: (props: { data: Schema[] }) => { props: { dangerouslySetInnerHTML: { __html: string } } } }>("src/components/JsonLd.tsx");
  const serialized = JsonLd({ data }).props.dangerouslySetInnerHTML.__html;
  assert.equal(serialized.includes("<"), false);
  assert.deepEqual(JSON.parse(serialized), data);
  assert.equal(JSON.parse(serialized)[0].hasPart[0].name, 'alert("x") & < hostile');
  assert.equal(JSON.parse(serialized).find((node: Schema) => node["@type"] === "Person").name, title);
  assert.deepEqual(build({ creator: { ...creator, name: " ARIA-LUNE " } }).find((node) => node["@type"] === "Person")!.alternateName, ["aria-lune"]);
  assert.equal(build()[0].url, "https://example.test/aria-lune-v3");
  assert.equal(build()[0].inLanguage, "en");
});


test("every loaded item removal is honored without generating replacement entries", () => {
  const items = [media("1"), media("2"), media("3")];
  for (const item of items) {
    item.removedFromIndexAt = "2026-10-29";
    const urls = build({ collection: "photos", items }).find((node) => node["@type"] === "ItemList")!.itemListElement.map((entry) => entry.item.url);
    assert.equal(urls.length, 2);
    assert.equal(urls.includes(`https://example.test/aria-lune/${item.sourceId}-v2`), false);
    delete item.removedFromIndexAt;
  }
});
