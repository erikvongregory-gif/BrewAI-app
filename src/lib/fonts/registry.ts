import { Geist, Inter, Playfair_Display } from "next/font/google";

/**
 * Nur Schriften, die CSS tatsächlich referenziert. Jeder next/font-Aufruf im Root-Layout wird auf
 * jeder Route vorgeladen, deshalb keine Template-Schriften „auf Vorrat“ (Audit A-1).
 * - Geist: `--font-sans` der Admin-Shell (`data-font="geist"`, globals.css `:root`).
 * - Inter: `body` (`--font-main`), Portale außerhalb der Shell, claude-create.css.
 * - Playfair (`--font-serif`): nur `font-display` in Fallback-Ansichten, daher nicht vorladen.
 */

/** Eine Inter-Instanz — doppelte next/font-Calls brechen Turbopack-Builds. */
export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

/** Eine Playfair-Instanz (--font-serif). */
export const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-serif",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  preload: false,
});

export type { FontKey } from "./font-meta";
export { fontKeys, fontOptions } from "./font-meta";

export const fontVars = [geist, inter, playfair].map((font) => font.variable).join(" ");
