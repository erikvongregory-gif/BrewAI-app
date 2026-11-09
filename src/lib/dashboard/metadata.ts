import { correctAlcoholFreeStyle } from "@/app/(dashboard)/inhalte-erstellen/lib/beer-styles";
import type { BrandEvidenceField, EvidenceStatus } from "@/lib/brand/brand-evidence-model";
import { sanitizeStudioOnboardingState, type StudioOnboardingState } from "@/lib/dashboard/onboarding";

export type DashboardMediaItem = {
  id: string;
  imageUrl: string;
  /** Kleines WebP-Vorschaubild für Kacheln; fehlt bei älteren Einträgen. */
  thumbUrl?: string;
  /** Nutzerdefinierter Motiv-Titel (z. B. „Hefeweizen · Hero-Glas · Public Viewing“). */
  title?: string;
  prompt: string;
  createdAt: string;
  aspectRatio: string;
  resolution: "1K" | "2K" | "4K";
  outputFormat: "png" | "jpg";
  /** Fotostil aus dem Studio; fehlt bei älteren Einträgen. */
  photoStyle?: "reportage" | "premium" | "campaign";
  /** Gewählte Biersorte beim Generieren; fehlt bei älteren Einträgen. */
  beerName?: string;
  beerId?: string;
};

export function mediaPhotoStyleLabel(
  photoStyle: DashboardMediaItem["photoStyle"] | null | undefined,
): string | null {
  if (photoStyle === "campaign") return "Kampagne";
  if (photoStyle === "premium") return "Premium";
  if (photoStyle === "reportage") return "Reportage";
  return null;
}

export function getMediaDisplayTitle(item: Pick<DashboardMediaItem, "title" | "prompt">): string {
  const custom = item.title?.trim();
  if (custom && !looksLikeGenerationPrompt(custom)) return custom;
  const fallback = item.prompt?.trim();
  if (fallback && !looksLikeGenerationPrompt(fallback)) return fallback;
  return "Unbenanntes Motiv";
}

/** Alte Einträge speicherten oft den EN-Prompt als Titel — nicht in der UI zeigen. */
function looksLikeGenerationPrompt(text: string): boolean {
  if (/\b(SCENE:|SHOT:|photorealistic|FORBIDDEN|Image 1|GLASS BRAND)\b/i.test(text)) return true;
  if (text.includes("\n")) return true;
  if (text.length > 70 && !text.includes(" · ") && (text.match(/,/g)?.length ?? 0) >= 3) return true;
  return false;
}

/** Vierstellige CHARGE-Nummer für Dashboard-/Medien-Badges (z. B. 42 → „0042“). */
export function formatChargeNumber(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 1) return null;
  return String(Math.floor(n)).padStart(4, "0");
}

export const PRODUKT_KATEGORIEN = ["bier", "limonade", "tafelwasser", "mineralwasser"] as const;
export type ProduktKategorie = (typeof PRODUKT_KATEGORIEN)[number];

export const GETRANKEART_OPTIONS: Array<{ id: ProduktKategorie; label: string }> = [
  { id: "bier", label: "Bier" },
  { id: "limonade", label: "Limonade" },
  { id: "tafelwasser", label: "Tafelwasser" },
  { id: "mineralwasser", label: "Mineralwasser" },
];

export function sanitizeProduktKategorie(value: unknown): ProduktKategorie {
  return value === "limonade" || value === "tafelwasser" || value === "mineralwasser" ? value : "bier";
}

export function produktKategorieLabel(kategorie: ProduktKategorie): string {
  return GETRANKEART_OPTIONS.find((option) => option.id === kategorie)?.label ?? "Bier";
}

/**
 * Ein Bier aus dem Sortiment der Brauerei ("Meine Biere") — einmal angelegt,
 * belegt es im Erstell-Flow Bierstil, Flasche, Farbe und Etikett per Klick vor.
 */
export type DashboardBeer = {
  id: string;
  name: string;
  /** Getränkekategorie; Altbestand ohne Feld gilt als Bier. */
  produktKategorie?: ProduktKategorie;
  /** Bierstil-Code, z. B. "helles", "pils" (siehe WAS_OPTIONS im Erstell-Flow). */
  bierstil: string;
  /** Flaschentyp-Code, z. B. "nrw_500" (siehe FLASCHEN_TYPEN). */
  flaschenTyp: string;
  flaschenfarbe: "braun" | "gruen" | "klar";
  /** Bevorzugtes Servierglas, z. B. "masskrug", "willibecher" (siehe GLAS_TYPEN). */
  glasTyp?: string;
  /**
   * Filtrierung der Sorte — steuert die Bierklarheit in der Bildgenerierung.
   * `unfiltriert` → naturtrüb; `filtriert` → klar. Fehlt bei Altbestand.
   */
  filtrierung?: "filtriert" | "unfiltriert";
  /** HTTPS-URL des Sorten-Etiketts (nie Base64 — JWT/Cookie-Limit). */
  etikettUrl: string;
  createdAt: string;
  /** Beleg des Sortennamens aus dem Website-Scan. Fehlt bei Altbestand und manuell angelegten Sorten. */
  nachweisStatus?: "belegt" | "unbestaetigt";
  /** false = Bierstil beim Scan nicht belegt („helles“ ist dann nur Standard). Fehlt = unbekannt/Altbestand. */
  bierstilBelegt?: boolean;
  /** true = vom Nutzer angelegt oder bearbeitet. Ein erneuter Scan derselben Marke überschreibt die Sorte nicht. */
  nutzerBestaetigt?: boolean;
};

/** Obergrenze pro Brauerei. Die Datensätze liegen in public.dashboard_beers. */
export const MAX_MY_BEERS = 64;

/**
 * Wiederverwendbare Personen-Identität am Markenprofil (optional).
 * Fotos einmal hinterlegen, dann im Erstell-Flow auswählen.
 */
export type DashboardCharacter = {
  id: string;
  name: string;
  /** Rolle, z. B. „Braumeister“. */
  role: string;
  /** HTTPS-URLs der Referenzfotos (nie Base64). */
  referenceImageUrls: string[];
  /**
   * Higgsfield-Style Appearance Lock: Textbeschreibung aus den Fotos.
   * Wird an OpenAI geschickt statt Gesichtsfotos (OpenAI lehnt Face-Identity ab).
   */
  appearanceLock: string;
  createdAt: string;
};

export const MAX_MY_CHARACTERS = 16;
export const MAX_CHARACTER_REFERENCE_IMAGES = 8;

export function sanitizeDashboardCharacters(value: unknown): DashboardCharacter[] {
  if (!Array.isArray(value)) return [];
  const out: DashboardCharacter[] = [];
  for (const raw of value) {
    const item = asObj(raw);
    const id = typeof item.id === "string" ? item.id.trim().slice(0, 64) : "";
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 80) : "";
    if (!id || !name) continue;
    const urls = Array.isArray(item.referenceImageUrls)
      ? item.referenceImageUrls
          .filter((u): u is string => typeof u === "string")
          .map((u) => u.trim().slice(0, 2500))
          .filter(Boolean)
          .slice(0, MAX_CHARACTER_REFERENCE_IMAGES)
      : [];
    out.push({
      id,
      name,
      role: typeof item.role === "string" ? item.role.trim().slice(0, 60) : "",
      referenceImageUrls: urls,
      appearanceLock:
        typeof item.appearanceLock === "string" ? item.appearanceLock.trim().slice(0, 600) : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt.slice(0, 40) : "",
    });
    if (out.length >= MAX_MY_CHARACTERS) break;
  }
  return out;
}


/** KIE-Temp-URLs sind oft tot oder vom Server nicht ladbar — Etikett dann neu hochladen. */
export function hasUsableBeerEtikett(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return !host.includes("redpandaai.co") && !host.includes("tempfile.");
  } catch {
    return false;
  }
}

export function sanitizeDashboardBeers(value: unknown): DashboardBeer[] {
  if (!Array.isArray(value)) return [];
  const out: DashboardBeer[] = [];
  for (const raw of value) {
    const item = asObj(raw);
    const id = typeof item.id === "string" ? item.id.trim().slice(0, 64) : "";
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 80) : "";
    if (!id || !name) continue;
    const produktKategorie = sanitizeProduktKategorie(item.produktKategorie);
    const storedStil =
      typeof item.bierstil === "string" && item.bierstil.trim()
        ? item.bierstil.trim().slice(0, 60)
        : produktKategorie === "bier"
          ? "helles"
          : produktKategorie;
    const storedGlas =
      typeof item.glasTyp === "string" && item.glasTyp.trim() ? item.glasTyp.trim().slice(0, 40) : undefined;
    // Altbestand: „Hell Alkoholfrei“ war als Alkoholfrei-Pils mit Pilstulpe gespeichert.
    const style =
      produktKategorie === "bier"
        ? correctAlcoholFreeStyle(storedStil, storedGlas, name)
        : { bierstil: storedStil, glasTyp: storedGlas };
    out.push({
      id,
      name,
      produktKategorie,
      bierstil: style.bierstil,
      flaschenTyp:
        typeof item.flaschenTyp === "string" && item.flaschenTyp.trim() ? item.flaschenTyp.trim().slice(0, 60) : "nrw_500",
      flaschenfarbe:
        item.flaschenfarbe === "gruen" || item.flaschenfarbe === "klar"
          ? item.flaschenfarbe
          : produktKategorie === "bier"
            ? "braun"
            : "klar",
      glasTyp: style.glasTyp,
      filtrierung:
        item.filtrierung === "unfiltriert" || item.filtrierung === "filtriert" ? item.filtrierung : undefined,
      etikettUrl: typeof item.etikettUrl === "string" ? item.etikettUrl.trim().slice(0, 1200) : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt.slice(0, 40) : "",
      ...(item.nachweisStatus === "belegt" || item.nachweisStatus === "unbestaetigt"
        ? { nachweisStatus: item.nachweisStatus }
        : {}),
      ...(typeof item.bierstilBelegt === "boolean" ? { bierstilBelegt: item.bierstilBelegt } : {}),
      ...(item.nutzerBestaetigt === true ? { nutzerBestaetigt: true } : {}),
    });
    if (out.length >= MAX_MY_BEERS) break;
  }
  return out;
}

/** Felder, deren Änderung durch den Nutzer eine Sorte als „vom Nutzer bestätigt“ markiert. */
const USER_EDITABLE_BEER_FIELDS = [
  "name",
  "produktKategorie",
  "bierstil",
  "flaschenTyp",
  "flaschenfarbe",
  "glasTyp",
  "filtrierung",
  "etikettUrl",
] as const;

/**
 * Für Schreibzugriffe aus der Sortimentsverwaltung: Neue oder geänderte Sorten gelten als vom Nutzer
 * bestätigt. Unveränderte Sorten behalten die gespeicherten Scan-Belege (das API-Schema kennt diese
 * Felder nicht und würde sie sonst bei jedem Speichern verwerfen).
 */
export function markUserEditedBeers(incoming: DashboardBeer[], stored: DashboardBeer[]): DashboardBeer[] {
  const storedById = new Map(sanitizeDashboardBeers(stored).map((beer) => [beer.id, beer] as const));
  return sanitizeDashboardBeers(incoming).map((beer) => {
    const previous = storedById.get(beer.id);
    if (!previous) return { ...beer, nutzerBestaetigt: true };
    const changed = USER_EDITABLE_BEER_FIELDS.some((field) => (beer[field] ?? "") !== (previous[field] ?? ""));
    return {
      ...beer,
      ...(previous.nachweisStatus ? { nachweisStatus: previous.nachweisStatus } : {}),
      ...(typeof previous.bierstilBelegt === "boolean" ? { bierstilBelegt: previous.bierstilBelegt } : {}),
      ...(changed || previous.nutzerBestaetigt ? { nutzerBestaetigt: true } : {}),
    };
  });
}

export type DashboardTeamRole = "owner" | "admin" | "editor" | "viewer";

export type DashboardTeamMember = {
  id: string;
  email: string;
  name: string;
  role: DashboardTeamRole;
  status: "active" | "invited";
  invitedAt: string;
};

export type DashboardSettings = {
  profileName: string;
  breweryName: string;
  profilePhone: string;
  /** Signierte Storage-URL (oder OAuth-Bild) für das persönliche Profilbild. */
  profileAvatarUrl: string;
  emailNotifications: boolean;
  weeklySummary: boolean;
  brandProfileMode: "undecided" | "guided" | "skip";
  brandInstagramUrl: string;
  brandWebsiteUrl: string;
  brandProfileSource: "url" | "instagram" | "manual" | "skip";
  brandLockLevel: "strict" | "balanced" | "loose";
  brandTone: string;
  brandColors: string;
  brandDos: string;
  brandDonts: string;
  brandReferenceImageUrls: string[];
  /** Bester Packshot (Etikett-Traeger) aus der Analyse — fuer Etikett-Treue bei der Generierung. */
  brandLabelReferenceUrl: string;
  /** ISO-Zeitstempel der letzten Website-/Marken-Analyse */
  brandAnalyzedAt?: string;
  /** Anzeigename der Marken-Headline-Schrift (Social/Kampagnen-Overlay). */
  brandHeadlineFontName: string;
  /** Öffentliche URL zur hochgeladenen Schriftdatei (.woff2/.woff/.ttf/.otf). */
  brandFontFileUrl: string;
  /** CSS font-weight für Headlines, z. B. 700. */
  brandFontWeight: string;
  /**
   * Belegstatus je Markenfeld (Scanner bzw. „vom Nutzer bestätigt“). Optional: Altbestand ohne Feld
   * verhält sich wie bisher (alle Felder harte Vorgaben).
   */
  brandFieldStatus?: Partial<Record<BrandEvidenceField, EvidenceStatus>>;
};

export type DashboardMetadata = {
  mediaLibrary?: DashboardMediaItem[];
  teamMembers?: DashboardTeamMember[];
  settings?: DashboardSettings;
  onboarding?: StudioOnboardingState;
  myBeers?: DashboardBeer[];
};

function asObj(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function getDashboardMetadata(userMetadata: unknown): DashboardMetadata {
  const base = asObj(userMetadata);
  const dashboard = asObj(base.dashboard);
  const rawMedia = Array.isArray(dashboard.mediaLibrary)
    ? (dashboard.mediaLibrary as DashboardMediaItem[])
    : [];
  const mediaLibrary = rawMedia
    .map((item) => {
      const prompt = String(item.prompt ?? "").slice(0, 800);
      const titleRaw = String(item.title ?? "").trim().slice(0, 120);
      return {
        ...item,
        prompt,
        title: titleRaw || undefined,
        imageUrl: String(item.imageUrl ?? "").slice(0, 1200),
      };
    })
    .slice(0, 12);

  const rawTeam = Array.isArray(dashboard.teamMembers)
    ? (dashboard.teamMembers as DashboardTeamMember[])
    : [];
  const teamMembers = rawTeam.slice(0, 20);

  return {
    mediaLibrary,
    teamMembers,
    settings: asObj(dashboard.settings) as DashboardSettings,
    onboarding: sanitizeStudioOnboardingState(dashboard.onboarding),
    myBeers: sanitizeDashboardBeers(dashboard.myBeers),
  };
}

export function mergeDashboardMetadata(
  userMetadata: unknown,
  patch: Partial<DashboardMetadata>,
): Record<string, unknown> {
  const base = asObj(userMetadata);
  const dashboard = asObj(base.dashboard);
  return {
    ...base,
    dashboard: {
      ...dashboard,
      ...patch,
    },
  };
}
