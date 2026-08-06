# LumenGallery Platform V2

## Goal
Adult content platform (photos + videos) that beats competitors on UX, speed, and discovery — without breaking the existing bot → B2 → MariaDB pipeline.

## Stack
- Next.js App Router + Tailwind
- MariaDB + Redis
- Media: Backblaze B2 (primary), served via nginx private proxy
- Nginx edge on VPS

## Database (existing + 006)

### Existing
- `users`, `sessions`, `creators`, `photos`, `photo_tags`
- `likes`, `follows`, `saves`, `bot_ingested`

### New (006-platform-features.sql)
- `creators.cover_url`
- `photos.is_ai`, `file_size`, `source_id`, `preview_url`, indexes
- `collections` + `collection_items`
- `subscriptions` + `users.is_premium`
- `reports`
- `media_views`

## Frontend architecture

```
src/
  app/
    page.tsx                    # Home masonry feed
    feed/page.tsx               # TikTok vertical feed
    creator/[handle]/page.tsx  # Creator profile
    [handle]/[id]/page.tsx     # Media detail + player
    recherche/page.tsx          # Search + filters
    tag/[tag]/page.tsx          # Tag pages
    premium/page.tsx            # Paywall
    api/...
  components/
    InfiniteGallery.tsx         # Masonry + infinite scroll
    PhotoCard.tsx               # Card + hover video preview
    VideoPlayer.tsx             # Full player
    TikTokFeed.tsx              # Vertical snap feed
    CreatorHeader.tsx           # Cover + avatar + follow
    SearchFilters.tsx
    AdSlot.tsx                  # Header + every 15 items
  lib/
    providers/mariadb.ts
    photos.ts
    redis.ts                    # cache helpers
```

## API routes (REST)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/photos` | Feed (sort, type, ai, tag, q, cursor) |
| GET | `/api/photos/[id]` | Single media |
| GET | `/api/creators/[handle]` | Creator + stats |
| GET | `/api/search` | Full-text-ish search |
| POST | `/api/likes` | Toggle like |
| POST | `/api/follows` | Toggle follow |
| POST | `/api/saves` | Toggle save |
| POST | `/api/collections` | CRUD collections |
| POST | `/api/reports` | DMCA / report |
| POST | `/api/views` | Increment view |
| GET | `/api/premium/status` | Premium flag |

## Redis keys

```
feed:{sort}:{type}:{ai}:{tag}:p{cursor}   TTL 60s
creator:{handle}                          TTL 120s
counts:photos                             TTL 30s
trending:handles                          TTL 300s
```

## Media URLs
All public media paths stay `/media/...` → nginx → B2 private proxy (or MinIO legacy empty).

## Rollout
1. Apply `migrations/006-platform-features.sql` on VPS
2. Ship UI components incrementally (home → creator → player → tiktok feed)
3. Wire ads + premium last
