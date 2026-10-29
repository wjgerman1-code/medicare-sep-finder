import type { NextConfig } from "next";

/** Production portal domain (see docs/DOMAIN_SETUP.md). */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://portal.gracenguard.com";
const portalHost = new URL(siteUrl).host;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // server actions (form saves) accept the portal domain as an origin
    serverActions: { allowedOrigins: [portalHost] },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
