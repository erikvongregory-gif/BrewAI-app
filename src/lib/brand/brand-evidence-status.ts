/**
 * Zod-freier Kern des Belegmodells (siehe ./brand-evidence-model). Client-Code wie das Dashboard
 * importiert von hier, damit zod (~105 KB) nicht ins First-Load-Bundle gelangt.
 */
export const EVIDENCE_STATUS = ["belegt", "geschaetzt", "fehlt", "bestaetigt"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUS)[number];

export const BRAND_EVIDENCE_FIELDS = ["breweryName", "brandTone", "brandColors", "brandDos", "brandDonts", "label"] as const;
export type BrandEvidenceField = (typeof BRAND_EVIDENCE_FIELDS)[number];

/** Darf das Merkmal als harte Vorgabe in die Bildgenerierung? Nur belegt oder vom Nutzer bestätigt. */
export function isHardEvidence(status: EvidenceStatus | undefined): boolean {
  return status === "belegt" || status === "bestaetigt";
}
