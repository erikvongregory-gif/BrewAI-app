import { NextResponse } from "next/server";
import { isOwnerUserId } from "@/lib/auth/owner";
import type { BillingRow } from "@/lib/billing/store";
import { ensureBillingRow, getBillingRow } from "@/lib/billing/store";

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "Bitte schließe zuerst ein Abo ab, um Bilder zu erstellen.";

/** Echtes Stripe-Abo (nicht Willkommensbonus). */
export function hasPaidSubscription(
  row: Pick<BillingRow, "plan" | "subscription_status" | "stripe_subscription_id"> | null | undefined,
): boolean {
  if (!row?.plan || !row.stripe_subscription_id) return false;
  return ["active", "trialing"].includes(row.subscription_status);
}

/**
 * Studio-Zugang: bezahltes Abo oder verbleibendes Bonus-/Token-Guthaben.
 * Fake-„Start active“ ohne Stripe und ohne Tokens zählt nicht.
 */
export function hasActiveSubscription(
  row: Pick<BillingRow, "plan" | "subscription_status" | "stripe_subscription_id" | "monthly_tokens" | "used_tokens"> | null | undefined,
): boolean {
  if (!row) return false;
  if (hasPaidSubscription(row)) return true;
  return row.monthly_tokens > row.used_tokens;
}

export { hasActiveSubscriptionFromState } from "./subscriptionState";

/** Plan-Key für Pricing/Summary — Bonus ohne Stripe liefert null. */
export function paidPlanFromBilling(
  row: Pick<BillingRow, "plan" | "subscription_status" | "stripe_subscription_id"> | null | undefined,
): BillingRow["plan"] {
  return hasPaidSubscription(row) ? row!.plan : null;
}

/** Server/API: 402 wenn kein Studio-Zugang. Owner-Konten sind ausgenommen. */
export async function requireActiveSubscription(userId: string): Promise<NextResponse | null> {
  if (await isOwnerUserId(userId)) return null;
  await ensureBillingRow(userId);
  const row = await getBillingRow(userId);
  if (!hasActiveSubscription(row)) {
    return NextResponse.json(
      { error: SUBSCRIPTION_REQUIRED_MESSAGE, code: "subscription_required" },
      { status: 402 },
    );
  }
  return null;
}
