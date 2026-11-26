import type Stripe from "stripe";
import { setStripeCustomerId } from "@/lib/billing/store";
import { idempotencyKeyWithParams } from "@/lib/billing/checkoutIdempotency";

/**
 * Stellt sicher, dass die zurueckgegebene Stripe-Customer-ID im aktuell
 * konfigurierten Stripe-Konto/-Modus tatsaechlich existiert.
 *
 * Hintergrund: Eine in der DB gespeicherte `stripe_customer_id` kann ungueltig
 * werden, z. B. wenn sie im Test-Modus erstellt wurde, die App aber inzwischen
 * Live-Keys nutzt (oder umgekehrt), oder wenn der Customer in Stripe geloescht
 * wurde. In diesen Faellen wuerde Stripe `No such customer: 'cus_...'` werfen.
 *
 * Diese Funktion validiert die vorhandene ID und legt bei Bedarf einen neuen
 * Customer an, den sie zugleich in der DB persistiert.
 */
export async function resolveStripeCustomerId(args: {
  stripe: Stripe;
  userId: string;
  email?: string | null;
  existingCustomerId?: string | null;
}): Promise<string> {
  const { stripe, userId, email, existingCustomerId } = args;

  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (!customer.deleted) {
        return customer.id;
      }
    } catch (error) {
      if (!isResourceMissingError(error)) {
        throw error;
      }
      // resource_missing -> ID existiert im aktuellen Konto/Modus nicht: neu anlegen.
    }
  }

  const params = { email: email ?? undefined, metadata: { user_id: userId } };
  // Hash im Key: neue E-Mail innerhalb von 24 h ergibt einen neuen Key statt Stripes Parameter-Fehler.
  const customer = await stripe.customers.create(params, {
    idempotencyKey: idempotencyKeyWithParams(`customer:${userId}`, params),
  });
  await setStripeCustomerId(userId, customer.id);
  return customer.id;
}

function isResourceMissingError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; statusCode?: unknown };
  return candidate.code === "resource_missing" || candidate.statusCode === 404;
}
