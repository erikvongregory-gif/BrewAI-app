import type { GenerationJob } from "@/lib/billing/generationJobs";

/**
 * Nach 24 h liefert kein Anbieter mehr ein Ergebnis. Solche Jobs blockierten
 * sonst dauerhaft die ersten Plätze im Reconcile-Lauf (je Lauf nur die 10
 * ältesten `reserved`-Jobs) und hielten Kunden-Tokens reserviert.
 */
export const STALE_PROVIDER_JOB_MS = 24 * 60 * 60 * 1000;

export const STALE_JOB_ERROR = "Zeitüberschreitung beim Anbieter; Reservierung freigegeben.";

/**
 * Mindestalter, bevor ein „Erfolg ohne Medien“ als endgültig gilt: Kurz nach dem
 * Statuswechsel kann das Ergebnisfeld beim Anbieter noch leer sein, und der
 * Studio-Worker kann noch laufen.
 */
export const EMPTY_SUCCESS_GRACE_MS = 15 * 60 * 1000;

export function isJobOlderThan(job: Pick<GenerationJob, "created_at">, ageMs: number, now = Date.now()): boolean {
  const created = job.created_at ? Date.parse(job.created_at) : Number.NaN;
  return Number.isFinite(created) && created < now - ageMs;
}

export function isStaleProviderJob(job: Pick<GenerationJob, "created_at">, now = Date.now()): boolean {
  return isJobOlderThan(job, STALE_PROVIDER_JOB_MS, now);
}

/** Bereits gelieferte Varianten (Fortschritt im Job) werden berechnet, der Rest wird freigegeben. */
export function staleJobCharge(job: Pick<GenerationJob, "amount" | "result">): number {
  const result = (job.result ?? {}) as Record<string, unknown>;
  const images = Array.isArray(result.images) ? result.images : [];
  const perVariant = Number(result.perVariantCost ?? 0);
  if (images.length === 0 || !Number.isFinite(perVariant) || perVariant <= 0) return 0;
  return Math.min(job.amount, images.length * perVariant);
}

/** Ergebnis-Payload für einen abgelaufenen Job: vorhandener Fortschritt bleibt erhalten. */
export function staleJobResult(
  job: Pick<GenerationJob, "result">,
  extra: Record<string, unknown>,
  charged: number,
): Record<string, unknown> {
  return {
    ...(job.result ?? {}),
    ...extra,
    phase: charged > 0 ? "partial" : "failed",
    ...(charged > 0 ? {} : { error: typeof extra.error === "string" && extra.error ? extra.error : STALE_JOB_ERROR }),
  };
}
