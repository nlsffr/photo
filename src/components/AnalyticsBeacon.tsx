"use client";

import { browserChoice, useAudienceChoice } from "./AudienceChoice";
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
  if (browserChoice() !== "accepted") return;
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
  const choice = useAudienceChoice();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (choice !== "accepted") { lastPageView = null; return; }
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
  }, [pathname, search, choice]);

  useEffect(() => {
    if (choice !== "accepted") return;
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
  }, [pathname, search, choice]);

  return null;
}

