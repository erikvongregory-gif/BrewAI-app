import { z } from "zod";

/**
 * Belegmodell des Markenscanners.
 *
 * Jedes Merkmal bekommt einen Status:
 * - `belegt`      – im Quelltext der Website gefunden (Text, Seitentitel, CSS, Dateiname, Etikett-Bild) – mit Fundstelle.
 * - `geschaetzt`  – plausible KI-Einschätzung (z. B. Tonalität, Bildregeln, aus Bildern abgelesene Farben), nicht nachgeprüft.
 * - `fehlt`       – keine Quelle gefunden.
 * - `bestaetigt`  – vom Nutzer geprüft/korrigiert (wird nur von der Oberfläche gesetzt, nie vom Scanner).
 *
 * Vertrauen wird ausschließlich aus Anzahl und Art der Belege abgeleitet (siehe `evidenceStrength`),
 * es gibt bewusst keine Prozentwerte.
 */

export const EVIDENCE_STATUS = ["belegt", "geschaetzt", "fehlt", "bestaetigt"] as const;
export const evidenceStatusSchema = z.enum(EVIDENCE_STATUS);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const EVIDENCE_SOURCE_KINDS = [
  "website_text",
  "seitentitel",
  "css",
  "dateiname",
  "bild",
  "etikett",
  "ki_schaetzung",
  "nutzer",
] as const;

export const evidenceSourceSchema = z.object({
  art: z.enum(EVIDENCE_SOURCE_KINDS),
  url: z.string().max(1200).optional(),
  auszug: z.string().max(200).optional(),
});
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const BRAND_EVIDENCE_FIELDS = ["breweryName", "brandTone", "brandColors", "brandDos", "brandDonts", "label"] as const;
export type BrandEvidenceField = (typeof BRAND_EVIDENCE_FIELDS)[number];

export const fieldEvidenceSchema = z.object({
  feld: z.enum(BRAND_EVIDENCE_FIELDS),
  status: evidenceStatusSchema,
  quellen: z.array(evidenceSourceSchema).max(6),
  hinweis: z.string().max(240).optional(),
});
export type FieldEvidence = z.infer<typeof fieldEvidenceSchema>;

export const cssColorEvidenceSchema = z.object({
  hex: z.string().regex(/^#[0-9a-f]{6}$/),
  anzahl: z.number().int().min(1),
  quelle: z.enum(["css", "theme-color"]),
  neutral: z.boolean(),
});
export type CssColorEvidence = z.infer<typeof cssColorEvidenceSchema>;

export const brandEvidenceReportSchema = z.object({
  version: z.literal(1),
  felder: z.array(fieldEvidenceSchema).max(BRAND_EVIDENCE_FIELDS.length),
  belegteFarben: z.array(cssColorEvidenceSchema).max(12),
});
export type BrandEvidenceReport = z.infer<typeof brandEvidenceReportSchema>;

/** Beleg einer erkannten Sorte (optional an `SuggestedBeerVariety`). */
export const productEvidenceSchema = z.object({
  status: z.enum(["belegt", "unbestaetigt"]),
  art: z.enum(EVIDENCE_SOURCE_KINDS).optional(),
  fundstelle: z.string().max(200).optional(),
  quelleUrl: z.string().max(1200).optional(),
});
export type ProductEvidence = z.infer<typeof productEvidenceSchema>;

/** Tolerantes Lesen (Altbestand, fremde Formate): ungültig → null statt Fehler. */
export function parseBrandEvidenceReport(value: unknown): BrandEvidenceReport | null {
  const parsed = brandEvidenceReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type EvidenceStrength = "stark" | "einfach" | "schwach" | "keine";

/**
 * Nachvollziehbare Stärke statt Prozentwert:
 * stark = vom Nutzer bestätigt oder ≥ 2 unabhängige Quellenarten, einfach = 1 Quellenart,
 * schwach = nur Schätzung, keine = nichts gefunden.
 */
export function evidenceStrength(evidence: Pick<FieldEvidence, "status" | "quellen">): EvidenceStrength {
  if (evidence.status === "bestaetigt") return "stark";
  if (evidence.status === "fehlt") return "keine";
  if (evidence.status === "geschaetzt") return "schwach";
  const kinds = new Set(evidence.quellen.filter((source) => source.art !== "ki_schaetzung").map((source) => source.art));
  return kinds.size >= 2 ? "stark" : kinds.size === 1 ? "einfach" : "schwach";
}

/** Darf das Merkmal als harte Vorgabe in die Bildgenerierung? Nur belegt oder vom Nutzer bestätigt. */
export function isHardEvidence(status: EvidenceStatus | undefined): boolean {
  return status === "belegt" || status === "bestaetigt";
}

/** Nur fürs Frontend: Produktbeleg tolerant lesen (Altbestand ohne Feld → undefined). */
export function parseProductEvidence(value: unknown): ProductEvidence | undefined {
  const parsed = productEvidenceSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
