#!/usr/bin/env python3
"""Apply LeakGallery-style SEO titles on creator + media pages."""
from pathlib import Path

def patch_creator(p: Path):
    t = p.read_text()
    if "creatorSeoTitle" in t:
        print("creator already patched")
        return
    t = t.replace(
        'import { JsonLd } from "@/components/JsonLd";',
        'import { JsonLd } from "@/components/JsonLd";\nimport {\n  buildAliasList,\n  creatorSeoDescription,\n  creatorSeoTitle,\n} from "@/lib/seo-aliases";',
        1,
    )
    old = """  const title = `${creator.name} (@${creator.handle}) — photos & videos`;
  const rawDesc =
    creator.bio?.slice(0, 140) ||
    `Browse free ${creator.handle} photos and videos on LeakFanHub. ${creator.name} (@${creator.handle}) — updated regularly. 18+ only.`;
  const description = rawDesc.length > 160 ? `${rawDesc.slice(0, 157)}...` : rawDesc;"""
    new = """  const aliases = buildAliasList(creator.handle, creator.name);
  const title = creatorSeoTitle(creator.handle, creator.name, aliases);
  const description = creatorSeoDescription(creator.handle, creator.name);"""
    if old not in t:
        raise SystemExit("creator meta block missing")
    t = t.replace(old, new, 1)
    old_kw = """    keywords: [
      creator.handle,
      `${creator.handle} photos`,
      `${creator.handle} videos`,
      creator.name,
      "LeakFanHub",
    ],"""
    new_kw = """    keywords: [
      creator.handle,
      creator.name,
      ...aliases.slice(0, 8),
      `${creator.handle} OnlyFans`,
      `${creator.handle} OnlyFans leaks`,
      "OnlyFans leaks",
      "LeakFanHub",
    ],"""
    t = t.replace(old_kw, new_kw, 1)
    t = t.replace(
        "alternateName: creator.handle,",
        "alternateName: [creator.handle, ...buildAliasList(creator.handle, creator.name)],",
        1,
    )
    p.write_text(t)
    print("OK creator")

def patch_media(p: Path):
    t = p.read_text()
    if "mediaSeoTitle" in t:
        print("media already patched")
        return
    t = t.replace(
        'import { BackLink } from "@/components/BackLink";',
        'import { BackLink } from "@/components/BackLink";\nimport {\n  buildAliasList,\n  mediaSeoDescription,\n  mediaSeoTitle,\n} from "@/lib/seo-aliases";',
        1,
    )
    old = """  const h = photo.creatorHandle;
  const kind =
    photo.type === "video" ? "video" : photo.type === "pack" ? "pack" : "photo";
  const sid = photo.sourceId || id;
  const title = `@${h} — ${kind} #${sid}`;
  const description = `${h} ${kind} on LeakFanHub. ${formatCount(photo.views)} views · more from @${h}. 18+ only.`;"""
    new = """  const h = photo.creatorHandle;
  const creatorMeta = await getCreator(h);
  const displayName = creatorMeta?.name || h;
  const aliasesMeta = buildAliasList(h, displayName);
  const sid = photo.sourceId || id;
  const title = mediaSeoTitle(h, displayName, aliasesMeta, String(sid));
  const description = mediaSeoDescription(title);"""
    if old not in t:
        raise SystemExit("media meta block missing")
    t = t.replace(old, new, 1)
    old_h1 = """  const h1 = `@${photo.creatorHandle} — ${kind} #${sid}`;
  const creatorPath = `/creator/${encodeURIComponent(photo.creatorHandle)}`;"""
    new_h1 = """  const aliases = buildAliasList(photo.creatorHandle, creator?.name || photo.creatorHandle);
  const h1 = mediaSeoTitle(
    photo.creatorHandle,
    creator?.name || photo.creatorHandle,
    aliases,
    String(sid),
  );
  const creatorPath = `/creator/${encodeURIComponent(photo.creatorHandle)}`;"""
    if old_h1 not in t:
        raise SystemExit("media h1 block missing")
    t = t.replace(old_h1, new_h1, 1)
    t = t.replace(
        "description: `${photo.creatorHandle} video on LeakFanHub`,",
        "description: h1,",
        1,
    )
    t = t.replace(
        "description: `${photo.creatorHandle} photo on LeakFanHub`,",
        "description: h1,",
        1,
    )
    p.write_text(t)
    print("OK media")

root = Path(__file__).resolve().parents[1]
patch_creator(root / "src/app/creator/[handle]/page.tsx")
patch_media(root / "src/app/[handle]/[id]/page.tsx")
