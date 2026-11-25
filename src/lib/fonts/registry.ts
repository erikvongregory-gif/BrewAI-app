import {
  DM_Sans,
  Figtree,
  Geist,
  Geist_Mono,
  Inter,
  JetBrains_Mono,
  Lora,
  Merriweather,
  Noto_Sans,
  Noto_Serif,
  Nunito_Sans,
  Outfit,
  Playfair_Display,
  Public_Sans,
  Raleway,
  Roboto,
  Roboto_Slab,
} from "next/font/google";

import { GeistPixelSquare } from "geist/font/pixel";

import { FONT_META, type FontKey } from "./font-meta";

/** Eine Inter-Instanz — doppelte next/font-Calls brechen Turbopack-Builds. */
export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const raleway = Raleway({
  subsets: ["latin"],
  variable: "--font-raleway",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-noto-serif",
});

const robotoSlab = Roboto_Slab({
  subsets: ["latin"],
  variable: "--font-roboto-slab",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  // Variable font (wght/opsz/wdth) — feste weight-Arrays brechen Turbopack-Font-Queries.
  variable: "--font-merriweather",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
});

/** Eine Playfair-Instanz (--font-serif); Preference playfairDisplay mappt darauf. */
export const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-serif",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const fontsByKey = {
  geist,
  inter,
  notoSans,
  nunitoSans,
  figtree,
  roboto,
  raleway,
  dmSans,
  publicSans,
  outfit,
  geistMono,
  geistPixelSquare: GeistPixelSquare,
  jetBrainsMono,
  notoSerif,
  robotoSlab,
  merriweather,
  lora,
  playfairDisplay: playfair,
} as const satisfies Record<FontKey, { variable: string }>;

export const fontRegistry = Object.fromEntries(
  (Object.keys(FONT_META) as FontKey[]).map((key) => [
    key,
    { label: FONT_META[key].label, font: fontsByKey[key] },
  ]),
) as {
  [K in FontKey]: { label: (typeof FONT_META)[K]["label"]; font: (typeof fontsByKey)[K] };
};

export type { FontKey } from "./font-meta";
export { fontKeys, fontOptions } from "./font-meta";

export const fontVars = (Object.keys(FONT_META) as FontKey[])
  .map((key) => fontsByKey[key].variable)
  .join(" ");
