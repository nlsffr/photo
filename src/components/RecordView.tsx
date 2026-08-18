"use client";

import { useEffect, useRef } from "react";

/** Fire-and-forget view increment once per mount / photoId. */
export function RecordView({ photoId }: { photoId: string }) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!photoId || done.current === photoId) return;
    done.current = photoId;
    const key = `viewed:${photoId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    void fetch("/api/photos/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId }),
    }).catch(() => undefined);
  }, [photoId]);

  return null;
}
