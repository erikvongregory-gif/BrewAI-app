import { catalogIdentity, catalogToken, readCatalogEvidence, readCatalogImages } from "./catalog-products";
import { randomUUID } from "node:crypto";
import { findBeerStyle, inferBierstilFromName } from "@/app/(dashboard)/inhalte-erstellen/lib/beer-styles";
import { flascheForKategorie } from "@/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge";
import {
  MAX_MY_BEERS,
  sanitizeDashboardBeers,
  sanitizeProduktKategorie,
  type DashboardBeer,
  type ProduktKategorie,
} from "@/lib/dashboard/metadata";
import { uploadUserImageToStorage } from "@/lib/supabase/storage";
import { assertSafePublicUrl, BROWSER_USER_AGENT, URL_FETCH_TIMEOUT_MS } from "@/lib/brand/url-intake";
import { publicFetch } from "@/lib/security/public-fetch";
import { prepareProductImage, type ProductImagePart } from "@/lib/brand/product-image-prep";
import type { ProductEvidence } from "@/lib/brand/brand-evidence";
import {
  type DownloadedImage,
  type ImageCandidate,
  type ParsedWebsitePage,
} from "@/lib/brand/website-intake";

export type SuggestedBeerVariety = {
  name: string;
  produktKategorie?: ProduktKategorie;
  bierstil: string;
  flaschenTyp: string;
  flaschenfarbe: "braun" | "gruen" | "klar";
  glasTyp: string;
  etikettUrl: string;
  /** true = Verpackung nicht belegt, Nutzer soll prüfen. */
  packagingNeedsReview?: boolean;
  /** Alle auf der Website belegten Gebinde der Sorte (Flaschentyp-Codes), erstes = Standard. */
  gebinde?: string[];
  /** Weitere passende Bild-Kandidaten — im Prüfschritt mit einem Klick wählbar. */
  bildAlternativen?: string[];
  /** Wie sicher das Sortenbild ist: Flasche bestätigt, nur Etikett, ungeprüft oder keins. */
  bildStatus?: "flasche" | "etikett" | "ungeprueft" | "keins";
  /** Gebinde-Variante mit gemeinsamem Foto mehrerer Flaschen: welche Flasche (nach Höhe) ausgeschnitten wird. */
  bildTeil?: ProductImagePart;
  /** Beleg des Sortennamens im Website-Quelltext (fehlt bei Regel-Erkennung und Altbestand). */
  nachweis?: ProductEvidence;
  /** false = Bierstil weder im Namen noch auf der Produktseite belegt („helles“ ist dann nur Standard) — prüfen. */
  bierstilBelegt?: boolean;
};

export type PackagingGuess = {
  flaschenTyp: string;
  flaschenfarbe: "braun" | "gruen" | "klar";
  packagingNeedsReview: boolean;
};

/** Verpackung aus Produkttext/URL/Alt — Unbekanntes explizit zur Prüfung markieren. */
export function inferPackagingFromEvidence(evidence: string, kategorie: ProduktKategorie): PackagingGuess {
  const token = normalizeToken(evidence);
  const raw = evidence.toLowerCase();

  const mlMatch =
    raw.match(/\b(\d{3,4})\s*ml\b/) ??
    raw.match(/\b0\s*[,.]\s*(33|5|50|75)\s*l\b/) ??
    raw.match(/\b(33|50|75)\s*cl\b/);
  let ml = 0;
  if (mlMatch) {
    const value = mlMatch[1]!;
    if (value === "33" || value === "5" || value === "50" || value === "75") {
      ml = value === "5" || value === "50" ? 500 : value === "75" ? 750 : 330;
    } else {
      ml = Number(value);
    }
  }

  const isDose = /\b(?:dose|dosen|can|cans)\b/.test(token) || /[-_/](?:dose|can)(?:[-_/]|$)/.test(token);
  const isBuegel = /buegel|swing-?top|buegelverschluss/.test(token);
  const isWeizen = /weizenflasch/.test(token);
  const isLongneck = /longneck|ale-?flasch/.test(token);
  const isEuro = /euroflasch|steinie|stubbi/.test(token);
  const isNrw = /\bnrw\b|vichy|mehrwegflasch/.test(token);

  let flaschenTyp = "nrw_500";
  let formKnown = false;
  if (isDose) {
    flaschenTyp = ml >= 450 ? "dose_500" : "dose_330";
    formKnown = true;
  } else if (isBuegel) {
    flaschenTyp = ml >= 700 ? "buegel_750" : ml > 0 && ml <= 350 ? "buegel_330" : "buegel_500";
    formKnown = true;
  } else if (isWeizen) {
    flaschenTyp = "weizen_500";
    formKnown = true;
  } else if (isLongneck) {
    flaschenTyp = "longneck_500";
    formKnown = true;
  } else if (isEuro) {
    flaschenTyp = "vichy_500";
    formKnown = true;
  } else if (isNrw || ml === 330) {
    // 0,33-l-NRW heißt im Katalog vichy_330 (kein eigener nrw_330-Typ).
    flaschenTyp = ml > 0 && ml <= 350 ? "vichy_330" : "nrw_500";
    formKnown = isNrw || ml === 330;
  } else if (ml === 500) {
    flaschenTyp = "nrw_500";
    formKnown = false; // Volumen allein ≠ Form
  }

  let flaschenfarbe: PackagingGuess["flaschenfarbe"] = kategorie === "bier" ? "braun" : "klar";
  let colorKnown = false;
  if (isDose) {
    flaschenfarbe = "klar";
    colorKnown = true;
  } else if (/gruen|green/.test(token) || /grün/.test(raw)) {
    flaschenfarbe = "gruen";
    colorKnown = true;
  } else if (/klar|flint|clear|weissglas|weiss-?glas/.test(token)) {
    flaschenfarbe = "klar";
    colorKnown = true;
  } else if (/braun|amber|brown/.test(token)) {
    flaschenfarbe = "braun";
    colorKnown = true;
  }

  if (kategorie !== "bier") {
    if (isLongneck && kategorie === "limonade") {
      flaschenTyp = "euro_longneck_330";
      formKnown = true;
    }
    // Ohne Formbeleg nicht die Bier-Standardflasche annehmen, sondern den Kategorie-Standard.
    const allowed = flascheForKategorie(kategorie, formKnown ? flaschenTyp : undefined);
    if (allowed !== flaschenTyp) {
      return { flaschenTyp: allowed, flaschenfarbe: "klar", packagingNeedsReview: true };
    }
  }

  return {
    flaschenTyp,
    flaschenfarbe,
    packagingNeedsReview: !formKnown || (!isDose && !colorKnown && kategorie === "bier"),
  };
}

const FILENAME_SKIP_SLUGS = new Set([
  "euro",
  "euro-flaschne",
  "lkw",
  "festhalle",
  "historie",
  "logo",
  "wappen",
  "gebaeude",
]);

// Product evidence must come from the item itself, never its domain or parent
// directory (a brewery's /bier/ shop can also contain glasses and merchandise).
const BEER_PRODUCT_SIGNAL = /\b(?:bier|beer|pils(?:ner|ener)?|hell(?:es|er)?|dunkel(?:es|er)?|(?:hefe|kristall)?weizen|weissbier|weizenbier|lager(?:bier)?|(?:doppel|eis|weizen)?bock|bockbier|radler|(?:ne|double-)?ipa|stout|porter|saison|koelsch|maerzen|kellerbier|zwickl|zwickelbier|altbier|festbier|oktoberfestbier|edelstoff|maximator|pale-ale)\b/;
const LIMONADE_SIGNAL = /\b(?:limonade|limo|cola|spezi|brause|orangeade|orangenlimonade|zitronenlimonade|zitronenlimo|orangenlimo|kola|fritz-kola|ginger-ale|bitter-lemon|tonic(?:-water|-wasser)?)\b/;
const TAFELWASSER_SIGNAL = /\btafel(?:-)?wasser\b/;
const MINERALWASSER_SIGNAL = /\b(?:mineral(?:-)?wasser|quell(?:-)?wasser)\b/;
const NON_CATALOG_PRODUCT = /\b(?:saft|saefte|schorle|energy|gin|whisk(?:e)?y|rum|vodka|wodka|schnaps|likoer|brand|braende|wein|sekt|cider|glas|glaeser|bierglas|bierglaeser|pilsglas|weizenglas|krug|kruege|bierkrug|masskrug|tasse\w*|becher|flaschenoeffner|oeffner|bierdeckel|untersetzer|shirt\w*|hoodie\w*|muetze\w*|cap|caps|kleidung|merch\w*|gutschein\w*|geschenk\w*|probierpaket\w*|bierpaket\w*|set|sets|paket\w*|fuehrung\w*|verkostung\w*|bierprobe\w*)\b/;
const GENERIC_CATALOG_HEADING = /\b(?:unsere?|sortiment|biere|biersorten|sorten|entdecken|entdecke|welt|geschichte|braukunst|brauen|erleben|qualitaet|angebote|produkte|shop|zubehoer|verkauf|getraenke)\b/;

export function detectProduktKategorie(value: string): ProduktKategorie | null {
  const token = normalizeToken(value);
  if (!token || NON_CATALOG_PRODUCT.test(token) || GENERIC_CATALOG_HEADING.test(token)) return null;
  if (/^(?:wasser|water)$/.test(token)) return null;
  if (BEER_PRODUCT_SIGNAL.test(token)) return "bier";
  if (TAFELWASSER_SIGNAL.test(token)) return "tafelwasser";
  if (MINERALWASSER_SIGNAL.test(token)) return "mineralwasser";
  if (LIMONADE_SIGNAL.test(token)) return "limonade";
  return null;
}

function imageFilename(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

function normalizeToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export { inferBierstilFromName };

export function inferProduktBezeichnung(name: string, kategorie: ProduktKategorie): string {
  if (kategorie === "bier") return inferBierstilFromName(name);
  const normalized = name.toLowerCase();
  if (kategorie === "limonade") {
    if (/\bspezi\b/.test(normalized)) return "spezi";
    if (/\bcola\b/.test(normalized)) return "cola";
  }
  return kategorie;
}

function breweryShortName(breweryName: string): string {
  const firstToken = breweryName.split(/\s+/)[0]?.trim() ?? breweryName.trim();
  if (/bräu|braeu|brauerei|brewery|brewing/i.test(firstToken)) {
    return firstToken.split(/[-_]/)[0]?.trim() || firstToken;
  }
  return firstToken;
}

export function humanizeBeerSlug(slug: string, breweryName: string): string {
  const cleaned = titleCaseWords(slug.replace(/-/g, " ").replace(/_/g, " ").trim());
  if (!cleaned) return "";
  const short = breweryShortName(breweryName).toLowerCase();
  if (short && cleaned.toLowerCase().startsWith(short)) return cleaned;
  if (short && cleaned.split(" ").length === 1) return `${breweryShortName(breweryName)} ${cleaned}`;
  return cleaned;
}

function extractContaoSlugFromImageUrl(url: string): string | null {
  const decoded = imageFilename(url);
  const csmMatch = decoded.match(/csm_(?:[A-Za-z][A-Za-z0-9]*-)?([A-Za-z0-9-]+?)_[a-f0-9]{6,}\./i);
  if (!csmMatch?.[1]) return null;
  const token = normalizeToken(csmMatch[1]);
  if (!token || token.length < 3 || FILENAME_SKIP_SLUGS.has(token)) return null;
  if (FILENAME_SKIP_SLUGS.has(token.split("-")[0] ?? "")) return null;
  if (/festhalle|historie|gebaeude|portrait|portraet|\d{4}-\d{2}-\d{2}/.test(token)) return null;
  return token;
}

const PRODUCT_IMAGE_NOISE =
  /logo|banner|hero|slider|thumb|icon|favicon|social|partner|sponsor|historie|gebaeude|portrait|portraet|team|event|news|cookie|gate|wm-|euro|lkw|festhalle|placeholder|spacer|loader|tracking|pixel|1x1|svg/i;

/** Filename identifier only. collectProductImages separately verifies beer evidence. */
export function extractProductSlugFromImageUrl(url: string): string | null {
  const contao = extractContaoSlugFromImageUrl(url);
  if (contao) return contao;

  const filename = imageFilename(url);
  let base = filename.replace(/\.(jpe?g|png|webp|avif)$/i, "");
  base = base.replace(/[-_][a-f0-9]{6,}$/i, "").replace(/^csm[-_]?/i, "");
  const slug = normalizeToken(base);
  if (slug.length < 3 || FILENAME_SKIP_SLUGS.has(slug)) return null;
  if (PRODUCT_IMAGE_NOISE.test(slug) || PRODUCT_IMAGE_NOISE.test(url)) return null;

  return slug;
}

type CatalogImageRef = { url: string; alt: string; kategorie?: ProduktKategorie };

function imageMatchScore(name: string, image: CatalogImageRef, brewery: string): number {
  const wanted = catalogIdentity(name, brewery);
  const alt = catalogIdentity(image.alt, brewery);
  const slug = catalogIdentity(extractProductSlugFromImageUrl(image.url) ?? "", brewery);
  if (wanted === alt || wanted === slug) return 100;
  const modifiers = /(?:^|-)(alkoholfrei|zero|light|zuckerfrei|bock|naturtrueb|zitrone|orange|grapefruit|blutorange|helles|dunkel|0-0)(?=-|$)/g;
  const wantedModifiers = [...wanted.matchAll(modifiers)].map((match) => match[1]);
  return Math.max(0, ...[alt, slug].filter(Boolean).map((candidate) => {
    const otherModifiers = [...candidate.matchAll(modifiers)].map((match) => match[1]);
    // Never assign a regular product image to its zero/alcohol-free/flavour variant.
    if (otherModifiers.some((part) => !wantedModifiers.includes(part))) return 0;
    if (wantedModifiers.some((part) => !otherModifiers.includes(part) && part !== "helles")) return 0;
    const tokens = candidate.split("-");
    const wantedTokens = wanted.split("-");
    return tokens.every((part) => wantedTokens.includes(part)) ? 40 + candidate.length : 0;
  }));
}

export function extractBeerVarietiesFromIntake(params: {
  pages: ParsedWebsitePage[];
  downloadedImages: DownloadedImage[];
  imageCandidates?: ImageCandidate[];
  breweryName: string;
  rawHtmlByUrl?: Record<string, string>;
}): SuggestedBeerVariety[] {
  const brewery = params.breweryName.trim();
  type Entry = { name: string; kategorie: ProduktKategorie; etikettUrl: string; score: number; evidence: string };
  const entries = new Map<string, Entry>();
  const images: CatalogImageRef[] = [];
  const add = (name: string, kategorie: ProduktKategorie, etikettUrl = "", score = 0, evidence = "") => {
    const identity = catalogIdentity(name, brewery);
    if (!identity) return;
    const key = `${kategorie}:${identity}`;
    const existing = entries.get(key);
    if (!existing) entries.set(key, { name, kategorie, etikettUrl, score, evidence });
    else {
      if (etikettUrl && score > existing.score) Object.assign(existing, { etikettUrl, score });
      if (evidence) existing.evidence = `${existing.evidence} ${evidence}`.trim();
    }
  };
  for (const page of params.pages) {
    for (const product of readCatalogEvidence(params.rawHtmlByUrl?.[page.pageUrl] ?? "", page.pageUrl)) {
      const token = catalogToken(product.name);
      if (NON_CATALOG_PRODUCT.test(token) || GENERIC_CATALOG_HEADING.test(token)) continue;
      const flavour = /\b(?:zitrone|orange|blutorange|grapefruit|zitrus|limette|rhabarber|waldmeister|himbeere|holunder|mandarine)\b/.test(token);
      const lemonadeContext = /limonad|limo|softdrink|erfrischungsgetr/i.test(product.context);
      const category = (product.category ?? "").replace(/\bLimonaden\b/gi, "Limonade").replace(/\bBiere\b/gi, "Bier");
      const kategorie = detectProduktKategorie(product.name) ?? detectProduktKategorie(category) ?? (flavour && lemonadeContext ? "limonade" : null);
      if (!kategorie) continue;
      const uniqueImage = product.images.length === 1 ? product.images[0] : "";
      const evidence = [product.name, product.context, category, ...product.images].filter(Boolean).join(" ");
      add(product.name, kategorie, uniqueImage, uniqueImage ? 200 : 0, evidence);
      for (const url of product.images) images.push({ url, alt: product.images.length === 1 ? product.name : "", kategorie });
    }
  }
  // Shared catalogue art is not a trustworthy image for either individual variety.
  const imageUses = new Map<string, number>();
  for (const entry of entries.values()) {
    if (entry.etikettUrl) imageUses.set(entry.etikettUrl, (imageUses.get(entry.etikettUrl) ?? 0) + 1);
  }
  for (const entry of entries.values()) {
    if ((imageUses.get(entry.etikettUrl) ?? 0) > 1) Object.assign(entry, { etikettUrl: "", score: 0 });
  }
  const candidates = [...params.pages.flatMap((page) => readCatalogImages(params.rawHtmlByUrl?.[page.pageUrl] ?? "", page.pageUrl)), ...params.downloadedImages, ...(params.imageCandidates ?? []), ...params.pages.flatMap((page) => page.imageCandidates)];
  for (const candidate of candidates) {
    const slug = extractProductSlugFromImageUrl(candidate.url);
    if (!slug || PRODUCT_IMAGE_NOISE.test(imageFilename(candidate.url))) continue;
    const text = `${imageFilename(candidate.url)} ${candidate.alt}`;
    if (NON_CATALOG_PRODUCT.test(catalogToken(text))) continue;
    const kategorie = detectProduktKategorie(candidate.alt) ?? detectProduktKategorie(slug)
      ?? (/\balkoholfrei\b/.test(slug) && [...entries.values()].some((entry) => entry.kategorie === "bier" && imageMatchScore(entry.name, candidate, brewery) > 0) ? "bier" : null);
    if (kategorie) images.push({ url: candidate.url, alt: candidate.alt, kategorie });
  }
  // An image may enrich an existing product. It must not merge two named varieties.
  for (const entry of entries.values()) {
    const ranked = images.filter((image) => image.kategorie === entry.kategorie && (imageUses.get(image.url) ?? 0) <= 1)
      .map((image) => ({ image, score: imageMatchScore(entry.name, image, brewery) }))
      .filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    for (const match of ranked) {
      const competitors = [...entries.values()].filter((other) => other !== entry && other.kategorie === entry.kategorie && imageMatchScore(other.name, match.image, brewery) >= match.score);
      if (competitors.length) continue;
      if (match.score > entry.score) {
        Object.assign(entry, { etikettUrl: match.image.url, score: match.score });
        entry.evidence = `${entry.evidence} ${match.image.url} ${match.image.alt}`.trim();
      }
    }
  }
  // Filenames and alt text may match images to products, but never establish a
  // new variety: campaign and lifestyle photos also contain beer names.
  return [...entries.values()].slice(0, MAX_MY_BEERS).map((entry): SuggestedBeerVariety => {
    const bierstil = inferProduktBezeichnung(entry.name, entry.kategorie);
    const style = entry.kategorie === "bier" ? findBeerStyle(bierstil) : undefined;
    const packaging = inferPackagingFromEvidence(`${entry.evidence} ${entry.name} ${entry.etikettUrl}`, entry.kategorie);
    return {
      name: entry.name.slice(0, 80),
      produktKategorie: entry.kategorie,
      bierstil,
      flaschenTyp: packaging.flaschenTyp,
      flaschenfarbe: packaging.flaschenfarbe,
      glasTyp: style?.glasTyp ?? "willibecher",
      etikettUrl: entry.etikettUrl.slice(0, 1200),
      packagingNeedsReview: packaging.packagingNeedsReview,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export function suggestedBeersToDashboard(suggested: SuggestedBeerVariety[]): DashboardBeer[] {
  return replaceSuggestedBeers([], suggested);
}

/**
 * Ersetzt das Sortiment durch die Scan-Treffer.
 * Gleichnamige Einträge behalten id + vorhandenes Etikettfoto.
 * Fremde Marken-Sorten (nicht im Scan) fallen weg.
 *
 * `keepUserConfirmed` (Neuscan derselben Marke): Vom Nutzer angelegte oder bearbeitete Sorten
 * (`nutzerBestaetigt`) bleiben erhalten, auch wenn der Scan sie nicht findet, und ihre Angaben zu
 * Stil, Gebinde, Glas und Etikett gewinnen gegen den Scan. Bei einem Markenwechsel nicht setzen.
 */
export function replaceSuggestedBeers(
  existing: DashboardBeer[],
  suggested: SuggestedBeerVariety[],
  options: { keepUserConfirmed?: boolean } = {},
): DashboardBeer[] {
  const keyOf = (kategorie: DashboardBeer["produktKategorie"], name: string) =>
    `${sanitizeProduktKategorie(kategorie)}:${catalogIdentity(name)}`;
  const existingBeers = sanitizeDashboardBeers(existing);
  const byName = new Map<string, DashboardBeer>(
    existingBeers.map((beer) => [keyOf(beer.produktKategorie, beer.name), beer] as const),
  );
  const out: DashboardBeer[] = [];
  const seen = new Set<string>();

  for (const suggestion of suggested) {
    if (out.length >= MAX_MY_BEERS) break;
    const name = suggestion.name.trim();
    if (!name) continue;
    const key = keyOf(suggestion.produktKategorie, name);
    if (seen.has(key)) continue;
    seen.add(key);
    const prev = byName.get(key);
    const evidence = {
      ...(suggestion.nachweis?.status ? { nachweisStatus: suggestion.nachweis.status } : {}),
      ...(typeof suggestion.bierstilBelegt === "boolean" ? { bierstilBelegt: suggestion.bierstilBelegt } : {}),
    };
    if (options.keepUserConfirmed && prev?.nutzerBestaetigt) {
      // Nutzerkorrekturen gewinnen; der Scan ergänzt nur ein fehlendes Etikett und den Namensbeleg.
      out.push({
        ...prev,
        etikettUrl: (prev.etikettUrl.trim() || suggestion.etikettUrl.trim()).slice(0, 1200),
        ...(evidence.nachweisStatus ? { nachweisStatus: evidence.nachweisStatus } : {}),
      });
      continue;
    }
    const etikettUrl = (suggestion.etikettUrl.trim() || prev?.etikettUrl || "").slice(0, 1200);
    out.push({
      id: prev?.id ?? `beer-${randomUUID()}`,
      name,
      produktKategorie: sanitizeProduktKategorie(suggestion.produktKategorie),
      bierstil: suggestion.bierstil,
      flaschenTyp: suggestion.flaschenTyp,
      flaschenfarbe: suggestion.flaschenfarbe,
      glasTyp: suggestion.glasTyp,
      etikettUrl,
      createdAt: prev?.createdAt || new Date().toISOString(),
      ...evidence,
    });
  }

  if (options.keepUserConfirmed) {
    for (const beer of existingBeers) {
      if (out.length >= MAX_MY_BEERS) break;
      if (!beer.nutzerBestaetigt) continue;
      const key = keyOf(beer.produktKategorie, beer.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(beer);
    }
  }

  return sanitizeDashboardBeers(out);
}

export function mergeSuggestedBeers(existing: DashboardBeer[], suggested: SuggestedBeerVariety[]): DashboardBeer[] {
  const out = [...sanitizeDashboardBeers(existing)];
  const seen = new Set(out.map((beer) => `${sanitizeProduktKategorie(beer.produktKategorie)}:${catalogIdentity(beer.name)}`));

  for (const suggestion of suggested) {
    if (out.length >= MAX_MY_BEERS) break;
    const name = suggestion.name.trim();
    if (!name) continue;
    const key = `${sanitizeProduktKategorie(suggestion.produktKategorie)}:${catalogIdentity(name)}`;
    const existingBeer = out.find((beer) => `${sanitizeProduktKategorie(beer.produktKategorie)}:${catalogIdentity(beer.name)}` === key);
    if (existingBeer) {
      if (!existingBeer.etikettUrl.trim() && suggestion.etikettUrl.trim()) {
        existingBeer.etikettUrl = suggestion.etikettUrl.trim().slice(0, 1200);
      }
      existingBeer.produktKategorie = sanitizeProduktKategorie(
        suggestion.produktKategorie || existingBeer.produktKategorie,
      );
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `beer-${randomUUID()}`,
      name,
      produktKategorie: sanitizeProduktKategorie(suggestion.produktKategorie),
      bierstil: suggestion.bierstil,
      flaschenTyp: suggestion.flaschenTyp,
      flaschenfarbe: suggestion.flaschenfarbe,
      glasTyp: suggestion.glasTyp,
      etikettUrl: suggestion.etikettUrl,
      createdAt: new Date().toISOString(),
    });
  }

  return sanitizeDashboardBeers(out);
}

const MAX_LABEL_BYTES = 8 * 1024 * 1024;

function isAlreadyPersistedLabelUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes("/beer-labels/");
  } catch {
    return false;
  }
}

/**
 * Laedt Sortenfoto von der Brauerei-Website, stellt Packshots frei und speichert es dauerhaft
 * in Supabase Storage. Fremd-URLs brechen, sobald die Brauerei ihre Website umbaut.
 * Rueckgabe "" = Bild existiert nicht (404) — besser kein Bild als ein kaputtes.
 */
export async function persistBeerLabelFromUrl(userId: string, sourceUrl: string, part?: ProductImagePart): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) return "";
  if (isAlreadyPersistedLabelUrl(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
    assertSafePublicUrl(parsed);
  } catch {
    return "";
  }

  try {
    const response = await publicFetch(parsed.toString(), {
      maxBytes: MAX_LABEL_BYTES,
      timeoutMs: URL_FETCH_TIMEOUT_MS,
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "image/*" },
    });
    if (response.status === 404 || response.status === 410) return "";
    if (response.status < 200 || response.status >= 300) return trimmed;

    const buffer = response.body;
    if (buffer.byteLength < 32 || buffer.byteLength > MAX_LABEL_BYTES) return trimmed;

    // sharp liest auch AVIF/GIF/falsch deklarierte Dateien; kein Bild → kein Etikett.
    const prepared = await prepareProductImage(buffer, part);
    if (!prepared) return "";

    return await uploadUserImageToStorage({
      userId,
      buffer: prepared.buffer,
      mime: prepared.mime,
      folder: "beer-labels",
    });
  } catch {
    return trimmed;
  }
}

const LABEL_PERSIST_CONCURRENCY = 6;
/** Gesamtes Zeitbudget — Onboarding darf nicht an 64 sequentiellen Downloads scheitern (Vercel 60s). */
const LABEL_PERSIST_BUDGET_MS = 18_000;

export async function persistSuggestedBeerLabels(
  userId: string,
  suggested: SuggestedBeerVariety[],
  options?: { budgetMs?: number; concurrency?: number },
): Promise<SuggestedBeerVariety[]> {
  const budgetMs = options?.budgetMs ?? LABEL_PERSIST_BUDGET_MS;
  const concurrency = Math.max(1, options?.concurrency ?? LABEL_PERSIST_CONCURRENCY);
  const deadline = Date.now() + budgetMs;

  const out: SuggestedBeerVariety[] = suggested.map((beer) => ({
    ...beer,
    etikettUrl: beer.etikettUrl.trim().slice(0, 1200),
  }));

  const pending = out
    .map((beer, index) => ({ index, url: beer.etikettUrl, part: beer.bildTeil }))
    .filter((item) => item.url && !isAlreadyPersistedLabelUrl(item.url));

  // Gebinde-Varianten teilen sich ein Bild — nur einmal laden und hochladen.
  const byUrl = new Map<string, Promise<string>>();
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      if (Date.now() >= deadline) return;
      const current = pending[cursor++];
      if (!current) return;
      const key = current.part ? `${current.url}#${current.part.rank}/${current.part.of}` : current.url;
      if (!byUrl.has(key)) byUrl.set(key, persistBeerLabelFromUrl(userId, current.url, current.part));
      const persisted = await byUrl.get(key)!;
      out[current.index] = {
        ...out[current.index]!,
        etikettUrl: persisted.slice(0, 1200),
      };
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
