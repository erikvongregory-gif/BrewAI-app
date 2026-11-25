import { GLAS_TYPEN, type GlasTyp } from "@/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge";
import type { HyperrealisticInput } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";

/**
 * Bierstil-Katalog — eine Quelle fuer Wizard (WAS_OPTIONS) und "Meine Biere".
 * Der glasTyp bestimmt das stilkorrekte Glas in der Generierung.
 */
export type BeerStyleOption = {
  label: string;
  bierstil: string;
  glasTyp: NonNullable<HyperrealisticInput["glasTyp"]>;
};

export const BEER_STYLE_OPTIONS: BeerStyleOption[] = [
  { label: "Helles", bierstil: "helles", glasTyp: "willibecher" },
  { label: "Export", bierstil: "export", glasTyp: "willibecher" },
  { label: "Pils", bierstil: "pils", glasTyp: "pils_tulpe" },
  { label: "Festbier", bierstil: "festbier", glasTyp: "masskrug" },
  { label: "Märzen", bierstil: "maerzen", glasTyp: "seidel" },
  { label: "Dunkel", bierstil: "dunkel", glasTyp: "seidel" },
  { label: "Schwarzbier", bierstil: "schwarzbier", glasTyp: "pokal" },
  { label: "Hefeweizen", bierstil: "hefeweizen", glasTyp: "weizen" },
  { label: "Kristallweizen", bierstil: "kristallweizen", glasTyp: "weizen" },
  { label: "Dunkles Weißbier", bierstil: "dunkles_weizen", glasTyp: "weizen" },
  { label: "Weizenbock", bierstil: "weizenbock", glasTyp: "weizen" },
  { label: "Kellerbier", bierstil: "kellerbier", glasTyp: "seidel" },
  { label: "Zwickel / Landbier", bierstil: "zwickel", glasTyp: "steinkrug" },
  { label: "Rauchbier", bierstil: "rauchbier", glasTyp: "seidel" },
  { label: "Bock", bierstil: "bock", glasTyp: "pokal" },
  { label: "Maibock", bierstil: "maibock", glasTyp: "pokal" },
  { label: "Doppelbock", bierstil: "doppelbock", glasTyp: "pokal" },
  { label: "Kölsch", bierstil: "koelsch", glasTyp: "stange" },
  { label: "Altbier", bierstil: "altbier", glasTyp: "stange" },
  { label: "IPA", bierstil: "ipa", glasTyp: "ipa_teku" },
  { label: "NEIPA / Hazy IPA", bierstil: "neipa", glasTyp: "ipa_teku" },
  { label: "Stout", bierstil: "stout", glasTyp: "nonic" },
  { label: "Porter", bierstil: "porter", glasTyp: "nonic" },
  { label: "Saison", bierstil: "saison", glasTyp: "ipa_teku" },
  { label: "Radler", bierstil: "radler", glasTyp: "willibecher" },
  { label: "Alkoholfrei", bierstil: "alkoholfrei_pilsner", glasTyp: "pils_tulpe" },
];

export function findBeerStyle(bierstil: string): BeerStyleOption | undefined {
  return BEER_STYLE_OPTIONS.find((option) => option.bierstil === bierstil);
}

export function beerStyleLabel(bierstil: string): string {
  return findBeerStyle(bierstil)?.label ?? bierstil;
}

// Reihenfolge zählt: spezielle Sorten vor allgemeinen (Weizenbock vor Bock und Weizen, Dunkles Weißbier vor Dunkel).
// „Alkoholfrei“ ist eine Eigenschaft, keine Sorte: „Hell Alkoholfrei“ bleibt ein Helles — nur ohne Sortenhinweis Alkoholfrei-Pils.
const NAME_STYLE_HINTS: Array<{ pattern: RegExp; bierstil: string }> = [
  { pattern: /kristallweizen/, bierstil: "kristallweizen" },
  { pattern: /weizenbock|weissbierbock|weißbierbock|aventinus/, bierstil: "weizenbock" },
  { pattern: /dunk(e)?l\w*\s*\w*(weizen|weiss|weiß)|(weizen|weiss|weiß)\w*\s*dunkel/, bierstil: "dunkles_weizen" },
  { pattern: /hefeweizen|weissbier|weißbier|weizen/, bierstil: "hefeweizen" },
  { pattern: /schwarzbier/, bierstil: "schwarzbier" },
  { pattern: /rauchbier|rauchm[aä]rzen|rauchweizen/, bierstil: "rauchbier" },
  { pattern: /maibock|heller bock/, bierstil: "maibock" },
  { pattern: /doppelbock|salvator|maximator|triumphator|celebrator|optimator|animator|delicator/, bierstil: "doppelbock" },
  { pattern: /bock/, bierstil: "bock" },
  // Radler vor Pils: „Pils-Radler“ ist ein Radler; norddeutsch „Alster(wasser)“ (Fachkorrektur Audit 05).
  { pattern: /radler|alster/, bierstil: "radler" },
  { pattern: /pils/, bierstil: "pils" },
  { pattern: /koelsch|kölsch/, bierstil: "koelsch" },
  { pattern: /altbier/, bierstil: "altbier" },
  { pattern: /oktoberfest|festbier|wiesn/, bierstil: "festbier" },
  { pattern: /maerzen|märzen/, bierstil: "maerzen" },
  { pattern: /zwickel|landbier/, bierstil: "zwickel" },
  { pattern: /kellerbier|keller/, bierstil: "kellerbier" },
  { pattern: /neipa|hazy/, bierstil: "neipa" },
  { pattern: /ipa|india pale/, bierstil: "ipa" },
  { pattern: /stout/, bierstil: "stout" },
  { pattern: /porter/, bierstil: "porter" },
  { pattern: /saison/, bierstil: "saison" },
  { pattern: /dunkel|dunkles/, bierstil: "dunkel" },
  { pattern: /export/, bierstil: "export" },
  { pattern: /hell|edelstoff|lager/, bierstil: "helles" },
  { pattern: /alkoholfrei|0[,.]0|\bzero\b/, bierstil: "alkoholfrei_pilsner" },
];

export function inferBierstilFromName(name: string): string {
  return inferBierstilFromNameDetailed(name).bierstil;
}

/**
 * Wie `inferBierstilFromName`, sagt aber, ob der Stil wirklich im Namen steht.
 * `matched: false` = Fantasiename ohne Stilhinweis — „helles“ ist dann nur der Standard,
 * kein Beleg (der Scanner markiert die Sorte zur Prüfung).
 */
export function inferBierstilFromNameDetailed(name: string): { bierstil: string; matched: boolean } {
  const normalized = name.toLowerCase();
  for (const hint of NAME_STYLE_HINTS) {
    if (hint.pattern.test(normalized)) return { bierstil: hint.bierstil, matched: true };
  }
  for (const option of BEER_STYLE_OPTIONS) {
    const label = option.label.toLowerCase();
    if (normalized.includes(label) || normalized.includes(option.bierstil.replace(/_/g, " "))) {
      return { bierstil: option.bierstil, matched: true };
    }
  }
  return { bierstil: "helles", matched: false };
}

/**
 * Altbestand: Früher wurde jedes „… Alkoholfrei“ zum Alkoholfrei-Pils (Pilstulpe).
 * Nennt der Sortenname eine echte Sorte (Hell, Weißbier, Radler …), gilt diese — samt Glas,
 * solange die Sorte noch das alte Pilstulpen-Default trägt.
 */
export function correctAlcoholFreeStyle(
  bierstil: string,
  glasTyp: string | null | undefined,
  beerName: string | null | undefined,
): { bierstil: string; glasTyp: string | undefined } {
  const glass = glasTyp?.trim() || undefined;
  if (bierstil !== "alkoholfrei_pilsner" || !beerName?.trim()) return { bierstil, glasTyp: glass };
  const base = inferBierstilFromName(beerName);
  if (base === "alkoholfrei_pilsner") return { bierstil, glasTyp: glass };
  const keepGlass = glass && glass !== "pils_tulpe";
  return { bierstil: base, glasTyp: keepGlass ? glass : findBeerStyle(base)?.glasTyp };
}

/** User-Glastyp aus der Sorte, sonst Stil-Default — nie stillschweigend weglassen. */
export function resolveGlasTyp(
  bierstil: string,
  glasTyp?: string | null,
): NonNullable<HyperrealisticInput["glasTyp"]> {
  const trimmed = glasTyp?.trim();
  if (trimmed && trimmed in GLAS_TYPEN) return trimmed as GlasTyp;
  return findBeerStyle(bierstil)?.glasTyp ?? "willibecher";
}
