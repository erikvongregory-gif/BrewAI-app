import { createHash } from "node:crypto";

/** Muss zu `expires_at default now()+interval '24 hours'` in docs/checkout-lock-migration.sql passen. */
const CHECKOUT_LOCK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Zustimmungszeitpunkt aus dem Checkout-Lock: bleibt für alle Versuche desselben Locks gleich,
 * damit Stripe einen Wiederholversuch als identische Anfrage erkennt.
 */
export function checkoutConsentTimestamp(lockExpiresAt: string | null | undefined, now = new Date()): string {
  const expires = lockExpiresAt ? Date.parse(lockExpiresAt) : Number.NaN;
  return Number.isFinite(expires) ? new Date(expires - CHECKOUT_LOCK_TTL_MS).toISOString() : now.toISOString();
}

/**
 * Gleicher Lock + gleiche Parameter → gleicher Key (Stripe liefert dieselbe Session, kein Doppel-Abo).
 * Ändert sich ein Parameter (z. B. Kunde neu angelegt), entsteht ein neuer Key statt Stripes
 * „Keys for idempotent requests can only be used with the same parameters“.
 */
export function checkoutIdempotencyKey(lockId: string, params: unknown): string {
  return idempotencyKeyWithParams(`checkout:${lockId}`, params);
}

/** Stripe-Idempotency-Key, der sich mit den Parametern ändert (gleiche Parameter → gleicher Key). */
export function idempotencyKeyWithParams(base: string, params: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 32);
  return `${base}:${digest}`;
}
