export type AnalyticsClientEventKind = "page_view" | "heartbeat";

export type AnalyticsClientEvent = {
  event: AnalyticsClientEventKind;
  path: string;
  source?: string;
  referrer?: string;
};

export type LastAnalyticsPageView = { key: string; sentAt: number };

export function shouldSendAnalyticsPageView(
  previous: LastAnalyticsPageView | null,
  key: string,
  now: number,
): boolean {
  return !previous || previous.key !== key || now - previous.sentAt > 2_000;
}

export function buildAnalyticsClientEvent(
  event: AnalyticsClientEventKind,
  pathname: string,
  search: string,
  referrer: string,
): AnalyticsClientEvent {
  const payload: AnalyticsClientEvent = { event, path: pathname || "/" };
  if (event === "page_view") {
    const source = new URLSearchParams(search).get("utm_source")?.trim();
    if (source) payload.source = source;
    if (referrer) payload.referrer = referrer;
  }
  return payload;
}

