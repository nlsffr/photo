import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const cdnHostname = process.env.CDN_HOSTNAME || "cdn.leakgallery.com";
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${cdnHostname} https://*.leakgallery.com`,
  `media-src 'self' blob: https://${cdnHostname} https://*.leakgallery.com`,
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: http:" : ""}`,
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

/** Immutable hashed assets — aggressive browser cache */
const staticCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=31536000, immutable",
  },
];

/** Thumbs / media — 7 days browser cache */
const mediaCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=604800, stale-while-revalidate=86400",
  },
];

const nextConfig: NextConfig = {
  turbopack: { root: projectRoot },
  allowedDevOrigins: [
    "192.168.1.192",
    "192.168.0.0/16",
    "10.0.0.0/8",
    "172.16.0.0/12",
  ],
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      { protocol: "https", hostname: cdnHostname },
      { protocol: "https", hostname: "**.leakgallery.com" },
      { protocol: "https", hostname: "cdn.leakgallery.com" },
      ...(process.env.DEMO_DATA === "1"
        ? [
            { protocol: "https" as const, hostname: "picsum.photos" },
            { protocol: "https" as const, hostname: "fastly.picsum.photos" },
            { protocol: "https" as const, hostname: "i.pravatar.cc" },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/_next/static/:path*", headers: staticCacheHeaders },
      { source: "/favicon.svg", headers: staticCacheHeaders },
      { source: "/icon", headers: mediaCacheHeaders },
      { source: "/apple-icon", headers: mediaCacheHeaders },
      { source: "/media/:path*", headers: mediaCacheHeaders },
    ];
  },
};

export default nextConfig;
