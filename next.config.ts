import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const cdnHostname = process.env.CDN_HOSTNAME;

const nextConfig: NextConfig = {
  // Pin the workspace root — the home dir contains an unrelated package-lock.json
  // that Next would otherwise infer as the root.
  turbopack: { root: projectRoot },
  // Minimal, self-contained image for Docker (copies only the required
  // node_modules subset + build output — no full node_modules in the image).
  output: "standalone",
  images: {
    // Real media is served from your own CDN — set CDN_HOSTNAME in env.
    remotePatterns: cdnHostname
      ? [{ protocol: "https", hostname: cdnHostname }]
      : [],
  },
};

export default nextConfig;
