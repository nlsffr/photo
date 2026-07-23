import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const cdnHostname = process.env.CDN_HOSTNAME;

// Content-Security-Policy — locks the page down to same-origin only (plus the
// CDN host for media). No third-party scripts, frames, or connections can run.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Next.js needs inline styles; scripts are same-origin only.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${cdnHostname ? ` https://${cdnHostname}` : ""}`,
  `media-src 'self' blob:${cdnHostname ? ` https://${cdnHostname}` : ""}`,
  "font-src 'self'",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Never send the URL we came from to any destination — kills referrer tracking.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Force HTTPS for 2 years, including subdomains + preload list.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Deny access to sensitive browser features by default.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  },
  // Cross-origin isolation hardening.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root — the home dir contains an unrelated package-lock.json
  // that Next would otherwise infer as the root.
  turbopack: { root: projectRoot },
  // Minimal, self-contained image for Docker (copies only the required
  // node_modules subset + build output — no full node_modules in the image).
  output: "standalone",
  // Remove the "X-Powered-By: Next.js" header (don't advertise the stack).
  poweredByHeader: false,
  images: {
    // Real media is served from your own CDN — set CDN_HOSTNAME in env.
    remotePatterns: cdnHostname
      ? [{ protocol: "https", hostname: cdnHostname }]
      : [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
