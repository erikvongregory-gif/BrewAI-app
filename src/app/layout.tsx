import type { Metadata } from "next";
import { headers } from "next/headers";
import { SITE } from "@/lib/siteConfig";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { nonceFromRequest } from "@/lib/security/contentSecurityPolicy";
import { ThemeBootScript } from "@/scripts/admin/theme-boot";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.baseUrl),
  title: {
    default: SITE.defaultTitle,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.defaultDescription,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.baseUrl,
    siteName: SITE.name,
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    images: [
      {
        url: SITE.ogImage,
        width: 1200,
        height: 630,
        alt: SITE.ogImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    images: [SITE.ogImage],
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=20260928", sizes: "any" },
      { url: "/icon.svg?v=20260928", type: "image/svg+xml" },
      { url: "/icon.png?v=20260928", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico?v=20260928"],
    apple: [{ url: "/icon.png?v=20260928", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width" as const,
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerList = await headers();
  const nonce = nonceFromRequest({ headers: headerList });
  const { theme_mode, theme_preset, content_layout, navbar_style, sidebar_variant, sidebar_collapsible, font } =
    PREFERENCE_DEFAULTS;
  return (
    <html
      lang="de"
      className={fontVars}
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <head>
        <ThemeBootScript nonce={nonce} />
      </head>
      <body className="min-h-[100dvh] bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
