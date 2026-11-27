/**
 * App-Konfiguration (app.brewai.de).
 * Setze NEXT_PUBLIC_APP_BASE_URL in Vercel, z. B. https://app.brewai.de
 */
const appBaseUrl =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_BASE_URL?.trim()) || "https://app.brewai.de";

/** Öffentliche Marketing-Seite — „Zur Startseite“ im Dashboard (nicht App-Root `/`, der nach /anmelden leitet). */
export const MARKETING_SITE_URL =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim())) ||
  "https://brewai.de";

const productName =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim() || process.env.NEXT_PUBLIC_SITE_NAME?.trim())) ||
  "BrewAI";

/**
 * Shared-Cookie-Domain für Login zwischen brewai.de und app.brewai.de.
 * Preview/Localhost: undefined (Host-only). Production: Env oder Fallback brewai.de.
 */
export function getSharedCookieDomain(): string | undefined {
  // Preview/Localhost: Host-only — Domain=brewai.de würde lokalen Google-Login spoilern.
  if (process.env.NODE_ENV !== "production") return undefined;
  const configured =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim() : undefined;
  // "none": Host-only-Cookies für Produktions-Builds außerhalb von brewai.de (lokaler Prod-Test, Previews).
  if (configured === "none") return undefined;
  if (configured) return configured.replace(/^\./, "") || undefined;
  return "brewai.de";
}

/** Erlaubte Browser-Origins (Marketing + App). */
export const ALLOWED_WEB_ORIGINS = ["https://brewai.de", "https://app.brewai.de"] as const;

export const SITE = {
  name: productName,
  productName,
  baseUrl: appBaseUrl,
  marketingUrl: MARKETING_SITE_URL,
  defaultTitle: `${productName} · KI-Studio für Brauereien`,
  defaultDescription:
    "Deine Brauerei. Dein Content. Mit KI Motive erzeugen, Marke steuern und Mediathek verwalten.",
  keywords: [productName, "Dashboard", "Brauerei", "KI", "Mediathek"],
  locale: "de_DE" as const,
  ogImage: "/og/brewai-studio-v1.png",
  ogImageAlt: `${productName} Studio — Mediathek mit KI-Motiven für Brauereien`,
  contactEmail: "kontakt@brewai.de",
  googleSiteVerification: "",
} as const;
