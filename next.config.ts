import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Listing photos are served from external object storage — never from the
     * local filesystem — so the app stays serverless-safe. Only these hosts are
     * allowed, which prevents the image optimiser being used as an open proxy.
     */
    remotePatterns: [
      // Cloudinary: where uploads through /api/uploads land.
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Unsplash CDN: used by the demo seed data only.
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Surfaces accidental double-render and effect bugs during development.
  reactStrictMode: true,

  // The framework version is not useful to a client and only aids fingerprinting.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
