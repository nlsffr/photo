import type { Creator, Photo } from "./types";

/* ------------------------------------------------------------------ *
 *  Demo data layer
 *
 *  This module generates a stable, deterministic set of creators and
 *  photos so the whole UI is populated out of the box. It is 100%
 *  placeholder content:
 *    - photo imagery comes from picsum.photos (free placeholder images)
 *    - avatars come from i.pravatar.cc (free placeholder avatars)
 *
 *  Replace `CREATORS` / `PHOTOS` with reads from your real database
 *  when you plug in actual content you own the rights to.
 * ------------------------------------------------------------------ */

/** Deterministic PRNG so the dataset never reshuffles between renders. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Maya", "Léa", "Nina", "Camille", "Jade", "Sacha", "Iris", "Noémie",
  "Elsa", "Clara", "Lou", "Anaïs", "Zoé", "Alba", "Mila", "Eva",
  "Théo", "Liam", "Noah", "Enzo", "Adam", "Gabriel", "Lucas", "Milo",
  "Naomi", "Selma", "Yuki", "Aria", "Nour", "Lina", "Alice", "Rose",
];

const LAST_NAMES = [
  "Lune", "Rivière", "Costa", "Vidal", "Moreau", "Blanc", "Faure", "Renard",
  "Sato", "Okafor", "Petit", "Roy", "Meyer", "Nakamura", "Silva", "Dubois",
];

const CITIES = [
  "Paris", "Berlin", "Lisbonne", "Tokyo", "Milan", "New York", "Séoul",
  "Barcelone", "Londres", "Copenhague", "Montréal", "Marseille",
];

const TAG_POOL = [
  "portrait", "studio", "noir & blanc", "editorial", "street", "mode",
  "beauté", "lumière naturelle", "argentique", "extérieur", "couleur",
  "minimal", "cinématique", "vintage", "backstage", "voyage",
];

// Free, public sample videos (Google gtv-videos-bucket) used as placeholders
// for the "video" media type. Swap for your own hosted videos.
const SAMPLE_VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4",
];

const TITLE_HEADS = [
  "Regard", "Silhouette", "Contre-jour", "Fragment", "Reflets", "Instant",
  "Ombres", "Lumière du", "Portrait au", "Éclat", "Nuance", "Profil",
];
const TITLE_TAILS = [
  "au studio", "en terrasse", "à l’aube", "en mouvement", "sous la pluie",
  "en argentique", "en clair-obscur", "au coucher du soleil", "en ville",
  "près de la fenêtre", "sur pellicule", "en noir et blanc",
];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function buildCreators(count: number): Creator[] {
  const rng = mulberry32(1337);
  const creators: Creator[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    const name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
    let handle = name.toLowerCase().replace(/[^a-z]+/g, "-");
    while (used.has(handle)) handle = `${handle}-${i}`;
    used.add(handle);

    creators.push({
      handle,
      name,
      avatarUrl: `https://i.pravatar.cc/240?u=${handle}`,
      bio: pick(rng, [
        "Photographe portrait, obsédée par la lumière naturelle.",
        "Je capture les gens tels qu’ils sont, sans filtre.",
        "Studio & argentique. Basé entre deux villes.",
        "Direction artistique et mode. Toujours en repérage.",
        "Le noir et blanc comme langue maternelle.",
      ]),
      location: pick(rng, CITIES),
      followers: Math.floor(rng() * 480_000) + 1_200,
      verified: rng() > 0.62,
    });
  }
  return creators;
}

function buildPhotos(creators: Creator[], count: number): Photo[] {
  const rng = mulberry32(90210);
  const photos: Photo[] = [];

  for (let i = 0; i < count; i++) {
    const creator = pick(rng, creators);

    // Varied aspect ratios keep the masonry grid lively.
    const ratios: Array<[number, number]> = [
      [800, 1000], [800, 1200], [900, 900], [800, 600], [1000, 1400], [800, 1120],
    ];
    const [width, height] = pick(rng, ratios);

    // 1–3 distinct tags.
    const tagCount = 1 + Math.floor(rng() * 3);
    const tags = new Set<string>();
    while (tags.size < tagCount) tags.add(pick(rng, TAG_POOL));

    const views = Math.floor(rng() * 900_000) + 300;
    const likes = Math.floor(views * (0.02 + rng() * 0.12));
    const ageMinutes = Math.floor(rng() * 60 * 24 * 120) + 5; // up to ~120 days

    // Trending favours high engagement on recent content.
    const recencyBoost = Math.max(0, 1 - ageMinutes / (60 * 24 * 30));
    const trending = Math.round(
      Math.min(100, (likes / (views + 1)) * 240 + recencyBoost * 60 + rng() * 12),
    );

    // ~22% of items are videos.
    const isVideo = rng() < 0.22;

    photos.push({
      id: `p${(i + 1).toString().padStart(4, "0")}`,
      title: `${pick(rng, TITLE_HEADS)} ${pick(rng, TITLE_TAILS)}`,
      imageUrl: `https://picsum.photos/seed/pg-${i + 1}/${width}/${height}`,
      width,
      height,
      creatorHandle: creator.handle,
      tags: [...tags],
      views,
      likes,
      ageMinutes,
      trending,
      type: isVideo ? "video" : "photo",
      videoUrl: isVideo ? pick(rng, SAMPLE_VIDEOS) : undefined,
      durationSec: isVideo ? 8 + Math.floor(rng() * 112) : undefined,
    });
  }
  return photos;
}

export const CREATORS: Creator[] = buildCreators(36);
export const PHOTOS: Photo[] = buildPhotos(CREATORS, 320);

export const ALL_TAGS: string[] = TAG_POOL;

export const CREATOR_BY_HANDLE: Map<string, Creator> = new Map(
  CREATORS.map((c) => [c.handle, c]),
);
