#!/usr/bin/env python3
"""Apply SEO scale perf patch to mariadb.ts"""
from pathlib import Path
p = Path("src/lib/providers/mariadb.ts")
t = p.read_text()
if "lim + 1" in t:
    print("already patched")
    raise SystemExit(0)
if "PLACEHOLDER" in t or len(t) < 1000:
    print("ERROR: mariadb.ts broken. Restore:")
    print("  git checkout 4da8a70046fe086969ac19fd02452b3cb24dac3f -- src/lib/providers/mariadb.ts")
    raise SystemExit(1)
old = """    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = await this.q<RowDataPacket>(
      `SELECT COUNT(*) AS n FROM photos p JOIN creators c ON c.id = p.creator_id ${whereSql}`,
      params,
    );
    const total = Number(countRows[0].n);

    const lim = Math.min(Math.max(Number(limit) || PAGE_SIZE, 1), 100);
    const off = Math.max(Number(cursor) || 0, 0);

    const rows = await this.q<RowDataPacket>(
      `SELECT ${PHOTO_SELECT}
       ${PHOTO_FROM}
       ${whereSql}
       ORDER BY ${SORT_SQL[sort]}
       LIMIT ${lim} OFFSET ${off}`,
      params,
    );

    const photoRows = rows as unknown as PhotoRow[];
    const tagsMap = await this.tagsFor(photoRows.map((r) => r.id));
    const items = photoRows.map((r) => rowToView(r, tagsMap.get(r.id) ?? []));

    const nextCursor = off + lim < total ? off + lim : null;
    return { items, nextCursor, total, seed };"""
new = """    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // limit+1 avoids COUNT(*) on every page (critical at 100k–1M+ rows)
    const lim = Math.min(Math.max(Number(limit) || PAGE_SIZE, 1), 100);
    const off = Math.max(Number(cursor) || 0, 0);

    const rows = await this.q<RowDataPacket>(
      `SELECT ${PHOTO_SELECT}
       ${PHOTO_FROM}
       ${whereSql}
       ORDER BY ${SORT_SQL[sort]}
       LIMIT ${lim + 1} OFFSET ${off}`,
      params,
    );

    const photoRowsAll = rows as unknown as PhotoRow[];
    const hasMore = photoRowsAll.length > lim;
    const photoRows = hasMore ? photoRowsAll.slice(0, lim) : photoRowsAll;
    const tagsMap = await this.tagsFor(photoRows.map((r) => r.id));
    const items = photoRows.map((r) => rowToView(r, tagsMap.get(r.id) ?? []));

    const nextCursor = hasMore ? off + lim : null;
    const total = hasMore ? off + lim + 1 : off + items.length;
    return { items, nextCursor, total, seed };"""
if old not in t:
    raise SystemExit("getPhotos block not found")
t = t.replace(old, new, 1)
old2 = '      "SELECT tag, COUNT(*) AS n FROM photo_tags GROUP BY tag ORDER BY n DESC LIMIT 40",'
new2 = """      `SELECT tag, COUNT(*) AS n
       FROM photo_tags
       GROUP BY tag
       HAVING n >= 3
       ORDER BY n DESC
       LIMIT 200`,"""
if old2 not in t:
    raise SystemExit("getTags query not found")
t = t.replace(old2, new2, 1)
p.write_text(t)
print("OK patched", p)
