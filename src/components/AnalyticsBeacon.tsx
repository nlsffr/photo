"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildAnalyticsClientEvent,
  shouldSendAnalyticsPageView,
  type AnalyticsClientEvent,
  type LastAnalyticsPageView,
} from "@/lib/analytics-client";

let lastPageView: LastAnalyticsPageView | null = null;

function transmit(event: AnalyticsClientEvent) {
  const body = JSON.stringify(event);
  // JSON opts Beacon into CORS mode for compatibility with the origin check.
  if (navigator.sendBeacon?.("/api/analytics", new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}

export function AnalyticsBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const key = search ? `${pathname}?${search}` : pathname;
    const now = Date.now();
    if (!shouldSendAnalyticsPageView(lastPageView, key, now)) return;
    lastPageView = { key, sentAt: now };
    transmit(
      buildAnalyticsClientEvent(
        "page_view",
        pathname,
        search,
        document.referrer,
      ),
    );
  }, [pathname, search]);

  useEffect(() => {
    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      transmit(buildAnalyticsClientEvent("heartbeat", pathname, search, ""));
    };
    const timer = window.setInterval(heartbeat, 60_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [pathname, search]);

  return null;
}

