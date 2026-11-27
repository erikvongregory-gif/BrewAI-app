import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { hasActiveSubscription } from "@/lib/billing/access";
import { ensureBillingRow, getBillingRow } from "@/lib/billing/store";
import { syncBillingFromStripe } from "@/lib/billing/stripeSync";

/**
 * Studio-Seiten: ohne Abo bzw. Guthaben zur Preisseite. Entschieden wird nur aus der DB.
 * Die Reparatur verpasster Stripe-Webhooks läuft per `after()` nach der Antwort statt im Render (A-6);
 * der nächste Aufruf sieht den reparierten Stand.
 */
export async function redirectUnlessStudioBilling(resource: Pick<User, "id" | "email">): Promise<void> {
  await ensureBillingRow(resource.id);
  const billing = await getBillingRow(resource.id);
  if (hasActiveSubscription(billing)) return;
  after(async () => {
    try {
      await syncBillingFromStripe({ userId: resource.id, userEmail: resource.email, currentRow: billing });
    } catch {
      /* Stripe optional */
    }
  });
  redirect("/dashboard/pricing");
}
