import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the workspace root — the home dir contains an unrelated package-lock.json
  // that Next would otherwise infer as the root.
  turbopack: { root: projectRoot },
  images: {
    // Placeholder image hosts used by the demo data layer.
    // Swap these for your own CDN / storage host when you plug in real content.
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ],
  },
};

export default nextConfig;
