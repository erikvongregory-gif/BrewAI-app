import type { ProduktKategorie } from "@/lib/dashboard/metadata";

export type BottleClosure = "kronkorken" | "buegel" | "schraub" | "ring_pull";

export const BOTTLE_PRESERVE = [
  "Silhouette",
  "Flaschenproportionen",
  "Verschluss",
  "Glasfarbe",
  "Etikettgeometrie",
] as const;

type BottleBase = {
  label: string;
  pillLabel: string;
  promptDescription: string;
  forbidden: string;
  typicalColors: readonly string[];
  geometry_profile: string;
  closure: BottleClosure;
  /** Kanonisches Form-Referenzfoto vorhanden (siehe bottleShapeReference). */
  hasShapeReference?: boolean;
};

function bottle(base: BottleBase) {
  return {
    ...base,
    display_name: base.label,
    glass_color_defaults: base.typicalColors,
    preserve: BOTTLE_PRESERVE,
    hasShapeReference: base.hasShapeReference ?? false,
  };
}

export const FLASCHEN_TYPEN = {
  // ---------------------------------------------------------------- 0,33 l
  euro_longneck_330: bottle({
    label: "Longneck 0,33 l",
    pillLabel: "Longneck 0,33 l",
    promptDescription:
      "a small 0.33 litre Ale long-neck beer bottle (American craft / 'Longneck' style): slim slender cylindrical body with a distinctly LONG thin neck, a smooth gently sloping shoulder transition, sealed with a 26 mm metal crown cap, total height roughly 24 cm — clearly a small single-serve 0.33 L bottle with an elegant elongated neck",
    forbidden:
      "NOT a tall 0.5 L bottle, NOT a short squat Steinie/Stubbi, NOT a short-necked Euroflasche, NOT a swing-top bottle, NOT an aluminium can",
    typicalColors: ["braun", "grün"],
    geometry_profile: "schlanker Körper, langer dünner Hals, sanfte Schulter, Kronkorken",
    closure: "kronkorken",
  }),
  euro_steinie_330: bottle({
    label: "Steinie / Stubbi 0,33 l",
    pillLabel: "Steinie 0,33 l",
    promptDescription:
      "a short squat 0.33 litre Steinie (Stubbi) beer bottle: compact stout chubby body, very short stubby neck, broad rounded 'shoulders', sealed with a 26 mm metal crown cap, total height only roughly 17–19 cm — deliberately small, round and stout (the classic German 'Stubbi')",
    forbidden:
      "NOT a tall long-neck bottle, NOT a 0.5 L bottle, NOT a slim elegant bottle, NOT a swing-top bottle, NOT an aluminium can",
    typicalColors: ["braun"],
    geometry_profile: "kurz und gedrungen, sehr kurzer Hals, breite Schultern, Kronkorken",
    closure: "kronkorken",
  }),
  vichy_330: bottle({
    label: "Vichy 0,33 l",
    pillLabel: "Vichy 0,33 l",
    promptDescription:
      "a 0.33 litre German Vichy/NRW returnable beer bottle (the 0.33 L version of the slim German NRW-Mehrwegflasche): total height roughly 22 cm — a slender, elegant small bottle whose LONG neck flows through a SMOOTH, GENTLE, GRADUAL sloping shoulder (no abrupt step, no sharp edge) into a slim, nearly straight body, sealed with a 26 mm metal crown cap — like a small NRW: slim and smooth-shouldered",
    forbidden:
      "NOT a 0.5 L bottle, NOT a stocky short-necked bottle, NOT an abrupt or stepped shoulder, NOT a short stubby Steinie/Stubbi, NOT a swing-top bottle, NOT an aluminium can — it MUST be the slim 0.33 L German NRW/Vichy returnable with a long neck and a smooth gradual sloping shoulder",
    typicalColors: ["braun", "grün"],
    geometry_profile: "schlank, langer Hals, glatte allmähliche Schulter, Kronkorken",
    closure: "kronkorken",
  }),
  buegel_330: bottle({
    label: "Bügelflasche 0,33 l",
    pillLabel: "Bügel 0,33 l",
    promptDescription:
      "a compact 0.33 litre German swing-top beer bottle (Bügelflasche): a smaller sturdy body with a thick neck and wide mouth, sealed with a white ceramic/porcelain stopper held shut by a hinged metal wire bail (swing-top mechanism, absolutely NO crown cap), total height roughly 20–22 cm",
    forbidden:
      "NOT a crown-cap bottle, NOT a tall 0.5 L bottle, NOT an aluminium can — the porcelain stopper and metal wire bail closure MUST be clearly visible",
    typicalColors: ["braun"],
    geometry_profile: "stabiler Körper, dicker Hals, Porzellanstöpsel mit Bügelverschluss",
    closure: "buegel",
  }),
  // ----------------------------------------------------------------- 0,5 l
  longneck_500: bottle({
    label: "Longneck 0,5 l",
    pillLabel: "Longneck 0,5 l",
    promptDescription:
      "a 0.5 litre Ale long-neck beer bottle (English / international 'Longneck' style, typical for Pale Ale and craft beer, ~27 cm tall): a comparatively FULLER, slightly more rounded cylindrical body carrying a long slim neck that meets the body at a MORE PRONOUNCED, clearly ROUNDED SHOULDER, sealed with a 26 mm metal crown cap — its shoulder is more defined and its body rounder/fuller than on the smooth, slim German NRW returnable",
    forbidden:
      "NOT a German NRW returnable (the NRW is about 1 cm shorter, with a shorter, thicker neck and a SMOOTH gradual sloping shoulder), NOT a short stocky Euroflasche, NOT a short stubby Steinie/Stubbi, NOT a small 0.33 L bottle, NOT a swing-top bottle, NOT an aluminium can — it MUST be the Ale long-neck (about 27 cm) with a long slim neck and a more pronounced rounded shoulder",
    typicalColors: ["braun", "grün"],
    geometry_profile: "voller Körper, langer Hals, ausgeprägte runde Schulter, Kronkorken",
    closure: "kronkorken",
  }),
  nrw_500: bottle({
    label: "NRW-Flasche 0,5 l",
    pillLabel: "NRW 0,5 l",
    promptDescription:
      "a 0.5 litre German NRW-Mehrwegflasche (VLB standard pool bottle — the everyday German beer bottle, often called NRW05): height ~26 cm, slim cylindrical body ~6.7 cm diameter, a MEDIUM-LENGTH neck that is shorter and thicker than an ale longneck, a smooth gradual shoulder with no abrupt step, 26 mm crown finish",
    forbidden:
      "NOT an American/English ale longneck (those have a longer thinner neck and a fuller rounded shoulder), NOT a short-necked stocky Euroflasche, NOT a Steinie/Stubbi, NOT a 0.33 L bottle, NOT a swing-top/Bügel bottle, NOT an aluminium can",
    typicalColors: ["braun"],
    geometry_profile: "schlanker Körper (Ø ca. 67,5 mm, Höhe ca. 26 cm), mittellanger Hals, sanfte allmähliche Schulter, Kronkorken",
    closure: "kronkorken",
    hasShapeReference: true,
  }),
  // Schlüssel historisch „vichy_500“, gemeint ist die Euroflasche (VLB: 228 mm, Ø 70,5 mm). Nicht umbenennen (gespeicherte Sortimente).
  vichy_500: bottle({
    label: "Euroflasche 0,5 l",
    pillLabel: "Euroflasche 0,5 l",
    promptDescription:
      "a 0.5 litre traditional German Euroflasche / Euro-Bierflasche (the classic stocky returnable beer bottle): a full-size half-litre bottle with a VERY SHORT neck, a strongly pronounced rounded shoulder and straight vertical cylindrical body walls about 7 cm wide, sealed with a 26 mm metal crown cap, total height roughly 23 cm (about 3 cm shorter than the NRW) — noticeably stockier and far shorter-necked than the slim NRW returnable or the long-neck",
    forbidden:
      "NOT a slim NRW returnable, NOT an Ale long-neck, NOT a short stubby Steinie/Stubbi, NOT a small 0.33 L bottle, NOT a swing-top bottle, NOT an aluminium can — it MUST be the stocky, very short-necked 0.5 L Euroflasche",
    typicalColors: ["braun", "grün"],
    geometry_profile: "stockig, sehr kurzer Hals, starke runde Schulter, Kronkorken",
    closure: "kronkorken",
  }),
  weizen_500: bottle({
    label: "Weizenflasche 0,5 l",
    pillLabel: "Weizen 0,5 l",
    promptDescription:
      "a tall slender 0.5 litre German Weizen (wheat beer) bottle: an elongated body with a long neck and the characteristic slightly curved profile that narrows gently towards the neck, sealed with a 26 mm metal crown cap, total height roughly 27–28 cm — the typical tall wheat-beer bottle",
    forbidden:
      "NOT a short stubby Steinie/Stubbi, NOT a 0.33 L bottle, NOT a short-necked Euroflasche, NOT a swing-top bottle, NOT an aluminium can",
    typicalColors: ["braun"],
    geometry_profile: "hoch und schlank, langer Hals, leicht geschwungenes Profil, Kronkorken",
    closure: "kronkorken",
  }),
  buegel_500: bottle({
    label: "Bügelflasche 0,5 l",
    pillLabel: "Bügel 0,5 l",
    promptDescription:
      "a 0.5 litre German swing-top beer bottle (Bügelflasche / Bügelverschluss, e.g. Lochmund/Flensburger style): a tall sturdy heavy body with a thick neck and a wide mouth, sealed with a white ceramic/porcelain stopper held shut by a hinged metal wire bail (swing-top mechanism, absolutely NO crown cap), total height roughly 25–26 cm",
    forbidden:
      "NOT a crown-cap bottle, NOT a short stubby Steinie/Stubbi, NOT a small 0.33 L bottle, NOT an aluminium can — the porcelain stopper and metal wire bail closure MUST be clearly visible",
    typicalColors: ["braun"],
    geometry_profile: "hoch, schwer, dicker Hals, Porzellanstöpsel mit Bügelverschluss",
    closure: "buegel",
  }),
  // ---------------------------------------------------------------- 0,75 l
  buegel_750: bottle({
    label: "Bügelflasche 0,75 l",
    pillLabel: "Bügel 0,75 l",
    promptDescription:
      "a large 0.75 litre German/Belgian swing-top sharing bottle (Bügelflasche): a tall big sturdy body with a thick neck and wide mouth, sealed with a white ceramic/porcelain stopper held by a hinged metal wire bail (swing-top mechanism, absolutely NO crown cap), total height roughly 30–32 cm",
    forbidden:
      "NOT a crown-cap bottle, NOT a small 0.33 or 0.5 L bottle, NOT an aluminium can — the porcelain stopper and metal wire bail closure MUST be clearly visible",
    typicalColors: ["braun", "grün"],
    geometry_profile: "große Sharing-Flasche, dicker Hals, Bügelverschluss",
    closure: "buegel",
  }),
  belgien_750: bottle({
    label: "Belgische Flasche 0,75 l",
    pillLabel: "Belgisch 0,75 l",
    promptDescription:
      "a 0.75 litre Belgian-style beer sharing bottle (Belgien-Flasche): a tall elegant bottle with a long neck and a high sloping shoulder, sealed either with a 26 mm metal crown cap or a cork-and-cage (champagne-style) closure, large sharing size, total height roughly 30–33 cm",
    forbidden:
      "NOT a small 0.33 or 0.5 L bottle, NOT a short stubby Steinie/Stubbi, NOT a stocky Euroflasche — it MUST be a large 0.75 L sharing bottle",
    typicalColors: ["braun", "grün"],
    geometry_profile: "hohe Sharing-Flasche, langer Hals, hohe Schulter, Kronkorken oder Kork",
    closure: "kronkorken",
  }),
  // ----------------------------------------------------------------- Dosen
  dose_330: bottle({
    label: "Dose 0,33 l",
    pillLabel: "Dose 0,33 l",
    promptDescription:
      "a 0.33 litre aluminium beverage can (German 'Dose') with a standard slim cylindrical body, rounded top neck-in and a ring-pull / stay-tab lid, total height roughly 11.5 cm — full wrap-around printed artwork covering the can body, NO glass, NO bottle neck, NO crown cap",
    forbidden:
      "NOT a glass bottle, NOT a long-neck or swing-top bottle, NOT a 0.5 L can, NOT a tall sleek energy-drink can — it MUST be a standard 0.33 L beer can",
    typicalColors: ["silber"],
    geometry_profile: "schlanke Aluminiumdose, Stay-Tab, Vollflächen-Artwork",
    closure: "ring_pull",
  }),
  dose_500: bottle({
    label: "Dose 0,5 l",
    pillLabel: "Dose 0,5 l",
    promptDescription:
      "a 0.5 litre aluminium beverage can (German 'Dose') with a taller standard cylindrical body, rounded top neck-in and a ring-pull / stay-tab lid, total height roughly 16.8 cm — full wrap-around printed artwork covering the can body, NO glass, NO bottle neck, NO crown cap",
    forbidden:
      "NOT a glass bottle, NOT a long-neck or swing-top bottle, NOT a small 0.33 L can — it MUST be a standard tall 0.5 L beer can",
    typicalColors: ["silber"],
    geometry_profile: "höhere Aluminiumdose, Stay-Tab, Vollflächen-Artwork",
    closure: "ring_pull",
  }),
  // ------------------------------------------------- AfG / Wasser (GDB, Handel)
  gastro_250: bottle({
    label: "Glas 0,25 l",
    pillLabel: "Glas 0,25 l",
    promptDescription:
      "a small 0.25 litre clear glass single-serve bottle (German Gastroflasche for mineral water, table water or lemonade): short slim cylinder, short neck, sealed with a 26 mm metal crown cap, total height roughly 18 cm",
    forbidden:
      "NOT a beer Steinie/Stubbi, NOT a 0.33 L longneck, NOT a 0.5 L bottle, NOT a PET bottle, NOT a swing-top, NOT a can",
    typicalColors: ["klar"],
    geometry_profile: "kurze schlanke Gastroflasche, kurzer Hals, Kronkorken",
    closure: "kronkorken",
  }),
  glas_500: bottle({
    label: "Glas-Mehrweg 0,5 l",
    pillLabel: "Glas 0,5 l",
    promptDescription:
      "a 0.5 litre clear glass returnable mineral-water bottle (German Brunnen-Mehrweg, GDB style): medium height, gently rounded shoulder, shorter and rounder than a beer longneck, sealed with a metal crown cap, total height roughly 23 cm",
    forbidden:
      "NOT a beer NRW bottle, NOT an ale longneck, NOT a PET bottle, NOT the 0.7 L Perlenflasche, NOT a can",
    typicalColors: ["klar"],
    geometry_profile: "runde Mineralwasser-Glasflasche, kurze Schulter, Kronkorken",
    closure: "kronkorken",
  }),
  perle_700: bottle({
    label: "Perlenflasche 0,7 l",
    pillLabel: "Perle 0,7 l",
    promptDescription:
      "the classic German 0.7 litre GDB Glas-Perlenflasche: clear glass, bulbous pearl-shaped body narrowing into a medium neck, metal crown cap, total height roughly 28 cm — the standard returnable for natural mineral water and mineral-water-based soft drinks",
    forbidden:
      "NOT a beer bottle, NOT the green 0.75 L Brunnenflasche, NOT a slim longneck, NOT a PET bottle, NOT a can",
    typicalColors: ["klar"],
    geometry_profile: "bauchige Perlenflasche, mittellanger Hals, Kronkorken",
    closure: "kronkorken",
  }),
  brunnen_750: bottle({
    label: "Brunnenflasche 0,75 l",
    pillLabel: "Brunnen 0,75 l",
    promptDescription:
      "a 0.75 litre green glass German Brunnen-Einheitsflasche for still mineral water: tall returnable with a rounded shoulder and metal crown cap, emerald-green glass, total height roughly 29 cm",
    forbidden:
      "NOT clear glass, NOT a beer bottle, NOT the clear 0.7 L Perlenflasche, NOT a PET bottle, NOT a can",
    typicalColors: ["grün"],
    geometry_profile: "hohe grüne Brunnenflasche, runde Schulter, Kronkorken",
    closure: "kronkorken",
  }),
  glas_750: bottle({
    label: "Glas-Mehrweg 0,75 l",
    pillLabel: "Glas 0,75 l",
    promptDescription:
      "a 0.75 litre clear glass returnable bottle for lemonade or table water: tall straight body, rounded shoulder, metal crown cap, total height roughly 29 cm",
    forbidden:
      "NOT the green still-water Brunnenflasche, NOT a beer bottle, NOT a PET bottle, NOT a 0.33 L longneck, NOT a can",
    typicalColors: ["klar"],
    geometry_profile: "hohe klare Glas-Mehrwegflasche, runde Schulter, Kronkorken",
    closure: "kronkorken",
  }),
  glas_1000: bottle({
    label: "Glas-Mehrweg 1,0 l",
    pillLabel: "Glas 1,0 l",
    promptDescription:
      "a large 1.0 litre clear glass returnable bottle (German Mehrweg-Großgebinde for lemonade or mineral water): tall broad body, plastic screw cap, total height roughly 31 cm",
    forbidden:
      "NOT a crown-cap beer bottle, NOT the 0.7 L Perlenflasche, NOT a PET bottle, NOT a can — the screw cap MUST be visible",
    typicalColors: ["klar"],
    geometry_profile: "großes klares Glas, Schraubverschluss",
    closure: "schraub",
  }),
  pet_500: bottle({
    label: "PET 0,5 l",
    pillLabel: "PET 0,5 l",
    promptDescription:
      "a 0.5 litre returnable PET plastic bottle: slim tall body, plastic screw cap, clear or pale blue, total height roughly 22 cm — plastic, NOT glass",
    forbidden: "NOT glass, NOT a crown cap, NOT a 1.0 or 1.5 L bottle, NOT a can",
    typicalColors: ["klar"],
    geometry_profile: "schlanke PET-Flasche, Schraubverschluss",
    closure: "schraub",
  }),
  pet_750: bottle({
    label: "PET 0,75 l",
    pillLabel: "PET 0,75 l",
    promptDescription:
      "a 0.75 litre clear PET returnable bottle for soft drinks: taller than the 0.5 L PET, rounded shoulder, plastic screw cap, total height roughly 26 cm — plastic, NOT glass",
    forbidden: "NOT glass, NOT a crown cap, NOT the 0.7 L glass Perlenflasche, NOT a can",
    typicalColors: ["klar"],
    geometry_profile: "klare PET-Flasche 0,75 l, Schraubverschluss",
    closure: "schraub",
  }),
  pet_1000: bottle({
    label: "PET 1,0 l",
    pillLabel: "PET 1,0 l",
    promptDescription:
      "a 1.0 litre returnable PET bottle (the standard German Getränkemarkt bottle): broad tall body, plastic screw cap, clear for lemonade or pale blue for mineral water, total height roughly 28 cm — plastic, NOT glass",
    forbidden: "NOT glass, NOT a crown cap, NOT a 0.5 L bottle, NOT a 1.5 L family bottle, NOT a can",
    typicalColors: ["klar"],
    geometry_profile: "große PET-Mehrwegflasche, Schraubverschluss",
    closure: "schraub",
  }),
  pet_1500: bottle({
    label: "PET 1,5 l",
    pillLabel: "PET 1,5 l",
    promptDescription:
      "a large 1.5 litre PET bottle (German family size, Einweg or Mehrweg): very tall broad plastic body, plastic screw cap, clear or pale blue, total height roughly 33 cm — NOT glass",
    forbidden: "NOT glass, NOT a crown cap, NOT a 1.0 L bottle, NOT a can",
    typicalColors: ["klar"],
    geometry_profile: "große PET-Familienflasche, Schraubverschluss",
    closure: "schraub",
  }),
} as const;

/** Aluminium-Dose statt Glasflasche — beeinflusst Material/Wording/Farbe im Prompt. */
export function isDoseTyp(flaschenTyp: keyof typeof FLASCHEN_TYPEN): boolean {
  return flaschenTyp === "dose_330" || flaschenTyp === "dose_500";
}

export function isPetTyp(flaschenTyp: string): boolean {
  return flaschenTyp.startsWith("pet_");
}

/** Materialphrase für Bildprompts. Dosen rufen das nicht auf. */
export function containerMaterialPhrase(
  flaschenTyp: string,
  farbe: "braun" | "gruen" | "klar",
): string {
  if (isPetTyp(flaschenTyp)) {
    if (farbe === "gruen") return "green-tinted PET plastic";
    if (farbe === "braun") return "amber-tinted PET plastic";
    return "clear PET plastic";
  }
  if (farbe === "gruen") return "green glass";
  if (farbe === "braun") return "amber-brown glass";
  return "clear flint glass";
}

export function getBottleCatalogEntry(flaschenTyp: keyof typeof FLASCHEN_TYPEN) {
  return FLASCHEN_TYPEN[flaschenTyp];
}

/**
 * Servier-Gläser. Schaumhöhe kommt NICHT aus dem Glas, sondern aus der Sorte (BEER_PHYSICS.head).
 * `eichstrich`: deutsches Schankglas mit Füllstrich und Volumenangabe.
 */
export const GLAS_TYPEN = {
  pils_tulpe: {
    label: "Pilstulpe",
    promptDescription:
      "STEMMED German Pilstulpe: tall slender tulip bowl on a thin stem with a round foot (stem+foot MANDATORY), narrow opening — NEVER a stemless Willibecher tumbler, NEVER a conical beer tumbler without stem",
    bierstile: ["pils", "helles_lager", "alkoholfrei_pilsner"],
    eichstrich: true,
  },
  weizen: {
    label: "Weizenglas",
    promptDescription:
      "tall curvy 0.5 L Weizen glass (vase silhouette, narrow waist above the base, widening toward the top), NO stem — NEVER a Willibecher tumbler, NEVER a stemmed Teku",
    bierstile: ["hefeweizen", "kristallweizen", "dunkles_weizen", "weizenbock"],
    eichstrich: true,
  },
  willibecher: {
    label: "Willibecher",
    promptDescription:
      "classic German Willibecher, the everyday German serving tumbler (~0.3–0.5 L): narrow thick sham base, walls widening upward in a straight cone, then a gentle rounded belly in the upper third that curves slightly back in toward the rim — NO stem, NO foot, NO handle, NOT a straight cylinder or highball, NOT an American shaker pint, NOT wider at the bottom",
    bierstile: ["helles", "export", "radler"],
    eichstrich: true,
  },
  seidel: {
    label: "Seidel / Henkelglas",
    promptDescription:
      "German Seidel: heavy 0.5 L glass beer mug with ONE handle, thick base and straight or dimpled walls — NOT a 1 litre Maßkrug, NOT a handle-less tumbler",
    bierstile: ["maerzen", "dunkel", "kellerbier", "rauchbier"],
    eichstrich: true,
  },
  masskrug: {
    label: "Maßkrug",
    promptDescription:
      "1-liter glass Maßkrug beer mug with one handle and dimpled facets — NEVER a stemless Willibecher without handle",
    bierstile: ["festbier", "helles"],
    eichstrich: true,
  },
  steinkrug: {
    label: "Steinkrug",
    promptDescription:
      "German Steinkrug: grey or brown salt-glazed stoneware beer mug with ONE handle, opaque ceramic walls — the beer is visible only from above at the rim, never through the walls; NOT a glass mug",
    bierstile: ["zwickel", "kellerbier"],
    eichstrich: false,
  },
  pokal: {
    label: "Bierpokal",
    promptDescription:
      "German Bierpokal: stemmed goblet with a short sturdy stem, round foot and a wide rounded bowl, about 0.3–0.4 L — NOT a slender Pilstulpe, NOT a snifter, NOT a stemless tumbler",
    bierstile: ["bock", "maibock", "doppelbock", "schwarzbier"],
    eichstrich: true,
  },
  ipa_teku: {
    label: "Teku / IPA Tulpe",
    promptDescription:
      "STEMMED Italian Teku tasting glass: thin stem and round foot are MANDATORY and clearly visible, bulbous bowl that flares then pinches to a narrow aroma rim — NEVER a stemless Willibecher, NEVER a conical tumbler without stem, NEVER a shaker pint",
    bierstile: ["ipa", "neipa", "double_ipa", "saison"],
    eichstrich: false,
  },
  schwenker: {
    label: "Schwenker / Snifter",
    promptDescription:
      "STEMMED snifter glass: thin stem and round foot MANDATORY, wide bulbous bowl narrowing toward the rim — NEVER a stemless Willibecher tumbler",
    bierstile: ["barley_wine", "imperial_stout"],
    eichstrich: false,
  },
  nonic: {
    label: "Nonic-Pint",
    promptDescription:
      "Nonic pint glass: tall straight 0.5 L pint with a characteristic bulge ring a few centimetres below the rim, NO stem, NO handle — NOT a conical Willibecher, NOT a Weizen vase",
    bierstile: ["stout", "porter"],
    eichstrich: true,
  },
  stange: {
    label: "Stange",
    promptDescription:
      "tall narrow cylindrical 0.2 L Kölsch/Alt Stange glass, NO stem — NEVER a wider Willibecher tumbler",
    bierstile: ["koelsch", "altbier"],
    eichstrich: true,
  },
} as const;

export const STUDIO_PROPS_BY_BIERSTIL = {
  // Keine Zitronenscheibe als Standard (zerstört den Schaum, nur auf ausdrücklichen Wunsch) — Fachkorrektur Audit 05.
  hefeweizen: ["frische Weizenähren", "Brezel"],
  kristallweizen: ["Weizenähren", "Wassertropfen am Glas"],
  pils: ["frische Hopfendolden", "Gerstenähren", "Wassertropfen am Glas"],
  helles_lager: ["Gerstenähren", "Malzkörner verstreut"],
  helles: ["Brezel", "Gerstenähren", "Wiesenblumen dezent"],
  ipa: ["frische Hopfendolden grün", "Zitrusfrüchte (Grapefruit, Orange)", "tropische Früchte"],
  neipa: ["Mango", "Maracuja", "Hopfendolden", "diffuses Sonnenlicht"],
  stout: ["Kaffeebohnen", "dunkle Schokolade", "geröstetes Malz"],
  porter: ["geröstetes Malz", "Kaffeebohnen"],
  bock: ["dunkles Malz", "Eichenholz", "Lederakzente"],
  saison: ["rustikales Bauernbrot", "getrocknete Wiesenkräuter", "Pfefferkörner"],
  kellerbier: ["unfiltrierte Optik", "Holzfass im Hintergrund", "Gerstenähren"],
  rauchbier: ["geräucherte Malzkörner", "Buchenholzscheite"],
} as const;

export type Bierstil = keyof typeof STUDIO_PROPS_BY_BIERSTIL;
export type FlaschenTyp = keyof typeof FLASCHEN_TYPEN;
export type GlasTyp = keyof typeof GLAS_TYPEN;

/** Gebinde, die im Sortiment je Getränkeart wählbar sind. */
export const FLASCHEN_NACH_KATEGORIE = {
  bier: [
    "euro_longneck_330",
    "euro_steinie_330",
    "vichy_330",
    "buegel_330",
    "longneck_500",
    "nrw_500",
    "vichy_500",
    "weizen_500",
    "buegel_500",
    "buegel_750",
    "belgien_750",
    "dose_330",
    "dose_500",
  ],
  limonade: [
    "gastro_250",
    "euro_longneck_330",
    "dose_330",
    "glas_500",
    // Brauerei-Limos (Spezi, Kracherl, Cola-Mix) laufen oft in der Bier-Mehrwegflasche.
    "nrw_500",
    "vichy_500",
    "dose_500",
    "pet_500",
    "perle_700",
    "glas_750",
    "pet_750",
    "glas_1000",
    "pet_1000",
    "pet_1500",
  ],
  tafelwasser: ["gastro_250", "glas_500", "pet_500", "glas_750", "glas_1000", "pet_1000", "pet_1500"],
  mineralwasser: [
    "gastro_250",
    "glas_500",
    "pet_500",
    "perle_700",
    "glas_750",
    "brunnen_750",
    "glas_1000",
    "pet_1000",
    "pet_1500",
  ],
} as const satisfies Record<ProduktKategorie, readonly FlaschenTyp[]>;

export const DEFAULT_FLASCHE: Record<ProduktKategorie, FlaschenTyp> = {
  bier: "nrw_500",
  limonade: "pet_1000",
  tafelwasser: "pet_1500",
  mineralwasser: "perle_700",
};

export function flascheForKategorie(kategorie: ProduktKategorie, current?: string): FlaschenTyp {
  const allowed = FLASCHEN_NACH_KATEGORIE[kategorie] as readonly string[];
  if (current && allowed.includes(current)) return current as FlaschenTyp;
  return DEFAULT_FLASCHE[kategorie];
}

/** Flaschentypen einer Getränkeart, nach Füllmenge gruppiert. Chip-Label ohne Literangabe. */
export function flaschenGruppen(kategorie: ProduktKategorie) {
  const groups: { volume: string; ml: number; items: { code: FlaschenTyp; label: string }[] }[] = [];
  for (const code of FLASCHEN_NACH_KATEGORIE[kategorie]) {
    const pill = FLASCHEN_TYPEN[code].pillLabel;
    const match = pill.match(/^(.*?)\s+(\d+(?:,\d+)?\s*l)$/);
    const volume = match?.[2] ?? "Weitere";
    const label = match?.[1] ?? pill;
    let group = groups.find((entry) => entry.volume === volume);
    if (!group) {
      group = { volume, ml: flascheVolumeMl(code), items: [] };
      groups.push(group);
    }
    group.items.push({ code, label });
  }
  groups.sort((a, b) => a.ml - b.ml);
  return groups;
}

export function flascheVolumeMl(flaschenTyp: string): number {
  const ml = Number(flaschenTyp.match(/_(\d+)$/)?.[1]);
  return ml > 0 ? ml : 330;
}

const GLAS_NOMINAL_ML: Record<GlasTyp, number> = {
  pils_tulpe: 300,
  weizen: 500,
  willibecher: 500,
  seidel: 500,
  masskrug: 1000,
  steinkrug: 500,
  pokal: 300,
  ipa_teku: 300,
  schwenker: 250,
  nonic: 500,
  stange: 200,
};

/**
 * Bei Flasche+Glas passt das Glas zum Gebinde: 0,5-l-Flasche → 0,5-l-Glas, 0,33 → 0,3.
 * Nie ein 0,3er-Glas neben der Halben und nie eine Maß neben der 0,33. Nur-Glas bleibt Nennvolumen.
 */
export function pouredGlassFillMl(
  glasTyp: GlasTyp,
  flaschenTyp: string,
  behaelter: "G" | "F" | "B",
): number {
  const nominal = GLAS_NOMINAL_ML[glasTyp];
  if (behaelter === "G") return nominal;
  return flascheVolumeMl(flaschenTyp);
}

function litersLabel(ml: number): string {
  if (ml >= 1000) return "1.0";
  if (ml >= 500) return "0.5";
  if (ml >= 300) return "0.3";
  if (ml >= 250) return "0.25";
  return "0.2";
}

function volumeForbidden(fillMl: number): string {
  if (fillMl < 500) {
    return "NOT a 0.5 litre Seidel or Willibecher, NOT a 0.5 litre dimpled mug, NOT a 1 litre Maßkrug";
  }
  if (fillMl < 1000) {
    return "The glass takes the whole half-litre bottle — NOT a small 0.2–0.3 litre glass, NOT a 1 litre Maßkrug";
  }
  return "";
}

/** Deutsches Schankglas mit Füllstrich — das Bier steht am Strich, der Schaum darüber. */
export function glassHasEichstrich(glasTyp: GlasTyp): boolean {
  return GLAS_TYPEN[glasTyp].eichstrich;
}

/** Glasbeschreibung inkl. realer Fuellmenge neben der gewaehlten Flasche/Dose. */
export function glassPourPromptDescription(
  glasTyp: GlasTyp,
  fillMl: number,
): string {
  const litres = litersLabel(fillMl);
  const tooBig = volumeForbidden(fillMl);
  switch (glasTyp) {
    case "masskrug":
      if (fillMl >= 1000) return GLAS_TYPEN.masskrug.promptDescription;
      return `a small ${litres} litre dimpled glass beer mug (Seidel) with one handle — a single pour from the bottle beside it. ${tooBig}`;
    case "willibecher":
      return `classic German ${litres} litre Willibecher: narrow thick sham base, walls widening upward in a straight cone, then a gentle rounded belly in the upper third that curves slightly back in toward the rim — NO stem, NO foot, NO handle, NOT a straight cylinder or highball, NOT an American shaker pint, NOT wider at the bottom. ${tooBig}`;
    case "weizen":
      if (fillMl < 500) {
        return `a smaller ${litres} litre wheat-beer glass, not the tall 0.5 L Weizen vase. ${tooBig}`;
      }
      return GLAS_TYPEN.weizen.promptDescription;
    default:
      return `${GLAS_TYPEN[glasTyp].promptDescription}. Serving size ${litres} litre. ${tooBig}`.trim();
  }
}
