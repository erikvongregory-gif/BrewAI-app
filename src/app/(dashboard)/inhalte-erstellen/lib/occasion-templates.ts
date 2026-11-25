import type { HyperrealisticInput } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";

/**
 * Anlass-Vorlagen fuer den Erstell-Flow: Eine Vorlage belegt alle kreativen
 * Wizard-Entscheidungen vor (Szene, Licht, Personen, Stimmung, Shot, Extras),
 * sodass nur noch Bier + Format gewaehlt werden muss. Saisonale Vorlagen
 * werden nach Kalender priorisiert ("Jetzt aktuell" / "Bald").
 */

export type OccasionPreset = {
  szene: HyperrealisticInput["szene"];
  tageszeit: HyperrealisticInput["tageszeit"];
  stimmungTrend: NonNullable<HyperrealisticInput["stimmungTrend"]>;
  personenModus: NonNullable<HyperrealisticInput["personenModus"]>;
  gruppenAnzahl?: HyperrealisticInput["gruppenAnzahl"];
  gruppenTyp?: HyperrealisticInput["gruppenTyp"];
  gruppenDynamik?: HyperrealisticInput["gruppenDynamik"];
  shotType: NonNullable<HyperrealisticInput["shotType"]>;
  behaelter?: NonNullable<HyperrealisticInput["behaelter"]>;
  extras: string[];
  aspectRatio: HyperrealisticInput["aspectRatio"];
  /** Anlass-spezifischer Zusatz fuer den Prompt (fliesst in zusatzWunsch, EN bevorzugt). */
  promptNote: string;
};

type MonthDay = { month: number; day: number };

export type OccasionTemplate = {
  id: string;
  title: string;
  subtitle: string;
  /** Kurze Motiv-Beschreibung auf der Karte ("Gruppe stoesst an, goldenes Licht"). */
  motifLine: string;
  /** StudioIcon-Name fuer die Kartenmarke. */
  icon: string;
  /** Dezente Akzentleiste (kein Full-Bleed-Gradient). */
  accent: string;
  /** Saisonfenster (inklusive). Ohne Angabe: ganzjaehrig. */
  season?: { start: MonthDay; end: MonthDay };
  preset: OccasionPreset;
};

export type SeasonState = "active" | "upcoming" | "evergreen" | "off";
export type SeasonStatus = { state: SeasonState; daysUntilStart?: number };

const UPCOMING_WINDOW_DAYS = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateAt(year: number, md: MonthDay): Date {
  return new Date(year, md.month - 1, md.day);
}

/** Saison-Status relativ zu `now` — Fenster gelten pro Kalenderjahr. */
export function getSeasonStatus(template: OccasionTemplate, now: Date): SeasonStatus {
  if (!template.season) return { state: "evergreen" };
  const { start, end } = template.season;
  const year = now.getFullYear();
  const today = new Date(year, now.getMonth(), now.getDate());

  for (const y of [year, year + 1]) {
    const startDate = dateAt(y, start);
    const endDate = dateAt(y, end);
    if (today >= startDate && today <= endDate) return { state: "active" };
    if (today < startDate) {
      const daysUntilStart = Math.round((startDate.getTime() - today.getTime()) / DAY_MS);
      if (daysUntilStart <= UPCOMING_WINDOW_DAYS) return { state: "upcoming", daysUntilStart };
      return { state: "off" };
    }
  }
  return { state: "off" };
}

/** Aktive Saison zuerst, dann bald startende, dann ganzjaehrige; Off-Season ans Ende. */
export function sortTemplatesForDate(
  templates: OccasionTemplate[],
  now: Date,
): Array<{ template: OccasionTemplate; status: SeasonStatus }> {
  const rank: Record<SeasonState, number> = { active: 0, upcoming: 1, evergreen: 2, off: 3 };
  return templates
    .map((template) => ({ template, status: getSeasonStatus(template, now) }))
    .sort((a, b) => {
      const byState = rank[a.status.state] - rank[b.status.state];
      if (byState !== 0) return byState;
      if (a.status.state === "upcoming" && b.status.state === "upcoming") {
        return (a.status.daysUntilStart ?? 0) - (b.status.daysUntilStart ?? 0);
      }
      return 0;
    });
}

export function seasonBadgeLabel(status: SeasonStatus): string | null {
  if (status.state === "active") return "Jetzt aktuell";
  if (status.state === "upcoming") {
    const days = status.daysUntilStart ?? 0;
    if (days <= 7) return "Startet diese Woche";
    const weeks = Math.round(days / 7);
    return `In ${weeks} Woche${weeks === 1 ? "" : "n"}`;
  }
  return null;
}

export const OCCASION_TEMPLATES: OccasionTemplate[] = [
  {
    id: "biergarten_sommer",
    title: "Biergarten-Sommer",
    subtitle: "Der Klassiker fürs Feed",
    motifLine: "Gesellige Runde am Holztisch, goldenes Abendlicht, Kastanien",
    icon: "users",
    accent: "#9DB86B",
    season: { start: { month: 5, day: 1 }, end: { month: 9, day: 15 } },
    preset: {
      szene: "biergarten_sommer",
      tageszeit: "goldene_stunde",
      stimmungTrend: "nachhaltig",
      personenModus: "E",
      gruppenAnzahl: "3",
      gruppenTyp: "gemischt",
      gruppenDynamik: "E2",
      shotType: "B",
      extras: ["Brezel · Snack-Beilage", "Kondens­tropfen"],
      aspectRatio: "4:5",
      promptNote: "authentic Bavarian beer garden atmosphere under chestnut trees, string lights softly out of focus",
    },
  },
  {
    id: "feierabend",
    title: "Feierabend-Moment",
    subtitle: "Ruhig, nahbar, jeden Tag postbar",
    motifLine: "Hände öffnen die Flasche auf dem Stadtbalkon, warmes Abendlicht",
    icon: "spark",
    accent: "#E8935A",
    preset: {
      szene: "stadtbalkon_abend",
      tageszeit: "abend_warm",
      stimmungTrend: "modern",
      personenModus: "B",
      shotType: "E",
      extras: ["Kondens­tropfen"],
      aspectRatio: "4:5",
      promptNote: "quiet after-work unwind moment, city bokeh in background, intimate and calm",
    },
  },
  {
    id: "wirtshaus_abend",
    title: "Wirtshaus-Abend",
    subtitle: "Tradition & Gemütlichkeit",
    motifLine: "Entspannte Runde im Wirtshaus, warmes Holz, weiches Licht",
    icon: "users",
    accent: "#C89B5F",
    preset: {
      szene: "wirtshaus_innen",
      tageszeit: "abend_warm",
      stimmungTrend: "nostalgie",
      personenModus: "E",
      gruppenAnzahl: "3",
      gruppenTyp: "gemischt",
      gruppenDynamik: "E3",
      shotType: "B",
      extras: ["Brezel · Snack-Beilage"],
      aspectRatio: "4:5",
      promptNote: "cozy traditional German tavern interior, warm wood panelling, soft tungsten light",
    },
  },
  {
    id: "produkt_neuheit",
    title: "Neuheit ankündigen",
    subtitle: "Hero-Shot für den Launch",
    motifLine: "Flasche als Held im Brauereihof, Premium-Look, klare Bühne",
    icon: "rocket",
    accent: "#C4A574",
    preset: {
      szene: "brauereihof",
      tageszeit: "goldene_stunde",
      stimmungTrend: "premium",
      personenModus: "A",
      behaelter: "F",
      shotType: "C",
      extras: ["Kondens­tropfen", "Bokeh-Hintergrund"],
      aspectRatio: "4:5",
      promptNote: "product launch hero shot, the bottle is the clear protagonist, generous negative space above for announcement copy",
    },
  },
  {
    id: "food_pairing",
    title: "Food-Pairing",
    subtitle: "Bier & Brotzeit",
    motifLine: "Rustikaler Holztisch, Brotzeit-Platte, appetitliches Tageslicht",
    icon: "image",
    accent: "#DFAF63",
    preset: {
      szene: "kueche_zuhause",
      tageszeit: "mittag",
      stimmungTrend: "nachhaltig",
      personenModus: "A",
      shotType: "A",
      extras: ["Brezel · Snack-Beilage", "Wassertropfen am Glas"],
      aspectRatio: "1:1",
      promptNote: "appetizing Bavarian brotzeit spread pairing with the beer, rustic wooden table, food styling quality",
    },
  },
  {
    id: "berg_brotzeit",
    title: "Berg & Gipfelbier",
    subtitle: "Alpen-Panorama",
    motifLine: "Silhouette mit Flasche vor Bergkulisse, klare Luft, Fernblick",
    icon: "globe",
    accent: "#8AA4B4",
    season: { start: { month: 6, day: 1 }, end: { month: 10, day: 15 } },
    preset: {
      szene: "alpenpanorama",
      tageszeit: "mittag",
      stimmungTrend: "aktiv",
      personenModus: "C",
      shotType: "F",
      extras: [],
      aspectRatio: "4:5",
      promptNote: "summit reward moment after a hike, alpine panorama with layered mountain depth, crisp air feeling",
    },
  },
  {
    id: "see_sommer",
    title: "Sommer am See",
    subtitle: "Erfrischung im Sonnenuntergang",
    motifLine: "Freunde am Wasser, Sonnenuntergang, Sommerabend-Vibes",
    icon: "spark",
    accent: "#E08A4A",
    season: { start: { month: 6, day: 1 }, end: { month: 8, day: 31 } },
    preset: {
      szene: "strand_sonnenuntergang",
      tageszeit: "goldene_stunde",
      stimmungTrend: "aktiv",
      personenModus: "E",
      gruppenAnzahl: "4_5",
      gruppenTyp: "gemischt",
      gruppenDynamik: "E4",
      shotType: "H",
      extras: ["Kondens­tropfen"],
      aspectRatio: "9:16",
      promptNote: "summer evening at the lake shore, golden sunset reflections on the water, carefree holiday mood",
    },
  },
  {
    id: "public_viewing",
    title: "Public Viewing",
    subtitle: "Spieltag & Stadion-Stimmung",
    motifLine: "Jubelnde Fans, Gläser hoch, Flutlicht-Atmosphäre",
    icon: "bolt",
    accent: "#6FAE84",
    preset: {
      szene: "fussball_public_viewing",
      tageszeit: "abend_warm",
      stimmungTrend: "aktiv",
      personenModus: "E",
      gruppenAnzahl: "4_5",
      gruppenTyp: "gemischt",
      gruppenDynamik: "E2",
      shotType: "H",
      extras: [],
      aspectRatio: "9:16",
      promptNote: "match day public viewing energy, cheering crowd atmosphere, floodlight glow in the background",
    },
  },
  {
    id: "oktoberfest",
    title: "Festzelt & Wiesn",
    subtitle: "Oktoberfest-Zeit",
    motifLine: "Festzelt-Stimmung, Anstoßen mit Maßkrügen, Wimpel & Lichterketten",
    icon: "users",
    accent: "#A8B4C8",
    season: { start: { month: 9, day: 1 }, end: { month: 10, day: 6 } },
    preset: {
      szene: "wirtshaus_innen",
      tageszeit: "abend_warm",
      stimmungTrend: "nostalgie",
      personenModus: "E",
      gruppenAnzahl: "4_5",
      gruppenTyp: "gemischt",
      gruppenDynamik: "E2",
      shotType: "B",
      extras: ["Brezel · Snack-Beilage"],
      aspectRatio: "4:5",
      promptNote: "festive Bavarian beer tent interior, blue-and-white bunting, garlands and warm festival lights, Oktoberfest cheer",
    },
  },
  {
    id: "winter_weihnachten",
    title: "Winter & Advent",
    subtitle: "Gemütlich durch die kalte Zeit",
    motifLine: "Kerzenlicht, Tannenzweige, winterliche Wirtshaus-Wärme",
    icon: "spark",
    accent: "#C4896A",
    season: { start: { month: 11, day: 15 }, end: { month: 12, day: 26 } },
    preset: {
      szene: "wirtshaus_innen",
      tageszeit: "blaue_stunde",
      stimmungTrend: "nostalgie",
      personenModus: "B",
      shotType: "E",
      extras: [],
      aspectRatio: "4:5",
      promptNote: "cozy winter advent mood, candle light, fir branches and subtle festive decoration, frost on the window",
    },
  },
  {
    id: "vatertag",
    title: "Vatertag-Tour",
    subtitle: "Männertag im Grünen",
    motifLine: "Männerrunde unterwegs, Wiese & Picknick, beste Laune",
    icon: "users",
    accent: "#8FA86A",
    season: { start: { month: 5, day: 1 }, end: { month: 5, day: 31 } },
    preset: {
      szene: "wiese_picknick",
      tageszeit: "mittag",
      stimmungTrend: "aktiv",
      personenModus: "E",
      gruppenAnzahl: "4_5",
      gruppenTyp: "maenner",
      gruppenDynamik: "E4",
      shotType: "F",
      extras: ["Wiesenblumen dezent"],
      aspectRatio: "4:5",
      // Maßvoller Genuss statt Bollerwagen-Gelage (Werberat 1.1/2.2) — Fachkorrektur Audit 05.
      promptNote:
        "Father's Day outing, adult friends (clearly 30+) on a relaxed countryside walk with a picnic, one beer each, moderate enjoyment, no crates on a handcart, no drunkenness",
    },
  },
  {
    id: "tag_des_bieres",
    title: "Tag des Bieres",
    subtitle: "23. April · Reinheitsgebot",
    motifLine: "Handwerk & Stolz im Brauereihof, ehrliches Produkt",
    icon: "brand",
    accent: "#C4A574",
    season: { start: { month: 4, day: 9 }, end: { month: 4, day: 23 } },
    preset: {
      szene: "brauereihof",
      tageszeit: "mittag",
      stimmungTrend: "nostalgie",
      personenModus: "A",
      shotType: "A",
      extras: ["Hopfen im Bild"],
      aspectRatio: "1:1",
      promptNote: "German Beer Day pride, brewing craftsmanship heritage, honest product presentation in the brewery yard",
    },
  },
];
