/** Exact origins found in this account's generated tag, SDKs and authorized live observation.
 * No tag executes unless AdsProvider authorizes it. Unknown creative origins stay blocked.
 */
const CONNECT_ORIGINS = ["https://tsyndicate.com", "https://fozekikikiminu.com", "https://cdn.fozekikikiminu.com", "https://cdn.tsyndicate.com", "https://pxl.tsyndicate.com", "https://pxl.fozekikikiminu.com", "https://jssdk.fozekikikiminu.com", "https://jssdk.tsyndicate.com", "https://jssdk.juneworewyjyna.com", "https://m.fozekikikiminu.com",
  // Slider SDK follow-up XHR after this site's VAST response (live CSP observation).
  "https://go.gasipedibexide.com",
  // Official generic Exo engine, static source retrieved 2026-11-04.
  "https://s.pemsrv.com"] as const;
export const ADS_CSP = {
  script: ["https://a.pemsrv.com", "https://cdn.fozekikikiminu.com", "https://cdn.tsyndicate.com", "https://jssdk.fozekikikiminu.com", "https://jssdk.tsyndicate.com", "https://jssdk.juneworewyjyna.com"],
  style: ["https://cdn.fozekikikiminu.com", "https://cdn.tsyndicate.com"],
  connect: CONNECT_ORIGINS,
  // NativeAdPreview's API and observed HLS requests are child-document connections only.
  embedConnect: [...CONNECT_ORIGINS, "https://go.lanitesasexige.com", "https://edge-hls.saawsedge.com", "https://media-hls.saawsedge.com"],
  image: ["https://z6v2p9a8.bkcdn.net", "https://pxl.tsyndicate.com", "https://pxl-eu.tsyndicate.com", "https://pxl.fozekikikiminu.com", "https://m.fozekikikiminu.com", "https://tsyndicate.com", "https://static-ah.xhcdn.com", "https://go.gasipedibexide.com", "https://static-proxy.strpst.com"],
  // Mobile slider video origin observed in both Chromium and WebKit on 4 November 2026.
  media: ["https://video.sacdnssedge.com", "https://cdn.tsyndicate.com", "https://static-ah.xhcdn.com", "https://tsvideo.sacdnssedge.com"],
  // Exact iframe origin returned by this account’s Sticky zone API (4 November 2026).
  // Global TrafficStars iframe blocked by the main policy in the authorized mobile flow.
  frame: ["https://go.gasipedibexide.com", "https://go.marzaent.com", "https://tsyndicate.com", "https://jssdk.fozekikikiminu.com"],
} as const;
