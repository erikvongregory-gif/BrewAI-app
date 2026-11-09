import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  /* Supabase Auth benötigt Route Handler & Middleware — kein static export. */
  outputFileTracingIncludes: {
    // Alle Referenzbilder, die die Generierung per process.cwd()/assets liest — fehlt ein Ordner hier,
    // läuft die Live-App still ohne diese Referenzen (Look, Glas, Flasche, Trübung).
    "/api/inhalte-erstellen/*": [
      "./assets/campaign-references/**/*",
      "./assets/premium-references/**/*",
      "./assets/reportage-references/**/*",
      "./assets/glass-references/**/*",
      "./assets/bottle-references/**/*",
      "./assets/liquid-references/**/*",
    ],
  },
  images: {
    // Private signed URLs must not outlive their expiry in the public image optimizer cache.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/sign/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), display-capture=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
