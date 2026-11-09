export const FALLBACK_SWATCHES = ["#E8772E", "#6B4423", "#F4EFE6", "#3D5C45", "#2A1F14"];

export function parseHexSwatches(text: string): string[] {
  const hex = [...text.matchAll(/#(?:[0-9a-fA-F]{3}){1,2}\b/g)].map((m) => m[0]);
  if (hex.length >= 2) return hex.slice(0, 8);
  return FALLBACK_SWATCHES;
}

export function parseToneTags(tone: string): string[] {
  const raw = tone
    .split(/[,;·|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (raw.length >= 2) return raw.slice(0, 12);
  if (tone.trim()) return [tone.trim()];
  return [];
}

export function parseRuleSentences(text: string): string[] {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

export function formatConfidenceLabel(confidence?: string): string | null {
  if (!confidence?.trim()) return null;
  const c = confidence.trim().toLowerCase();
  if (c === "high" || c === "hoch") return "Konfidenz: Hoch";
  if (c === "medium" || c === "mittel") return "Konfidenz: Mittel";
  if (c === "low" || c === "niedrig") return "Konfidenz: Niedrig";
  return `Konfidenz: ${confidence}`;
}

export function brandLockLabel(level: "strict" | "balanced" | "loose"): string {
  if (level === "strict") return "Streng";
  if (level === "balanced") return "Ausgewogen";
  return "Frei";
}

export type ProfileStrength = {
  percent: number;
  label: "Sehr stark" | "Stark" | "Solide" | "Ausbaufähig";
};

function countRealHexColors(text: string): number {
  return [...text.matchAll(/#(?:[0-9a-fA-F]{3}){1,2}\b/g)].length;
}

/**
 * Bewertet, wie tragfaehig ein Markenprofil fuer die Bildgenerierung ist (0–100).
 * Rein informativ — blockiert nichts, gibt dem Kunden aber sofort Vertrauen und
 * zeigt, wo sich Nachschaerfen lohnt.
 */
export function computeProfileStrength(profile: {
  breweryName: string;
  brandTone: string;
  brandColors: string;
  brandDos: string;
  brandDonts: string;
  referenceImageCount?: number;
}): ProfileStrength {
  const toneTags = profile.brandTone.trim() ? parseToneTags(profile.brandTone).length : 0;
  const hexColors = countRealHexColors(profile.brandColors);
  const dosSentences = parseRuleSentences(profile.brandDos).length;
  const dontsSentences = parseRuleSentences(profile.brandDonts).length;
  const refs = profile.referenceImageCount ?? 0;

  let percent = 0;
  if (profile.breweryName.trim()) percent += 20;
  percent += toneTags >= 3 ? 20 : toneTags >= 1 ? 12 : 0;
  percent += hexColors >= 4 ? 20 : hexColors >= 2 ? 14 : hexColors >= 1 ? 8 : 0;
  percent += dosSentences >= 2 ? 15 : dosSentences >= 1 ? 9 : 0;
  percent += dontsSentences >= 1 ? 15 : 0;
  percent += refs >= 3 ? 10 : refs >= 1 ? 6 : 0;

  const label: ProfileStrength["label"] =
    percent >= 85 ? "Sehr stark" : percent >= 65 ? "Stark" : percent >= 40 ? "Solide" : "Ausbaufähig";

  return { percent, label };
}

const EVIDENCE_FIELD_LABEL = {
  breweryName: "Markenname",
  brandTone: "Tonalität",
  brandColors: "Farben",
  brandDos: "Bildregeln (immer)",
  brandDonts: "Bildregeln (nie)",
  label: "Etikett-Foto",
} as const;

export type FieldEvidenceSummary = {
  feld: keyof typeof EVIDENCE_FIELD_LABEL;
  label: string;
  /** Kurzer Satz für Brauerei-Mitarbeiter ohne Technikkenntnisse. */
  text: string;
  /** ok = belegt/bestätigt, pruefen = KI-Schätzung, fehlt = nichts gefunden. */
  ton: "ok" | "pruefen" | "fehlt";
};

/** Herkunft eines Profilfelds in verständlichem Deutsch (Prüfschritt im Markenprofil). */
export function describeFieldEvidence(evidence: {
  feld: keyof typeof EVIDENCE_FIELD_LABEL;
  status: "belegt" | "geschaetzt" | "fehlt" | "bestaetigt";
  quellen: Array<{ art: string; auszug?: string }>;
  hinweis?: string;
}): FieldEvidenceSummary {
  const label = EVIDENCE_FIELD_LABEL[evidence.feld];
  const first = evidence.quellen[0];
  if (evidence.status === "bestaetigt") return { feld: evidence.feld, label, text: "Von dir bestätigt", ton: "ok" };
  if (evidence.status === "fehlt") {
    return { feld: evidence.feld, label, text: evidence.hinweis ?? "Nicht gefunden", ton: "fehlt" };
  }
  if (evidence.status === "belegt") {
    const where =
      first?.art === "css"
        ? "im Farbcode der Website gefunden"
        : first?.art === "seitentitel"
          ? "im Seitentitel der Website gefunden"
          : first?.art === "etikett"
            ? "Produktfoto von der Website"
            : "auf der Website gefunden";
    const excerpt = first?.auszug && first.art !== "css" ? ` („${first.auszug.slice(0, 60)}${first.auszug.length > 60 ? "…" : ""}“)` : "";
    return {
      feld: evidence.feld,
      label,
      text: `${where[0]!.toUpperCase()}${where.slice(1)}${excerpt}${evidence.hinweis ? ` · ${evidence.hinweis}` : ""}`,
      ton: "ok",
    };
  }
  return {
    feld: evidence.feld,
    label,
    text: evidence.hinweis ?? "Einschätzung der KI – bitte prüfen",
    ton: "pruefen",
  };
}

const ACTIVATION_TEXT_FIELDS = ["breweryName", "brandTone", "brandColors", "brandDos", "brandDonts"] as const;
type ActivationTextField = (typeof ACTIVATION_TEXT_FIELDS)[number];
type ActivationStatus = "belegt" | "geschaetzt" | "fehlt" | "bestaetigt";

/**
 * Belegstatus beim Aktivieren: Felder, die der Nutzer im Prüfschritt geändert hat, gelten als „bestaetigt“,
 * unveränderte behalten den Status aus dem Scan. Ohne Scan-Belege → undefined (bisheriges Verhalten).
 */
export function buildFieldStatusForActivation(params: {
  evidence: Array<{ feld: string; status: ActivationStatus }> | null | undefined;
  scanned: Record<ActivationTextField, string> | null | undefined;
  current: Record<ActivationTextField, string>;
}): Partial<Record<ActivationTextField | "label", ActivationStatus>> | undefined {
  if (!params.evidence?.length || !params.scanned) return undefined;
  const byField = new Map(params.evidence.map((entry) => [entry.feld, entry.status] as const));
  const out: Partial<Record<ActivationTextField | "label", ActivationStatus>> = {};
  for (const field of ACTIVATION_TEXT_FIELDS) {
    const changed = params.current[field].trim() !== params.scanned[field].trim();
    out[field] = changed && params.current[field].trim() ? "bestaetigt" : (byField.get(field) ?? "geschaetzt");
  }
  const label = byField.get("label");
  if (label) out.label = label;
  return out;
}
