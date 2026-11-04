/** Exact origins found in this account's generated tag, SDKs and authorized live observation.
 * No tag executes unless AdsProvider authorizes it. Unknown creative origins stay blocked.
 */
const CONNECT_ORIGINS = ["https://tsyndicate.com", "https://fozekikikiminu.com", "https://cdn.fozekikikiminu.com", "https://cdn.tsyndicate.com", "https://pxl.tsyndicate.com", "https://pxl.fozekikikiminu.com", "https://jssdk.fozekikikiminu.com", "https://jssdk.tsyndicate.com", "https://jssdk.juneworewyjyna.com", "https://m.fozekikikiminu.com",
  // Slider SDK follow-up XHR after this site's VAST response (live CSP observation).
  "https://go.gasipedibexide.com"] as const;
export const ADS_CSP = {
  script: ["https://cdn.fozekikikiminu.com", "https://cdn.tsyndicate.com", "https://jssdk.fozekikikiminu.com", "https://jssdk.tsyndicate.com", "https://jssdk.juneworewyjyna.com"],
  style: ["https://cdn.fozekikikiminu.com", "https://cdn.tsyndicate.com"],
  connect: CONNECT_ORIGINS,
  // NativeAdPreview's API and observed HLS requests are child-document connections only.
  embedConnect: [...CONNECT_ORIGINS, "https://go.lanitesasexige.com", "https://edge-hls.saawsedge.com"],
  image: ["https://pxl.tsyndicate.com", "https://pxl-eu.tsyndicate.com", "https://pxl.fozekikikiminu.com", "https://m.fozekikikiminu.com", "https://tsyndicate.com", "https://static-ah.xhcdn.com", "https://go.gasipedibexide.com", "https://static-proxy.strpst.com"],
  media: ["https://cdn.tsyndicate.com", "https://static-ah.xhcdn.com", "https://tsvideo.sacdnssedge.com"],
  frame: ["https://tsyndicate.com", "https://jssdk.fozekikikiminu.com"],
} as const;
