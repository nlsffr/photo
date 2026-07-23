import type { Creator, Photo } from "./types";

/**
 * Data layer — PLACEHOLDER REMOVED
 *
 * This module is now empty. Replace these exports with your real database
 * when you connect to MariaDB / PostgreSQL.
 *
 * Expected shape:
 *   - CREATORS: Creator[] (id, handle, name, avatar, bio, location, followers, verified)
 *   - PHOTOS: Photo[] (id, title, imageUrl, creatorHandle, tags, views, likes, type, videoUrl?)
 *   - ALL_TAGS: string[] (unique tags)
 *
 * See /docs/DATABASE.md for schema + migration SQL.
 */

export const CREATORS: Creator[] = [];
export const PHOTOS: Photo[] = [];
export const ALL_TAGS: string[] = [];
