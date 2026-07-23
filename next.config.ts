import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const cdnHostname = process.env.CDN_HOSTNAME;
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy — locks the page down to same-origin only (plus the
// CDN host for media). No third-party scripts, frames, or connections can run.
//
// Dev-only exception: React's development mode uses eval() for debugging
// features, so we allow 'unsafe-eval' in dev ONLY. Production React never uses
// eval(), so the prod CSP stays strict (no unsafe-eval).
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${cdnHostname ? ` https://${cdnHostname}` : ""}${process.env.DEMO_DATA === "1" ? " https://picsum.photos https://fastly.picsum.photos https://i.pravatar.cc" : ""}`,
  `media-src 'self' blob:${cdnHostname ? ` https://${cdnHostname}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: http:" : ""}`,
  // Only force HTTPS in production. In dev the server is plain HTTP (and phones
  // reach it over http://<lan-ip>), so upgrading would break CSS/JS loading.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  // Never send the URL we came from to any destination — kills referrer tracking.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Deny access to sensitive browser features by default.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  },
  // Cross-origin isolation hardening.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // HSTS only in production (HTTPS). Setting it in dev would make the phone
  // remember to force HTTPS on the LAN IP and break plain-HTTP access.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  // Pin the workspace root — the home dir contains an unrelated package-lock.json
  // that Next would otherwise infer as the root.
  turbopack: { root: projectRoot },
  // Allow accessing the dev server (HMR/hydration resources) from phones on the
  // same Wi-Fi via the machine's LAN IP. Dev-only convenience; has no effect in
  // production. Covers the common 192.168.x.x / 10.x / 172.16-31.x ranges.
  allowedDevOrigins: [
    "192.168.1.192",
    "192.168.0.0/16",
    "10.0.0.0/8",
    "172.16.0.0/12",
  ],
  // Minimal, self-contained image for Docker (copies only the required
  // node_modules subset + build output — no full node_modules in the image).
  output: "standalone",
  // Remove the "X-Powered-By: Next.js" header (don't advertise the stack).
  poweredByHeader: false,
  images: {
    // Real media is served from your own CDN — set CDN_HOSTNAME in env.
    // Demo hosts (picsum/pravatar) are allowed only when DEMO_DATA=1.
    remotePatterns: [
      ...(cdnHostname
        ? [{ protocol: "https" as const, hostname: cdnHostname }]
        : []),
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
