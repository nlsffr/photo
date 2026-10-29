# Database Schema

This document describes the database schema for LumenGallery.

## Setup

Use **MariaDB 10.6+** or **MySQL 8.0+**.

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE lumengallery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Run migrations
mysql -u root -p lumengallery < migrations/001-initial.sql
mysql -u root -p lumengallery < migrations/002-add-indexes.sql
```

## Tables

See `migrations/` directory for complete SQL.

### users
- `id` (uuid, PK)
- `email` (varchar, unique, nullable for anonymous users)
- `password_hash` (varchar, nullable for Web3 auth)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### creators
- `id` (uuid, PK)
- `user_id` (fk → users, nullable)
- `handle` (varchar, unique)
- `name` (varchar)
- `avatar_url` (varchar)
- `bio` (text)
- `location` (varchar)
- `followers_count` (int, default 0)
- `verified` (boolean, default false)
- `created_at` (timestamp)

### photos
- `id` (uuid, PK)
- `creator_id` (uuid, fk → creators)
- `title` (varchar)
- `description` (text)
- `image_url` (varchar)
- `video_url` (varchar, nullable)
- `type` (enum: 'photo', 'video')
- `duration_sec` (int, nullable for videos)
- `width` (int)
- `height` (int)
- `views_count` (int, default 0)
- `likes_count` (int, default 0)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### photo_tags
- `photo_id` (uuid, fk → photos)
- `tag` (varchar)
- PK: (photo_id, tag)

### likes
- `id` (uuid, PK)
- `user_id` (uuid, fk → users)
- `photo_id` (uuid, fk → photos)
- `created_at` (timestamp)
- Unique: (user_id, photo_id)

### follows
- `id` (uuid, PK)
- `follower_id` (uuid, fk → users)
- `creator_id` (uuid, fk → creators)
- `created_at` (timestamp)
- Unique: (follower_id, creator_id)

### saves
- `id` (uuid, PK)
- `user_id` (uuid, fk → users)
- `photo_id` (uuid, fk → photos)
- `created_at` (timestamp)
- Unique: (user_id, photo_id)

### analytics_daily_visitors
- `day` + `visitor_hash` (composite PK; one row per anonymous visitor/day)
- `page_views` (document and client-navigation views, not API/asset requests)
- `first_seen_at`, `last_seen_at`
- `first_path`, `last_path`
- `referrer_host` (hostname only; no path or query string)
- `source` (bounded campaign source label)

The visitor hash comes from a random first-party cookie and a server-side
secret. The table deliberately has no raw IP/network-address column.

### analytics_presence
- `visitor_hash` (PK)
- `last_seen_at` (indexed; online means seen in the last five minutes)
- `last_path`

Presence rows are ephemeral operational state and may be pruned after 24 hours.
They are unrelated to authentication sessions, which can remain valid for 30
days even while the user is offline.

## Indexes

See `migrations/002-add-indexes.sql` for production indexes on:
- `photos(creator_id, created_at)`
- `photo_tags(tag)`
- `likes(user_id, photo_id)`
- `follows(follower_id, creator_id)`
- etc.

## Encryption at Rest

Enable InnoDB encryption in MariaDB:

```sql
SET GLOBAL innodb_encrypt_tables=ON;
```

## Backups

Use `mysqldump` with encryption:

```bash
mysqldump --single-transaction --quick lumengallery | \
  gpg --encrypt --recipient your-key-id > backup.sql.gpg
```
