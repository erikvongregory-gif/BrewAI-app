import { getDashboardMetadata, type DashboardSettings } from "@/lib/dashboard/metadata";
import {
  BRAND_EVIDENCE_FIELDS,
  EVIDENCE_STATUS,
  isHardEvidence,
  type BrandEvidenceField,
  type EvidenceStatus,
} from "@/lib/brand/brand-evidence-model";

export type BrandProfileSource = "url" | "instagram" | "manual" | "skip";

/** Belegstatus je Profilfeld (Scanner-Belegmodell bzw. „vom Nutzer bestätigt“). Altbestand: fehlt. */
export type BrandFieldStatusMap = Partial<Record<BrandEvidenceField, EvidenceStatus>>;

export type BrandProfile = {
  brandProfileMode: "undecided" | "guided" | "skip";
  brandInstagramUrl: string;
  brandWebsiteUrl: string;
  brandProfileSource: BrandProfileSource;
  brandLockLevel: "strict" | "balanced" | "loose";
  breweryName: string;
  brandTone: string;
  brandColors: string;
  brandDos: string;
  brandDonts: string;
  brandReferenceImageUrls: string[];
  /** Bester Packshot/Etikett-Traeger aus der Analyse — Quelle fuer Etikett-Treue, NICHT fuer Bildsprache. */
  brandLabelReferenceUrl: string;
  brandHeadlineFontName: string;
  brandFontFileUrl: string;
  brandFontWeight: string;
  /**
   * Optional: Belegstatus je Feld. Fehlt (Altbestand) → alle Felder wirken wie bisher.
   * Vorhanden → nur `belegt`/`bestaetigt` sind harte Vorgaben, Rest nur weiche Hinweise.
   */
  brandFieldStatus?: BrandFieldStatusMap;
};

/** Tolerant: unbekannte Felder/Werte werden ignoriert, leere Karte → undefined. */
export function parseBrandFieldStatus(value: unknown): BrandFieldStatusMap | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const out: BrandFieldStatusMap = {};
  for (const field of BRAND_EVIDENCE_FIELDS) {
    const status = raw[field];
    if (typeof status === "string" && (EVIDENCE_STATUS as readonly string[]).includes(status)) {
      out[field] = status as EvidenceStatus;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
}

function asBrandProfileMode(value: unknown): BrandProfile["brandProfileMode"] {
  if (value === "guided" || value === "skip" || value === "undecided") return value;
  return "undecided";
}

function asBrandLockLevel(value: unknown): BrandProfile["brandLockLevel"] {
  if (value === "strict" || value === "balanced" || value === "loose") return value;
  return "strict";
}

function asBrandProfileSource(value: unknown): BrandProfileSource {
  if (value === "url" || value === "instagram" || value === "manual" || value === "skip") return value;
  return "manual";
}

export function getBrandProfileFromMetadata(userMetadata: unknown): BrandProfile {
  const dashboard = getDashboardMetadata(userMetadata);
  const settings = dashboard.settings as Record<string, unknown> | undefined;
  const brandFieldStatus = parseBrandFieldStatus(settings?.brandFieldStatus);
  return {
    ...(brandFieldStatus ? { brandFieldStatus } : {}),
    brandProfileMode: asBrandProfileMode(settings?.brandProfileMode),
    brandInstagramUrl: asString(settings?.brandInstagramUrl),
    brandWebsiteUrl: asString(settings?.brandWebsiteUrl),
    brandProfileSource: asBrandProfileSource(settings?.brandProfileSource),
    brandLockLevel: asBrandLockLevel(settings?.brandLockLevel),
    breweryName: asString(settings?.breweryName),
    brandTone: asString(settings?.brandTone),
    brandColors: asString(settings?.brandColors),
    brandDos: asString(settings?.brandDos),
    brandDonts: asString(settings?.brandDonts),
    brandReferenceImageUrls: asStringArray(settings?.brandReferenceImageUrls),
    brandLabelReferenceUrl: asString(settings?.brandLabelReferenceUrl),
    brandHeadlineFontName: asString(settings?.brandHeadlineFontName),
    brandFontFileUrl: asString(settings?.brandFontFileUrl),
    brandFontWeight: asString(settings?.brandFontWeight) || "700",
  };
}

/**
 * Minimaldatensatz fuer „complete“:
 * - Mode `skip` zaehlt unabhaengig von Feldern als complete (User hat sich bewusst dagegen entschieden).
 * - Sonst muessen alle 5 Brand-Textfelder ausgefuellt sein (nach trim).
 *
 * Referenzbilder sind NICHT teil der Completeness — sie sind optional und
 * werden separat ueber `brandReferenceImagesStale` getrackt.
 */
export function isBrandProfileComplete(profile: BrandProfile): boolean {
  if (profile.brandProfileMode === "skip") return true;
  return Boolean(
    profile.breweryName &&
      profile.brandTone &&
      profile.brandColors &&
      profile.brandDos &&
      profile.brandDonts,
  );
}

/**
 * Strukturell identische Pruefung fuer Settings-Payloads (Client-seitig).
 * Adapter um Duplikation in Komponenten zu vermeiden.
 */
export function isBrandProfileCompleteFromSettings(
  settings: {
    brandProfileMode?: BrandProfile["brandProfileMode"];
    breweryName?: string;
    brandWebsiteUrl?: string;
    brandTone?: string;
    brandColors?: string;
    brandDos?: string;
    brandDonts?: string;
  } | null,
): boolean {
  if (!settings) return false;
  // ponytail: gleiche Regel wie isBrandProfileComplete — Website ersetzt keinen Brauereinamen
  return isBrandProfileComplete({
    brandProfileMode: settings.brandProfileMode ?? "undecided",
    brandInstagramUrl: "",
    brandWebsiteUrl: settings.brandWebsiteUrl ?? "",
    brandProfileSource: "manual",
    brandLockLevel: "strict",
    breweryName: settings.breweryName ?? "",
    brandTone: settings.brandTone ?? "",
    brandColors: settings.brandColors ?? "",
    brandDos: settings.brandDos ?? "",
    brandDonts: settings.brandDonts ?? "",
    brandReferenceImageUrls: [],
    brandLabelReferenceUrl: "",
    brandHeadlineFontName: "",
    brandFontFileUrl: "",
    brandFontWeight: "700",
  });
}

/** „Kampagnenbild mit Text“ nur mit aktivem, ausgefülltem Markenprofil (nicht Modus „ohne Profil“). */
export function canUseCampaignWithTextProfile(profile: BrandProfile): boolean {
  return profile.brandProfileMode === "guided" && isBrandProfileComplete(profile);
}

/** Sichtbar „Markenstil aktiv“ — gleiche Logik wie Markenprofil-Ansicht (Textprofil), unabhängig vom Referenzbild. */
export function isBrandProfileActive(profile: BrandProfile): boolean {
  if (profile.brandProfileMode === "skip" || profile.brandProfileMode === "undecided") return false;
  return isBrandProfileComplete(profile);
}

/** Entfernt gespeichertes Markenprofil und schaltet auf generische Generierung (Modus „skip“). */
export function buildGenericBrandProfilePatch(): Partial<DashboardSettings> {
  return {
    brandProfileMode: "skip",
    brandProfileSource: "skip",
    brandInstagramUrl: "",
    brandWebsiteUrl: "",
    brandTone: "",
    brandColors: "",
    brandDos: "",
    brandDonts: "",
    brandReferenceImageUrls: [],
    brandLabelReferenceUrl: "",
    brandHeadlineFontName: "",
    brandFontFileUrl: "",
    brandFontWeight: "700",
    brandLockLevel: "strict",
    brandAnalyzedAt: "",
    brandFieldStatus: undefined,
  };
}

/**
 * Baut den Markenprofil-Block fuer Generierungs-Prompts (Claude-Prompt-Erzeugung
 * UND direkte Bild-Prompts). Grundsaetze:
 * - Nur Modus `guided` liefert Kontext. `skip`/`undecided` => leerer String,
 *   damit generische Generierungen keinen leeren "MANDATORY"-Block bekommen.
 * - Nur gefuellte Felder werden aufgenommen (keine leeren Zeilen wie "Brand tone: ").
 * - `brandLockLevel` steuert die Verbindlichkeit (vorher stand immer MANDATORY da).
 * - Keine URLs im Prompt: Bildmodelle koennen sie nicht abrufen, sie sind Rauschen.
 */
export function buildBrandProfilePromptContext(profile: BrandProfile): string {
  if (profile.brandProfileMode !== "guided") return "";

  const entries: Array<{ field: BrandEvidenceField; line: string }> = [
    { field: "breweryName" as const, line: profile.breweryName ? `- Brand/Brewery: ${profile.breweryName}` : "" },
    { field: "brandTone" as const, line: profile.brandTone ? `- Brand tone & character: ${profile.brandTone}` : "" },
    { field: "brandColors" as const, line: profile.brandColors ? `- Brand color palette: ${profile.brandColors}` : "" },
    { field: "brandDos" as const, line: profile.brandDos ? `- Visual style, always: ${profile.brandDos}` : "" },
    { field: "brandDonts" as const, line: profile.brandDonts ? `- Visual style, never: ${profile.brandDonts}` : "" },
  ].filter((entry) => entry.line);
  if (entries.length === 0) return "";

  // Belegmodell vorhanden: Unbestätigte KI-Schätzungen dürfen keine harten Vorgaben sein.
  const status = profile.brandFieldStatus;
  const isSoft = (field: BrandEvidenceField) => Boolean(status) && !isHardEvidence(status?.[field]);
  const facts = entries.filter((entry) => !isSoft(entry.field)).map((entry) => entry.line);
  const softFacts = entries.filter((entry) => isSoft(entry.field)).map((entry) => entry.line);
  const softBlock = softFacts.length
    ? ["Unconfirmed brand hints (soft inspiration only, never override the creative brief or the product references):", ...softFacts]
    : [];
  if (facts.length === 0) return softBlock.join("\n");

  const level = profile.brandLockLevel;
  const header =
    level === "strict"
      ? "Brand profile (STRICT lock, mandatory): every output must match this brand profile exactly."
      : level === "balanced"
        ? "Brand profile (BALANCED lock, guardrails): keep tone, colors and overall look clearly on-brand; scene and composition may vary creatively."
        : "Brand profile (LOOSE lock, inspiration): use this profile as loose stylistic inspiration; the creative brief takes priority.";
  const conflictRule =
    level === "strict"
      ? "If the creative brief conflicts with this brand profile, the brand profile wins."
      : level === "balanced"
        ? "If the creative brief conflicts with this profile, keep brand tone and colors intact and follow the brief otherwise."
        : profile.brandDonts && !isSoft("brandDonts")
          ? 'Only the "never" rules above are binding; adapt everything else freely to the brief.'
          : "Nothing here is strictly binding; the creative brief always wins.";

  return [header, ...facts, conflictRule, ...softBlock].join("\n");
}
